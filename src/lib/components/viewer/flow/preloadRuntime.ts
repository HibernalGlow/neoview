/**
 * Preload Runtime
 * 超分执行与缓存运行时模块
 */

import { invoke } from '@tauri-apps/api/core';
import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';
import { upscaleState, startUpscale, updateUpscaleProgress, completeUpscale, setUpscaleError } from '$lib/stores/upscale/upscaleState.svelte';
import { settingsManager } from '$lib/settings/settingsManager';
import { loadUpscalePanelSettings } from '$lib/components/panels/UpscalePanel';
import { bookStore } from '$lib/stores/book.svelte';

export interface ImageDataWithHash {
	data?: string;  // 兼容旧的 data URL 格式
	blob?: Blob;   // 新的 Blob 格式
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
		const panelSettings = loadUpscalePanelSettings();
		if (typeof panelSettings.autoUpscaleEnabled === 'boolean') {
			console.log('从 UpscalePanel 持久化读取自动超分开关:', panelSettings.autoUpscaleEnabled);
			return panelSettings.autoUpscaleEnabled;
		}
	} catch (error) {
		console.warn('从 UpscalePanel 持久化读取自动超分开关失败，回退到 settingsManager:', error);
	}

	try {
		const settings = settingsManager.getSettings();
		const value = settings.image.enableSuperResolution || false;
		console.log('从 settingsManager 读取自动超分开关:', value);
		return value;
	} catch (error) {
		console.warn('获取自动超分开关状态失败:', error);
		return false;
	}
}

/**
 * 执行超分处理
 */
export async function performUpscale(
	imageBlob: Blob, 
	imageHash: string, 
	options: PerformUpscaleOptions = {}
): Promise<PerformUpscaleResult> {
	try {
		console.log('执行超分处理，hash:', imageHash, 'background:', options.background);

		// 只接受 Blob 格式
		if (!(imageBlob instanceof Blob)) {
			throw new Error('performUpscale 只接受 Blob 格式');
		}

		const arrayBuffer = await imageBlob.arrayBuffer();
		const imageDataArray = new Uint8Array(arrayBuffer);
		
		// 确定是否为后台任务
		const isBackground = options.background || false;
		
		// 触发超分开始事件
		if (!isBackground) {
			startUpscale(imageHash, 'manual', '正在处理图片');
		}
		
		// 更新进度 - 开始阶段
		updateUpscaleProgress(10, '准备超分模型');
		
		// 调用pyo3UpscaleManager进行超分处理
		updateUpscaleProgress(30, '执行超分处理');
		const resultData = await pyo3UpscaleManager.upscaleImageMemory(imageDataArray);
		
		// 更新进度 - 完成阶段
		updateUpscaleProgress(80, '生成结果图片');
		
		// 将结果转换为Blob和URL
		const resultBlob = new Blob([resultData], { type: 'image/webp' });
		const resultUrl = URL.createObjectURL(resultBlob);
		
		// 如果是后台任务，保存到缓存
		if (isBackground) {
			try {
				await pyo3UpscaleManager.saveUpscaleCache(imageHash, resultData);
				console.log('后台超分结果已保存到缓存，hash:', imageHash);
			} catch (e) {
				console.warn('保存超分缓存失败:', e);
			}
		}
		
		// 更新当前页面状态（如果不是后台任务）
		if (!isBackground) {
			const currentPageIndex = bookStore.currentPageIndex;
			bookStore.setPageUpscaleStatus(currentPageIndex, 'done');
		}
		
		// 触发超分完成事件
		window.dispatchEvent(new CustomEvent('upscale-complete', {
			detail: {
				imageData: resultUrl,
				imageBlob: resultBlob,
				originalImageHash: imageHash,
				background: isBackground
			}
		}));
		
		// 完成超分
		if (!isBackground) {
			completeUpscale();
		}
		
		return {
			upscaledImageData: resultUrl,
			upscaledImageBlob: resultBlob,
			success: true
		};
	} catch (error) {
		console.error('超分处理失败:', error);
		
		// 设置错误状态（仅对非后台任务）
		if (!options.background) {
			setUpscaleError(error instanceof Error ? error.message : String(error));
		}
		
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
			if (upscaleState.isUpscaling) {
				// worker会自动处理队列，这里不需要手动管理
				return;
			}
		} else {
			// 当前页面的超分，检查是否正在超分
			if (upscaleState.isUpscaling) {
				console.log('超分正在进行中，跳过自动超分');
				return;
			}
		}

		const { blob: imageBlob, hash: imageHash } = imageDataWithHash;
		
		console.log(isPreload ? '触发预加载超分' : '触发当前页面超分', 'MD5:', imageHash, 
			`Blob size: ${imageBlob.size}`);
		
		// 触发超分开始事件（仅对非预加载任务）
		if (!isPreload) {
			startUpscale(imageHash, 'auto', '自动超分中');
		}
		
		// 执行超分
		return await performUpscale(imageBlob, imageHash, { background: isPreload });
	} catch (error) {
		console.error('自动超分失败:', error);
		
		// 设置错误状态（仅对非预加载任务）
		if (!isPreload) {
			setUpscaleError(error instanceof Error ? error.message : String(error));
		}
		
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
		
		// 读取 TTL（小时）设置，默认8小时
		let ttlHours = 8;
		try {
			const settings = settingsManager.getSettings();
			ttlHours = settings.performance.cacheMemorySize / 64 || ttlHours; // 简单计算
		} catch (e) {
			console.warn('读取缓存TTL失败，使用默认值', e);
		}
		const ttlSeconds = ttlHours * 3600;

		try {
			// 直接检查 hash 是否有缓存，不依赖算法匹配
			const meta: any = await invoke('check_upscale_cache', {
				imageHash,
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
							algorithm: meta.algorithm || 'unknown'
						}
					}));
					
					console.log(`找到超分缓存，path: ${meta.path}, algorithm: ${meta.algorithm || 'unknown'}`);
					return true;
				} catch (e) {
					console.error('读取缓存文件失败:', e);
				}
			}
		} catch (e) {
			// 缓存未找到
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
	imageBlob: Blob, 
	md5Cache = new Map<string, string>()
): Promise<ImageDataWithHash | null> {
	if (!imageBlob) return null;
	
	// 只接受 Blob 格式
	if (!(imageBlob instanceof Blob)) {
		console.warn('getImageDataWithHash: 只接受 Blob 格式');
		return null;
	}
	
	// 计算MD5
	const { invoke } = await import('@tauri-apps/api/core');
	const arrayBuffer = await imageBlob.arrayBuffer();
	const bytes = new Uint8Array(arrayBuffer);
	let hash: string;
	
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
	
	if (!hash) return null;
	
	return {
		blob: imageBlob,
		hash
	};
}