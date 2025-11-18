/**
 * Preload Runtime
 * 超分执行与缓存运行时模块
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { upscaleState, startUpscale, completeUpscale, setUpscaleError } from '$lib/stores/upscale/upscaleState.svelte';
import { settingsManager } from '$lib/settings/settingsManager';
import { loadUpscalePanelSettings } from '$lib/components/panels/UpscalePanel';
import type { UpscaleCondition } from '$lib/components/panels/UpscalePanel';
import { collectPageMetadata, evaluateConditions } from '$lib/utils/upscale/conditions';
import { bookStore } from '$lib/stores/book.svelte';
import { taskScheduler } from '$lib/core/tasks/taskScheduler';

export interface ImageDataWithHash {
	data?: string; // 兼容旧的 data URL 格式
	blob?: Blob; // 新的 Blob 格式
	hash: string;
	conditionId?: string; // 关联的条件ID
	pageIndex?: number; // 关联页面索引（用于事件派发）
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

interface SchedulerJobInput {
	blob: Blob;
	hash: string;
	pageIndex: number;
	conditionId?: string;
	priority: 'high' | 'normal';
	origin: 'current' | 'preload' | 'manual';
	background: boolean;
}

export interface SchedulerModelSettings {
	modelName: string;
	scale: number;
	tileSize: number;
	noiseLevel: number;
	gpuId?: number;
}

interface UpscaleJobEventDetail {
	job_id: string;
	status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
	book_id?: string | null;
	book_path?: string | null;
	page_index: number;
	image_hash: string;
	origin: 'current' | 'preload' | 'manual';
	priority: 'high' | 'normal';
	condition_id?: string | null;
	error?: string | null;
	cache_path?: string | null;
	result_data?: number[] | null;
	background: boolean;
}

export function resolveModelSettings(conditionId?: string): SchedulerModelSettings | null {
	const panelSettings = loadUpscalePanelSettings();
	if (conditionId) {
		const condition = panelSettings.conditionsList.find((c) => c.id === conditionId);
		if (condition) {
			if (condition.action.skip) {
				return null;
			}
			return {
				modelName: condition.action.model,
				scale: condition.action.scale,
				tileSize: condition.action.tileSize,
				noiseLevel: condition.action.noiseLevel,
				gpuId: condition.action.gpuId
			};
		}
	}

			return {
		modelName: panelSettings.selectedModel,
		scale: panelSettings.scale,
		tileSize: panelSettings.tileSize,
		noiseLevel: panelSettings.noiseLevel,
		gpuId: panelSettings.gpuId
	};
}

function ensureConditionBinding(imageData: ImageDataWithHash): { conditionId?: string; skip: boolean } {
	const book = bookStore.currentBook;
	const panelSettings = loadUpscalePanelSettings();
	const pageIndex = imageData.pageIndex ?? bookStore.currentPageIndex;

	if (!book || typeof pageIndex !== 'number') {
		return { conditionId: imageData.conditionId, skip: false };
	}

	let condition: UpscaleCondition | undefined;
	if (imageData.conditionId) {
		condition = panelSettings.conditionsList.find((c) => c.id === imageData.conditionId);
	}

	if (!condition) {
		const page = book.pages?.[pageIndex];
		if (!page) {
			return { conditionId: undefined, skip: false };
		}
		const metadata = collectPageMetadata(page, book.path);
		const result = evaluateConditions(metadata, panelSettings.conditionsList);
		imageData.conditionId = result.conditionId ?? undefined;
		if (result.action?.skip) {
			return { conditionId: imageData.conditionId, skip: true };
		}
		if (result.conditionId) {
			condition = panelSettings.conditionsList.find((c) => c.id === result.conditionId);
		}
	}

	return {
		conditionId: condition?.id ?? imageData.conditionId,
		skip: condition?.action.skip === true
	};
}

async function submitSchedulerJob(input: SchedulerJobInput): Promise<string | undefined> {
	const { blob, hash, pageIndex, conditionId, priority, origin, background } = input;
	const book = bookStore.currentBook;
	if (!book) {
		console.warn('submitSchedulerJob: 没有当前书籍，跳过任务');
		return;
	}

	const modelSettings = resolveModelSettings(conditionId);
	if (!modelSettings) {
		console.log('条件要求跳过超分任务，hash:', hash, 'conditionId:', conditionId);
		bookStore.setPageUpscaleStatus(pageIndex, 'none');
		return;
	}
	const buffer = await blob.arrayBuffer();
	const imageDataArray = Array.from(new Uint8Array(buffer));

	try {
		const jobId = await invoke<string>('enqueue_upscale_job', {
			job: {
				book_id: book.path ?? null,
				book_path: book.path ?? null,
				page_index: pageIndex,
				image_hash: hash,
				image_data: imageDataArray,
				priority,
				origin,
				condition_id: conditionId ?? null,
				model_name: modelSettings.modelName,
				scale: modelSettings.scale,
				tile_size: modelSettings.tileSize,
				noise_level: modelSettings.noiseLevel,
				gpu_id: modelSettings.gpuId ?? null,
				allow_cache: true,
				background
			}
		});
		return jobId;
	} catch (error) {
		console.error('提交调度任务失败:', error);
		throw error;
	}
}

function convertResultToBlob(resultData: number[] | Uint8Array): { blob: Blob; url: string } {
	const uint8 = resultData instanceof Uint8Array ? resultData : Uint8Array.from(resultData);
	const safeBuffer = new ArrayBuffer(uint8.byteLength);
	new Uint8Array(safeBuffer).set(uint8);
	const blob = new Blob([safeBuffer], { type: 'image/webp' });
	const url = URL.createObjectURL(blob);
	return { blob, url };
}

export interface PreloadBatchJobInput {
	pageIndex: number;
	imageHash: string;
	conditionId?: string;
	priority?: 'high' | 'normal';
}

interface PreloadBatchJobPayload {
	page_index: number;
	image_hash: string;
	condition_id?: string | null;
	model_name: string;
	scale: number;
	tile_size: number;
	noise_level: number;
	gpu_id?: number | null;
	priority?: 'high' | 'normal';
}

export async function enqueuePreloadBatchJobs(
	bookPath: string,
	jobs: PreloadBatchJobInput[]
): Promise<string[]> {
	if (!jobs.length) {
		return [];
	}

	const payload: PreloadBatchJobPayload[] = [];
	for (const job of jobs) {
		const model = resolveModelSettings(job.conditionId);
		if (!model) {
			console.log('批量预超分: 条件要求跳过任务, hash:', job.imageHash, 'conditionId:', job.conditionId);
			continue;
		}
		payload.push({
			page_index: job.pageIndex,
			image_hash: job.imageHash,
			condition_id: job.conditionId ?? null,
			model_name: model.modelName,
			scale: model.scale,
			tile_size: model.tileSize,
			noise_level: model.noiseLevel,
			gpu_id: model.gpuId ?? null,
			priority: job.priority ?? 'normal'
		});
	}

	if (!payload.length) {
		return [];
	}

	return invoke<string[]>('enqueue_preload_batch', {
		payload: {
			book_path: bookPath,
			jobs: payload
		}
	});
}

function handleSchedulerEvent(detail: UpscaleJobEventDetail) {
	const activeBookPath = bookStore.currentBook?.path;
	if (
		detail.book_path &&
		activeBookPath &&
		detail.book_path !== activeBookPath
	) {
		console.log(
			'忽略不同书籍的超分事件:',
			detail.book_path,
			'当前书籍:',
			activeBookPath
		);
		return;
	}

	const pageIndex = detail.page_index;
	const imageHash = detail.image_hash;
	const status = detail.status;

	if (status === 'queued') {
		return;
	}

	if (status === 'running') {
		if (detail.origin === 'current' && !detail.background) {
			startUpscale(imageHash, 'auto', '自动超分中');
		}
		bookStore.setPageUpscaleStatus(pageIndex, detail.background ? 'preupscaled' : 'none');
		return;
	}

	if (status === 'failed') {
		bookStore.setPageUpscaleStatus(pageIndex, 'failed');
		if (!detail.background) {
			setUpscaleError(detail.error ?? '超分失败');
		}
		return;
	}

	if (status === 'cancelled') {
		bookStore.setPageUpscaleStatus(pageIndex, 'none');
		return;
	}

	if (status === 'completed' && detail.result_data) {
		const { blob, url } = convertResultToBlob(detail.result_data);
		bookStore.setPageUpscaleStatus(pageIndex, detail.background ? 'preupscaled' : 'done');
		window.dispatchEvent(
			new CustomEvent('upscale-complete', {
				detail: {
					imageData: url,
					imageBlob: blob,
					originalImageHash: imageHash,
					background: detail.background,
					pageIndex,
					conditionId: detail.condition_id ?? undefined,
					writeToMemoryCache: true
				}
			})
		);
		if (!detail.background) {
			completeUpscale();
		}
	}
}

let schedulerUnlisten: UnlistenFn | null = null;
async function ensureSchedulerListener() {
	if (schedulerUnlisten || typeof window === 'undefined') {
		return;
	}
	try {
		schedulerUnlisten = await listen<UpscaleJobEventDetail>('upscale-job-event', (event) => {
			handleSchedulerEvent(event.payload);
		});
	} catch (error) {
		console.error('监听调度事件失败:', error);
	}
}

void ensureSchedulerListener();

/**
 * 触发自动超分
 */
