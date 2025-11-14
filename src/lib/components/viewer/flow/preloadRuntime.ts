/**
 * Preload Runtime
 * 超分执行与缓存运行时模块
 */

import { invoke } from '@tauri-apps/api/core';
import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';
import { upscaleState } from '$lib/stores/upscale/upscaleState.svelte';
import { settingsManager } from '$lib/settings/settingsManager';
import { get } from 'svelte/store';

export interface ImageDataWithHash {
	blob: Blob;
	hash: string;
}

export interface PerformUpscaleOptions {
	background?: boolean;
}

export interface PerformUpscaleResult {
	upscaledImageData?: string;
	upscaledImageBlob?: Blob;
	success?: boolean;
	error?: string;
}

/**
 * 获取自动超分开关状态
 */
export async function getAutoUpscaleEnabled(): Promise<boolean> {
	try {
		const settings = settingsManager.getSettings();
		return settings.image.enableSuperResolution || false;
	} catch (error) {
		console.warn('获取自动超分开关状态失败:', error);
		return false;
	}
}

/**
 * 执行超分处理
 */
export async function performUpscale(
	imageDataOrBlob: string | Blob, 
	imageHash: string, 
	options: PerformUpscaleOptions = {}
): Promise<PerformUpscaleResult> {
	try {
		console.log('执行超分处理，hash:', imageHash, 'background:', options.background);

		let imageDataArray: Uint8Array;
		
		// 兼容旧的数据URL格式和新的Blob格式
		if (imageDataOrBlob instanceof Blob) {
			const arrayBuffer = await imageDataOrBlob.arrayBuffer();
			imageDataArray = new Uint8Array(arrayBuffer);
		} else if (typeof imageDataOrBlob === 'string') {
			// 兼容旧的 data URL 格式
			if (!imageDataOrBlob.startsWith('data:')) {
				throw new Error('无效的图片数据格式，应为 data URL 或 Blob');
			}
			const response = await fetch(imageDataOrBlob);
			const blob = await response.blob();
			const arrayBuffer = await blob.arrayBuffer();
			imageDataArray = new Uint8Array(arrayBuffer);
		} else {
			throw new Error('performUpscale 接受 Blob 或 data URL 格式');
		}
		
		// 调用pyo3UpscaleManager进行超分处理
		const resultData = await pyo3UpscaleManager.upscaleImageMemory(imageDataArray);
		
		// 将结果转换为Blob和URL
		const resultBlob = new Blob([resultData], { type: 'image/webp' });
		const resultUrl = URL.createObjectURL(resultBlob);
		
		// 如果是后台任务，保存到缓存
		if (options.background) {
			try {
				await pyo3UpscaleManager.saveUpscaleCache(imageHash, resultData);
				console.log('后台超分结果已保存到缓存，hash:', imageHash);
			} catch (e) {
				console.warn('保存超分缓存失败:', e);
			}
		}
		
		// 触发超分完成事件
		window.dispatchEvent(new CustomEvent('upscale-complete', {
			detail: {
				imageData: resultUrl,
				imageBlob: resultBlob,
				originalImageHash: imageHash
			}
		}));
		
		return {
			upscaledImageData: resultUrl,
			upscaledImageBlob: resultBlob,
			success: true
		};
	} catch (error) {
		console.error('超分处理失败:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

/**
 * 触发自动超分
 */
export async function triggerAutoUpscale(
	imageDataWithHash: { blob: Blob; hash: string }, 
	isPreload = false
): Promise<PerformUpscaleResult | undefined> {
	try {
		// 验证图片数据
		if (!imageDataWithHash || !imageDataWithHash.blob) {
			console.error('自动超分：图片数据为空');
			return;
		}

		// 检查自动超分开关
		const autoUpscaleEnabled = await getAutoUpscaleEnabled();
		if (!autoUpscaleEnabled) {
			console.log('自动超分开关已关闭，跳过自动超分');
			return;
		}

		// 如果是预加载且有其他任务在进行，直接返回（worker会自动处理队列）
		if (isPreload) {
			const currentState = get(upscaleState);
			if (currentState?.isUpscaling) {
				// worker会自动处理队列，这里不需要手动管理
				return;
			}
		} else {
			// 当前页面的超分，检查是否正在超分
			const currentState = get(upscaleState);
			if (currentState?.isUpscaling) {
				console.log('超分正在进行中，跳过自动超分');
				return;
			}
		}

		const { blob: imageBlob, hash: imageHash } = imageDataWithHash;
		
		console.log(isPreload ? '触发预加载超分' : '触发当前页面超分', 'MD5:', imageHash, 
			`Blob size: ${imageBlob.size}`);
		
		// 触发超分开始事件
		window.dispatchEvent(new CustomEvent('upscale-start'));
		
		// 执行超分
		return await performUpscale(imageBlob, imageHash, { background: isPreload });
	} catch (error) {
		console.error('自动超分失败:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

/**
 * 检查超分缓存
 */
export async function checkUpscaleCache(
	imageDataWithHash: ImageDataWithHash, 
	preview: boolean = true
): Promise<boolean> {
	try {
		const { blob: imageBlob, hash: imageHash } = imageDataWithHash;
		
		// 如果没有 hash，则无法检查缓存
		if (!imageHash) {
			console.warn('checkUpscaleCache: 缺少 hash 数据');
			return false;
		}
		
		// 如果是空 Blob（仅用于检查哈希），跳过 Blob 相关处理
		if (imageBlob && imageBlob.size === 0) {
			console.log('checkUpscaleCache: 检测到空 Blob，仅使用 hash 进行缓存检查');
		}

		// 优先检查内存预加载缓存（preloadMemoryCache），减少导航时磁盘读取等待
		// 注意：这里不直接访问preloadMemoryCache，而是通过事件系统
		try {
			const cacheEvent = new CustomEvent('check-preload-cache', {
				detail: { imageHash, preview }
			});
			window.dispatchEvent(cacheEvent);
			
			// 等待可能的缓存命中结果
			await new Promise(resolve => setTimeout(resolve, 0));
		} catch (e) {
			console.warn('检查内存预加载缓存失败:', e);
		}
		
		// 获取当前活动的算法设置
		let currentAlgorithm = 'realcugan'; // 默认值
		try {
			// 从本地设置获取当前算法
			const settings = settingsManager.getSettings();
			currentAlgorithm = settings.image.superResolutionModel || 'realcugan';
		} catch (e) {
			console.warn('获取当前算法失败，使用默认值:', e);
		}
		
		// 优先检查当前算法的缓存
		const algorithms = [currentAlgorithm, 'realcugan', 'realesrgan', 'waifu2x'];

		// 读取 TTL（小时）设置，默认8小时
		let ttlHours = 8;
		try {
			const settings = settingsManager.getSettings();
			ttlHours = settings.performance.cacheMemorySize / 64 || ttlHours; // 简单计算
		} catch (e) {
			console.warn('读取缓存TTL失败，使用默认值', e);
		}
		const ttlSeconds = ttlHours * 3600;

		for (const algorithm of algorithms) {
			try {
				// 后端现在返回结构化的 metadata（path/mtime/size/algorithm），若未命中会抛出错误
				const meta: any = await invoke('check_upscale_cache_for_algorithm', {
					imageHash,
					algorithm,
					thumbnailPath: 'D:\\temp\\neoview_thumbnails_test',
					max_age_seconds: ttlSeconds
				});

				if (meta && meta.path) {
					try {
						// 懒加载二进制：仅在确认存在缓存时才读取文件字节
						const bytes = await invoke<number[]>('read_binary_file', { filePath: meta.path });
						const arr = new Uint8Array(bytes);
						const blob = new Blob([arr], { type: 'image/webp' });
						const url = URL.createObjectURL(blob);
						
						// 触发缓存命中事件
						window.dispatchEvent(new CustomEvent('cache-hit', {
							detail: {
								imageHash,
								url,
								blob,
								preview,
								algorithm: meta.algorithm || algorithm
							}
						}));
						
						console.log(`找到 ${meta.algorithm || algorithm} 算法的超分缓存，path: ${meta.path}`);
						return true;
					} catch (e) {
						console.error('读取缓存文件失败:', e);
						continue;
					}
				}
			} catch (e) {
				// 继续检查下一个算法
				continue;
			}
		}
		
		// 没有找到缓存
		console.log('未找到任何超分缓存，MD5:', imageHash);
		return false;
	} catch (error) {
		console.error('检查超分缓存失败:', error);
		return false;
	}
}

/**
 * 获取图片的MD5（只计算一次，后续使用缓存）
 * @deprecated 使用 calculateBlobHash 替代
 */
export async function getImageMd5(imageUrl: string, md5Cache = new Map<string, string>()): Promise<string | null> {
	console.warn('getImageMd5 is deprecated, use calculateBlobHash instead');
	return null;
}

/**
 * 创建带有MD5信息的图片数据结构
 */
export async function getImageDataWithHash(
	imageData: string | Blob, 
	md5Cache = new Map<string, string>()
): Promise<ImageDataWithHash | null> {
	if (!imageData) return null;
	
	let hash: string;
	let blob: Blob;
	let data: string | undefined;
	
	if (imageData instanceof Blob) {
		// 新的 Blob 格式
		blob = imageData;
		data = undefined;
		
		// 计算MD5
		const { invoke } = await import('@tauri-apps/api/core');
		const arrayBuffer = await blob.arrayBuffer();
		const bytes = new Uint8Array(arrayBuffer);
		
		try {
			hash = await invoke<string>('calculate_blob_md5', { 
				bytes: Array.from(bytes) 
			});
		} catch (error) {
			console.warn('后端 calculate_blob_md5 命令不可用，使用前端计算（SHA-256）:', error);
			// 临时回退到前端计算 SHA-256
			const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
		}
	} else if (typeof imageData === 'string') {
		// 兼容旧的 data URL 格式
		if (!imageData.startsWith('data:')) {
			console.warn('getImageDataWithHash: 无效的图片数据格式');
			return null;
		}
		
		data = imageData;
		
		// 计算 MD5（使用旧的 calculate_data_hash 命令）
		try {
			const { invoke } = await import('@tauri-apps/api/core');
			hash = await invoke<string>('calculate_data_hash', {
				dataUrl: data
			});
		} catch (error) {
			console.warn('calculate_data_hash 命令不可用，尝试转换为 Blob 计算:', error);
			// 回退方案：转换为 Blob 后计算
			const response = await fetch(data);
			blob = await response.blob();
			const arrayBuffer = await blob.arrayBuffer();
			const bytes = new Uint8Array(arrayBuffer);
			
			try {
				hash = await invoke<string>('calculate_blob_md5', { 
					bytes: Array.from(bytes) 
				});
			} catch (e) {
				// 最后回退到前端计算
				const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
				const hashArray = Array.from(new Uint8Array(hashBuffer));
				hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
			}
		}
		
		// 如果还没有 blob，从 data URL 创建
		if (!blob) {
			const response = await fetch(data);
			blob = await response.blob();
		}
	} else {
		console.warn('getImageDataWithHash: 不支持的图片数据类型');
		return null;
	}
	
	if (!hash) return null;
	
	return {
		data,
		blob,
		hash
	};
}