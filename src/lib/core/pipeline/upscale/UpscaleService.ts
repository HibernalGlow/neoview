/**
 * 超分服务模块
 * 管理预超分任务调度和执行
 * 参考 NeeView SuperResolutionService 设计
 */

import { invoke } from '@tauri-apps/api/core';
import { getJobEngine, PageContentJobCommand } from '../job/JobEngine';
import { getCacheManager } from '../cache/CacheManager';
import { 
	type UpscaleConfig, 
	type UpscaleTask, 
	type UpscaleResult,
	UpscaleState,
	JobCategory,
	JobPriority,
	generateId
} from '../types';

/** 超分服务配置 */
export interface UpscaleServiceConfig {
	maxConcurrent: number;        // 最大并发数
	cacheEnabled: boolean;        // 启用缓存
	diskCacheEnabled: boolean;    // 启用磁盘缓存
	autoUpscaleEnabled: boolean;  // 自动超分开关
	defaultConfig: UpscaleConfig; // 默认超分配置
}

/** 超分任务回调 */
export type UpscaleCallback = (
	result: Blob | null,
	status: UpscaleState,
	processingTime: number
) => void;

/** 超分事件 */
export interface UpscaleEvent {
	type: 'start' | 'progress' | 'complete' | 'error' | 'cancelled';
	taskId: string;
	pageIndex?: number;
	originalHash?: string;
	progress?: number;
	result?: UpscaleResult;
	error?: string;
}

/** 超分事件监听器 */
export type UpscaleEventListener = (event: UpscaleEvent) => void;

/**
 * 超分服务
 */
export class UpscaleService {
	private static instance: UpscaleService | null = null;
	
	private config: UpscaleServiceConfig;
	private tasks = new Map<string, UpscaleTask>();
	private pendingTasks = new Set<string>(); // hash 去重
	private processingCount = 0;
	private eventListeners: UpscaleEventListener[] = [];
	private initialized = false;
	private disposed = false;

	private constructor(config?: Partial<UpscaleServiceConfig>) {
		this.config = {
			maxConcurrent: 2,
			cacheEnabled: true,
			diskCacheEnabled: true,
			autoUpscaleEnabled: true,
			defaultConfig: {
				modelName: '2x_MangaJaNai_1200p_V1_ESRGAN_70k',
				scaleFactor: 2,
				tileSize: 256,
				noiseLevel: 0,
				useTTA: false,
				gpuId: 0
			},
			...config
		};
	}

	/** 获取单例 */
	static getInstance(config?: Partial<UpscaleServiceConfig>): UpscaleService {
		if (!UpscaleService.instance) {
			UpscaleService.instance = new UpscaleService(config);
		}
		return UpscaleService.instance;
	}

	/** 重置单例 */
	static resetInstance(): void {
		if (UpscaleService.instance) {
			UpscaleService.instance.dispose();
			UpscaleService.instance = null;
		}
	}

	/** 初始化服务 */
	async initialize(gpuId?: number): Promise<boolean> {
		if (this.initialized) return true;
		
		try {
			// 初始化超分引擎
			await invoke('init_upscale_engine', {
				gpuId: gpuId ?? this.config.defaultConfig.gpuId
			});
			this.initialized = true;
			return true;
		} catch (error) {
			console.error('Failed to initialize upscale engine:', error);
			return false;
		}
	}

	/** 是否可用 */
	get isAvailable(): boolean {
		return this.initialized && this.config.autoUpscaleEnabled;
	}

	/** 更新配置 */
	updateConfig(config: Partial<UpscaleServiceConfig>): void {
		Object.assign(this.config, config);
	}

	/** 检查缓存 */
	async checkCache(originalHash: string): Promise<boolean> {
		// 1. 检查内存缓存
		const cacheManager = getCacheManager();
		if (cacheManager.hasUpscale(originalHash)) {
			return true;
		}

		// 2. 检查磁盘缓存
		if (this.config.diskCacheEnabled) {
			try {
				const hasDiskCache = await invoke<boolean>('check_upscale_cache', {
					hash: originalHash
				});
				return hasDiskCache;
			} catch {
				return false;
			}
		}

		return false;
	}

