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
	conditionId?: string;  // 关联的条件ID
}

export interface PerformUpscaleOptions {
	background?: boolean;
	skipStateUpdate?: boolean; // 跳过状态更新（由调用方管理）
	conditionId?: string; // 关联的条件ID
}

export interface PerformUpscaleResult {
	upscaledImageData?: string;
	upscaledImageBlob?: Blob;
	success?: boolean;
	error?: string;
}

/**
 * 检测 Blob 是否为 GIF（类型或文件头）
 */
async function isGifBlob(blob?: Blob | null): Promise<boolean> {
	if (!blob) return false;
	const mime = blob.type?.toLowerCase() || '';
	if (mime.includes('image/gif')) return true;
	console.log('检测到 GIF Blob:');

	if (blob.size < 6) return false;

	try {
		const headerBuffer = await blob.slice(0, 6).arrayBuffer();
		const headerBytes = new Uint8Array(headerBuffer);
		const signature = String.fromCharCode(...headerBytes);
		return signature === 'GIF87a' || signature === 'GIF89a';
	} catch (error) {
		console.warn('检测 GIF Blob 失败，默认视为非 GIF:', error);
		return false;
	}
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
		
		// GIF 直接跳过
		if (await isGifBlob(imageBlob)) {
			console.log('检测到 GIF，跳过超分处理:', imageHash);
			return {
				success: false,
				error: 'GIF images are skipped for super-resolution'
			};
		}

		// 只有在直接手动调用且非后台任务时才触发状态更新
		// 自动超分由 triggerAutoUpscale 负责状态管理
		if (!isBackground && !options.skipStateUpdate) {
			startUpscale(imageHash, 'manual', '正在处理图片');
		}
		
		// 更新进度 - 开始阶段
		updateUpscaleProgress(10, '准备超分模型');
		
		// 根据条件ID设置模型参数
		if (options.conditionId) {
			const panelSettings = await import('$lib/components/panels/UpscalePanel').then(m => m.loadUpscalePanelSettings());
			const condition = panelSettings.conditionsList.find(c => c.id === options.conditionId);
			if (condition) {
				console.log('应用条件参数:', condition.name, condition.action);
				// 设置模型参数
				await pyo3UpscaleManager.setModel(condition.action.model, condition.action.scale);
				await pyo3UpscaleManager.setTileSize(condition.action.tileSize);
				await pyo3UpscaleManager.setNoiseLevel(condition.action.noiseLevel);
				await pyo3UpscaleManager.setGpuId(condition.action.gpuId);
			}
		}
		
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
		
		// 注意：页面状态更新由 ImageViewer 的 onUpscaleComplete 事件处理
		// 这里不再重复设置，避免冗余
		
		// 触发超分完成事件，携带会话ID和条件ID
		const eventDetail = {
			imageData: resultUrl,
			imageBlob: resultBlob,
			originalImageHash: imageHash,
			background: isBackground,
			conditionId: options.conditionId
		};
		
		// 非后台任务时，额外写入内存缓存（通过事件传递给 ImageLoader）
		if (!isBackground) {
			eventDetail['writeToMemoryCache'] = true;
		}
		
		window.dispatchEvent(new CustomEvent('upscale-complete', { detail: eventDetail }));
		
		// 完成超分（非后台任务都需要更新状态）
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
		
		// 设置错误状态（非后台任务都需要更新状态）
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
	imageDataWithHash: { blob: Blob; hash: string; conditionId?: string }, 
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
		
		if (await isGifBlob(imageBlob)) {
			console.log('检测到 GIF，跳过自动超分:', imageHash);
			return;
		}

		console.log(isPreload ? '触发预加载超分' : '触发当前页面超分', 'MD5:', imageHash, 
			`Blob size: ${imageBlob.size}`, 'conditionId:', imageDataWithHash.conditionId);
		
		// 触发超分开始事件（仅对非预加载任务）
		if (!isPreload) {
			startUpscale(imageHash, 'auto', '自动超分中');
		}
		
		// 执行超分，skipStateUpdate 防止重复调用 startUpscale
		return await performUpscale(imageBlob, imageHash, { 
			background: isPreload,
			skipStateUpdate: !isPreload, // 非预加载任务跳过 startUpscale，但保留 completeUpscale
			conditionId: imageDataWithHash.conditionId
		});
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
		
		// 读取 TTL（小时）设置，默认8小时
		let ttlHours = 8;
		try {
			const settings = settingsManager.getSettings();
			ttlHours = settings.performance.cacheMemorySize / 64 || ttlHours; // 简单计算
		} catch (e) {
			console.warn('读取缓存TTL失败，使用默认值', e);
		}
		const ttlSeconds = ttlHours * 3600;

		// 2. 磁盘缓存（改用 PyO3 的命令）
		try {
			const model = pyo3UpscaleManager.currentModel;

			const cachePath = await invoke<string | null>('check_pyo3_upscale_cache', {
				imageHash,
				modelName: model.modelName,
				scale: model.scale,
				tileSize: model.tileSize,
				noiseLevel: model.noiseLevel
			});

			if (cachePath) {
				// 读文件 → Blob
				const bytes = await invoke<number[]>('read_binary_file', { filePath: cachePath });
				const arr = new Uint8Array(bytes);
				const blob = new Blob([arr], { type: 'image/webp' });
				const url = URL.createObjectURL(blob);

				// 通知预加载管理器 & Viewer
				window.dispatchEvent(new CustomEvent('cache-hit', {
					detail: {
						imageHash,
						url,
						blob,
						preview,
						algorithm: model.modelName   // 可选
					}
				}));

				console.log(`找到 PyO3 超分缓存，path: ${cachePath}`);
				return true;
			}
		} catch (e) {
			console.warn('检查 PyO3 磁盘缓存失败:', e);
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
 * 创建带有路径哈希信息的图片数据结构
 * @deprecated 使用 getStableImageHash 替代
 */
export async function getImageDataWithHash(
	imageBlob: Blob, 
	// 保留 md5Cache 参数以兼容现有调用，但不再使用
	md5Cache = new Map<string, string>()
): Promise<ImageDataWithHash | null> {
	if (!imageBlob) return null;
	
	// 只接受 Blob 格式
	if (!(imageBlob instanceof Blob)) {
		console.warn('getImageDataWithHash: 只接受 Blob 格式');
		return null;
	}
	
	console.warn('getImageDataWithHash 已弃用，请使用 getStableImageHash');
	
	// 回退到旧的实现（如果需要的话）
	const arrayBuffer = await imageBlob.arrayBuffer();
	const bytes = new Uint8Array(arrayBuffer);
	const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
	
	return { blob: imageBlob, hash };
}