export async function triggerAutoUpscale(
	imageDataWithHash: ImageDataWithHash,
	isPreload = false
): Promise<void> {
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

		const { blob: imageBlob, hash: imageHash } = imageDataWithHash;
		const targetPageIndex = typeof imageDataWithHash.pageIndex === 'number'
			? imageDataWithHash.pageIndex
			: bookStore.currentPageIndex;
		
		if (await isGifBlob(imageBlob)) {
			console.log('检测到 GIF，跳过自动超分:', imageHash);
			return;
		}

		const conditionBinding = ensureConditionBinding(imageDataWithHash);
		if (conditionBinding.skip) {
			console.log('条件指定跳过超分，hash:', imageHash, 'conditionId:', conditionBinding.conditionId);
			bookStore.setPageUpscaleStatus(targetPageIndex, 'none');
			return;
		}

		console.log(
			isPreload ? '触发预加载超分' : '触发当前页面超分',
			'MD5:',
			imageHash,
			`Blob size: ${imageBlob.size}`,
			'conditionId:',
			imageDataWithHash.conditionId
		);

		// 中文注释：通过任务调度器统一管理自动超分任务，避免并发冲突
		taskScheduler.enqueue({
			type: isPreload ? 'auto-upscale-preload' : 'auto-upscale-current',
			priority: isPreload ? 'normal' : 'high',
			bucket: isPreload ? 'forward' : 'current',
			source: isPreload ? 'preload-runtime' : 'image-viewer',
			pageIndices: [targetPageIndex],
			executor: async () => {
				if (!isPreload && upscaleState.isUpscaling) {
					console.log('超分正在进行中，跳过当前页面自动超分');
					return;
				}
				await submitSchedulerJob({
					blob: imageBlob,
					hash: imageHash,
					pageIndex: targetPageIndex,
					conditionId: imageDataWithHash.conditionId,
					priority: isPreload ? 'normal' : 'high',
					origin: isPreload ? 'preload' : 'current',
					background: isPreload
				});
			}
		});
	} catch (error) {
		console.error('自动超分失败:', error);
		
		setUpscaleError(error instanceof Error ? error.message : String(error));
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
			const model = resolveModelSettings(imageDataWithHash.conditionId);
			if (!model) {
				console.log('条件要求跳过超分，不检查缓存，hash:', imageHash);
				return false;
			}

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
				if (arr.length === 0) {
					console.warn('检查 PyO3 磁盘缓存失败：文件为空，忽略', cachePath);
					return false;
				}
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