	/** 从缓存加载 */
	async loadFromCache(originalHash: string): Promise<UpscaleResult | null> {
		// 1. 尝试内存缓存
		const cacheManager = getCacheManager();
		const memoryEntry = cacheManager.getUpscale(originalHash);
		if (memoryEntry) {
			return {
				success: true,
				outputBlob: memoryEntry.blob,
				outputUrl: memoryEntry.objectUrl,
				processingTime: 0
			};
		}

		// 2. 尝试磁盘缓存
		if (this.config.diskCacheEnabled) {
			try {
				const base64Data = await invoke<string | null>('load_upscale_cache', {
					hash: originalHash
				});
				
				if (base64Data) {
					const response = await fetch(base64Data);
					const blob = await response.blob();
					
					// 加载到内存缓存
					const objectUrl = cacheManager.setUpscale(
						originalHash,
						blob,
						this.config.defaultConfig.modelName,
						this.config.defaultConfig.scaleFactor
					);
					
					return {
						success: true,
						outputBlob: blob,
						outputUrl: objectUrl,
						processingTime: 0
					};
				}
			} catch (error) {
				console.error('Failed to load from disk cache:', error);
			}
		}

		return null;
	}

	/** 提交超分任务 */
	async submitTask(
		pageIndex: number,
		originalHash: string,
		inputBlob: Blob,
		config?: Partial<UpscaleConfig>,
		priority: JobPriority = JobPriority.Normal
	): Promise<string> {
		// 去重检查
		if (this.pendingTasks.has(originalHash)) {
			const existingTask = Array.from(this.tasks.values())
				.find(t => t.originalHash === originalHash);
			return existingTask?.id ?? '';
		}

		const taskId = generateId();
		const taskConfig: UpscaleConfig = {
			...this.config.defaultConfig,
			...config
		};

		const task: UpscaleTask = {
			id: taskId,
			pageIndex,
			originalHash,
			config: taskConfig,
			priority,
			status: UpscaleState.Pending,
			progress: 0,
			inputBlob
		};

		this.tasks.set(taskId, task);
		this.pendingTasks.add(originalHash);

		// 提交到作业系统
		this.scheduleTask(task);

		return taskId;
	}

	/** 调度任务 */
	private scheduleTask(task: UpscaleTask): void {
		const jobEngine = getJobEngine();
		
		jobEngine.submitJob(
			JobCategory.Upscale,
			task.priority,
			new PageContentJobCommand(async (signal) => {
				await this.executeTask(task, signal);
			}),
			{
				pageIndex: task.pageIndex
			}
		);
	}

	/** 执行超分任务 */
	private async executeTask(task: UpscaleTask, signal: AbortSignal): Promise<void> {
		if (signal.aborted) {
			this.updateTaskStatus(task.id, UpscaleState.Failed, 'Cancelled');
			return;
		}

		try {
			// 检查并发限制
			while (this.processingCount >= this.config.maxConcurrent) {
				await this.sleep(100);
				if (signal.aborted) {
					this.updateTaskStatus(task.id, UpscaleState.Failed, 'Cancelled');
					return;
				}
			}

			this.processingCount++;
			this.updateTaskStatus(task.id, UpscaleState.Processing);
			this.emitEvent({ type: 'start', taskId: task.id, pageIndex: task.pageIndex });

			const startTime = Date.now();

			// 转换 Blob 为字节数组
			const arrayBuffer = await task.inputBlob!.arrayBuffer();
			const inputBytes = Array.from(new Uint8Array(arrayBuffer));

			// 调用后端超分
			const outputBase64 = await invoke<string>('upscale_image', {
				inputBytes,
				modelName: task.config.modelName,
				scaleFactor: task.config.scaleFactor,
				tileSize: task.config.tileSize,
				noiseLevel: task.config.noiseLevel
			});

			if (signal.aborted) {
				this.updateTaskStatus(task.id, UpscaleState.Failed, 'Cancelled');
				return;
			}

			// 转换结果
			const response = await fetch(outputBase64);
			const outputBlob = await response.blob();

			const processingTime = Date.now() - startTime;

			// 保存到缓存
			const cacheManager = getCacheManager();
			const objectUrl = cacheManager.setUpscale(
				task.originalHash,
				outputBlob,
				task.config.modelName,
				task.config.scaleFactor,
				task.pageIndex
			);

			// 保存到磁盘缓存
			if (this.config.diskCacheEnabled) {
				try {
					await invoke('save_upscale_cache', {
						hash: task.originalHash,
						data: outputBase64
					});
				} catch (error) {
					console.warn('Failed to save to disk cache:', error);
				}
			}

			// 更新任务状态
			task.outputBlob = outputBlob;
			task.status = UpscaleState.Completed;

			this.emitEvent({
				type: 'complete',
				taskId: task.id,
				pageIndex: task.pageIndex,
				originalHash: task.originalHash,
				result: {
					success: true,
					outputBlob,
					outputUrl: objectUrl,
					processingTime
				}
			});

			// 派发全局事件
			if (typeof window !== 'undefined') {
				window.dispatchEvent(new CustomEvent('upscale-complete', {
					detail: {
						imageData: objectUrl,
						imageBlob: outputBlob,
						originalImageHash: task.originalHash,
						background: task.priority < JobPriority.Critical,
						pageIndex: task.pageIndex
					}
				}));
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			this.updateTaskStatus(task.id, UpscaleState.Failed, errorMessage);
			this.emitEvent({
				type: 'error',
				taskId: task.id,
				pageIndex: task.pageIndex,
				error: errorMessage
			});
		} finally {
			this.processingCount--;
			this.pendingTasks.delete(task.originalHash);
		}
	}

	/** 更新任务状态 */
	private updateTaskStatus(taskId: string, status: UpscaleState, error?: string): void {
		const task = this.tasks.get(taskId);
		if (task) {
			task.status = status;
			if (error) {
				task.error = error;
			}
		}
	}

	/** 取消任务 */
	cancelTask(taskId: string): void {
		const task = this.tasks.get(taskId);
		if (task && task.status === UpscaleState.Pending) {
			task.status = UpscaleState.Failed;
			this.pendingTasks.delete(task.originalHash);
			this.emitEvent({ type: 'cancelled', taskId });
		}
	}

	/** 取消页面任务 */
	cancelPageTasks(pageIndex: number): number {
		let cancelled = 0;
		for (const task of this.tasks.values()) {
			if (task.pageIndex === pageIndex && task.status === UpscaleState.Pending) {
				this.cancelTask(task.id);
				cancelled++;
			}
		}
		return cancelled;
	}

	/** 取消所有任务 */
	cancelAllTasks(): void {
		for (const task of this.tasks.values()) {
			if (task.status === UpscaleState.Pending || task.status === UpscaleState.Processing) {
				this.cancelTask(task.id);
			}
		}
	}

	/** 获取任务 */
	getTask(taskId: string): UpscaleTask | undefined {
		return this.tasks.get(taskId);
	}

	/** 清理已完成任务 */
	cleanupTasks(): void {
		const toDelete: string[] = [];
		for (const [id, task] of this.tasks) {
			if (task.status === UpscaleState.Completed ||
				task.status === UpscaleState.Failed) {
				toDelete.push(id);
			}
		}
		for (const id of toDelete) {
			this.tasks.delete(id);
		}
	}

	/** 添加事件监听器 */
	addEventListener(listener: UpscaleEventListener): () => void {
		this.eventListeners.push(listener);
		return () => {
			const index = this.eventListeners.indexOf(listener);
			if (index !== -1) {
				this.eventListeners.splice(index, 1);
			}
		};
	}

	/** 触发事件 */
	private emitEvent(event: UpscaleEvent): void {
		for (const listener of this.eventListeners) {
			try {
				listener(event);
			} catch (error) {
				console.error('Upscale event listener error:', error);
			}
		}
	}

	/** 休眠 */
	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/** 获取状态 */
	getStats(): {
		pending: number;
		processing: number;
		completed: number;
		failed: number;
	} {
		const stats = { pending: 0, processing: 0, completed: 0, failed: 0 };
		for (const task of this.tasks.values()) {
			switch (task.status) {
				case UpscaleState.Pending: stats.pending++; break;
				case UpscaleState.Processing: stats.processing++; break;
				case UpscaleState.Completed: stats.completed++; break;
				case UpscaleState.Failed: stats.failed++; break;
			}
		}
		return stats;
	}

	/** 销毁 */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		
		this.cancelAllTasks();
		this.tasks.clear();
		this.pendingTasks.clear();
		this.eventListeners = [];
	}
}

/** 获取超分服务实例 */
export function getUpscaleService(config?: Partial<UpscaleServiceConfig>): UpscaleService {
	return UpscaleService.getInstance(config);
}
