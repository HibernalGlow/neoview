/**
 * 预加载管理器
 * 管理页面预加载策略和执行
 * 参考 NeeView BookPageLoader 设计
 */

import { getJobEngine, PageContentJobCommand } from '../job/JobEngine';
import { getCacheManager } from '../cache/CacheManager';
import { loadPageData } from '../source/SourceStrategy';
import { 
	type PageInfo, 
	type PageRange,
	type PreloadResult,
	JobCategory, 
	JobPriority,
	PageContentState,
	createPageRange,
	createEmptyPageRange
} from '../types';

/** 预加载配置 */
export interface PreloadConfig {
	preloadSize: number;          // 预加载页数
	preloadDirection: 1 | -1;     // 预加载方向
	enableAhead: boolean;         // 启用先行加载
	aheadPriority: JobPriority;   // 先行加载优先级
	concurrentLoads: number;      // 并发加载数
}

/** 预加载上下文 */
export interface PreloadContext {
	bookPath: string;
	currentIndex: number;
	totalPages: number;
	direction: 1 | -1;
	pages: PageInfo[];
}

/** 页面状态映射 */
type PageStateMap = Map<number, PageContentState>;

/** 预加载事件 */
export interface PreloadEvent {
	type: 'start' | 'progress' | 'complete' | 'error';
	pageIndex?: number;
	loaded?: number;
	total?: number;
	error?: string;
}

/** 预加载事件监听器 */
export type PreloadEventListener = (event: PreloadEvent) => void;

/**
 * 预加载管理器
 */
export class PreloadManager {
	private config: PreloadConfig;
	private context: PreloadContext | null = null;
	private pageStates: PageStateMap = new Map();
	private abortController: AbortController | null = null;
	private eventListeners: PreloadEventListener[] = [];
	private isPreloading = false;
	private loadingPromises = new Map<number, Promise<void>>();

	constructor(config?: Partial<PreloadConfig>) {
		this.config = {
			preloadSize: 5,
			preloadDirection: 1,
			enableAhead: true,
			aheadPriority: JobPriority.Normal,
			concurrentLoads: 3,
			...config
		};
	}

	/** 设置上下文 */
	setContext(context: PreloadContext): void {
		// 如果书籍变更，清理状态
		if (this.context?.bookPath !== context.bookPath) {
			this.clearStates();
		}
		this.context = context;
	}

	/** 更新配置 */
	updateConfig(config: Partial<PreloadConfig>): void {
		Object.assign(this.config, config);
	}

	/** 请求加载 */
	async requestLoad(
		range: PageRange,
		direction: 1 | -1
	): Promise<PreloadResult> {
		if (!this.context) {
			return { loaded: 0, failed: 0, skipped: 0, duration: 0 };
		}

		// 取消之前的加载
		this.cancel();
		this.abortController = new AbortController();
		
		const startTime = Date.now();
		const result: PreloadResult = { loaded: 0, failed: 0, skipped: 0, duration: 0 };
		
		try {
			this.isPreloading = true;
			this.emitEvent({ type: 'start' });

			// 清除旧的页面状态
			this.clearPageStates();

			// 1. 加载主页面（当前显示页）
			const mainResult = await this.loadMainPages(range, direction);
			result.loaded += mainResult.loaded;
			result.failed += mainResult.failed;

			// 2. 预加载：下一页
			if (this.config.enableAhead) {
				const nextPos = range.next(direction);
				const nextResult = await this.loadAheadPages(nextPos, direction, 1);
				result.loaded += nextResult.loaded;
				result.failed += nextResult.failed;
				result.skipped += nextResult.skipped;

				// 3. 预加载：上一页
				const prevPos = range.next(-direction);
				const prevResult = await this.loadAheadPages(prevPos, -direction as 1 | -1, 1);
				result.loaded += prevResult.loaded;
				result.failed += prevResult.failed;
				result.skipped += prevResult.skipped;

				// 4. 预加载：剩余页面
				const remaining = this.config.preloadSize - 2;
				if (remaining > 0) {
					const remainResult = await this.loadAheadPages(
						nextResult.nextPosition,
						direction,
						remaining
					);
					result.loaded += remainResult.loaded;
					result.failed += remainResult.failed;
					result.skipped += remainResult.skipped;
				}
			}

			this.emitEvent({ 
				type: 'complete', 
				loaded: result.loaded, 
				total: result.loaded + result.failed + result.skipped 
			});
		} catch (error) {
			if ((error as Error).name !== 'AbortError') {
				this.emitEvent({ 
					type: 'error', 
					error: error instanceof Error ? error.message : 'Unknown error' 
				});
			}
		} finally {
			this.isPreloading = false;
			result.duration = Date.now() - startTime;
		}

		return result;
	}

	/** 加载主页面 */
	private async loadMainPages(
		range: PageRange, 
		direction: 1 | -1
	): Promise<{ loaded: number; failed: number }> {
		if (!this.context || range.isEmpty()) {
			return { loaded: 0, failed: 0 };
		}

		const indices: number[] = [];
		for (let i = range.min; i <= range.max; i++) {
			indices.push(i);
		}
		
		// 按方向排序
		if (direction < 0) {
			indices.reverse();
		}

		let loaded = 0;
		let failed = 0;

		// 标记为查看状态
		for (const index of indices) {
			this.pageStates.set(index, PageContentState.View);
		}

		// 并发加载
		const results = await Promise.allSettled(
			indices.map(index => this.loadPage(index, JobPriority.Critical))
		);

		for (const result of results) {
			if (result.status === 'fulfilled') {
				loaded++;
			} else {
				failed++;
			}
		}

		return { loaded, failed };
	}

	/** 加载预读页面 */
	private async loadAheadPages(
		startPosition: number,
		direction: 1 | -1,
		limit: number
	): Promise<{ loaded: number; failed: number; skipped: number; nextPosition: number }> {
		if (!this.context) {
			return { loaded: 0, failed: 0, skipped: 0, nextPosition: startPosition };
		}

		let loaded = 0;
		let failed = 0;
		let skipped = 0;
		let position = startPosition;
		let count = 0;

		while (count < limit) {
			// 检查边界
			if (position < 0 || position >= this.context.totalPages) {
				break;
			}

			// 检查是否已加载
			if (this.pageStates.get(position) !== undefined) {
				skipped++;
				position += direction;
				continue;
			}

			// 检查取消
			if (this.abortController?.signal.aborted) {
				break;
			}

			// 检查内存
			const cacheManager = getCacheManager();
			const stats = cacheManager.getStats();
			if (stats.usagePercent > 0.9) {
				console.log('PreloadManager: Memory limit reached, stopping preload');
				break;
			}

			// 标记为预读状态
			this.pageStates.set(position, PageContentState.Ahead);

			try {
				await this.loadPage(position, this.config.aheadPriority);
				loaded++;
				this.emitEvent({ 
					type: 'progress', 
					pageIndex: position, 
					loaded: loaded + skipped, 
					total: limit 
				});
			} catch {
				failed++;
			}

			count++;
			position += direction;
		}

		return { loaded, failed, skipped, nextPosition: position };
	}

	/** 加载单个页面 */
	private async loadPage(pageIndex: number, priority: JobPriority): Promise<void> {
		if (!this.context) {
			throw new Error('No context set');
		}

		// 检查是否已在缓存中
		const cacheManager = getCacheManager();
		if (cacheManager.hasBlob(pageIndex, this.context.bookPath)) {
			cacheManager.touchBlob(pageIndex, this.context.bookPath);
			return;
		}

		// 检查是否正在加载
		if (this.loadingPromises.has(pageIndex)) {
			return this.loadingPromises.get(pageIndex);
		}

		const page = this.context.pages[pageIndex];
		if (!page) {
			throw new Error(`Page ${pageIndex} not found`);
		}

		// 创建加载 Promise
		const loadPromise = (async () => {
			try {
				const jobEngine = getJobEngine();
				
				// 通过作业系统加载
				const jobSource = jobEngine.submitJob(
					JobCategory.PageAhead,
					priority,
					new PageContentJobCommand(async (signal) => {
						const result = await loadPageData(page, { signal });
						
						if (result.errorMessage) {
							throw new Error(result.errorMessage);
						}
						
						if (result.data) {
							cacheManager.setBlob(
								pageIndex,
								result.data,
								this.context!.bookPath,
								page.hash
							);
						}
					}),
					{
						pageIndex,
						bookPath: this.context!.bookPath
					}
				);

				// 等待作业完成
				await this.waitForJob(jobSource.id);
			} finally {
				this.loadingPromises.delete(pageIndex);
			}
		})();

		this.loadingPromises.set(pageIndex, loadPromise);
		return loadPromise;
	}

	/** 等待作业完成 */
	private waitForJob(jobId: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const jobEngine = getJobEngine();
			const scheduler = jobEngine.getScheduler();
			
			const checkStatus = () => {
				const source = scheduler.getJobSource(jobId);
				if (!source) {
					reject(new Error('Job not found'));
					return;
				}
				
				switch (source.status) {
					case 'completed':
						resolve();
						break;
					case 'failed':
						reject(new Error(source.result?.error || 'Job failed'));
						break;
					case 'cancelled':
						reject(new Error('Job cancelled'));
						break;
					default:
						// 继续等待
						setTimeout(checkStatus, 50);
				}
			};
			
			checkStatus();
		});
	}

	/** 清除页面状态 */
	private clearPageStates(): void {
		this.pageStates.clear();
	}

	/** 清除所有状态 */
	private clearStates(): void {
		this.pageStates.clear();
		this.loadingPromises.clear();
	}

	/** 取消加载 */
	cancel(): void {
		this.abortController?.abort();
		this.abortController = null;
		
		// 取消作业引擎中的相关作业
		if (this.context) {
			const jobEngine = getJobEngine();
			jobEngine.cancelCategoryJobs(JobCategory.PageAhead);
		}
	}

	/** 暂停 */
	pause(): void {
		this.cancel();
	}

	/** 恢复 */
	resume(): void {
		// 如果有待处理的请求，重新开始
	}

	/** 添加事件监听器 */
	addEventListener(listener: PreloadEventListener): () => void {
		this.eventListeners.push(listener);
		return () => {
			const index = this.eventListeners.indexOf(listener);
			if (index !== -1) {
				this.eventListeners.splice(index, 1);
			}
		};
	}

	/** 触发事件 */
	private emitEvent(event: PreloadEvent): void {
		for (const listener of this.eventListeners) {
			try {
				listener(event);
			} catch (error) {
				console.error('Preload event listener error:', error);
			}
		}
	}

	/** 获取页面状态 */
	getPageState(pageIndex: number): PageContentState {
		return this.pageStates.get(pageIndex) ?? PageContentState.None;
	}

	/** 是否正在预加载 */
	get loading(): boolean {
		return this.isPreloading;
	}

	/** 销毁 */
	dispose(): void {
		this.cancel();
		this.clearStates();
		this.eventListeners = [];
		this.context = null;
	}
}

/** 创建预加载管理器 */
export function createPreloadManager(config?: Partial<PreloadConfig>): PreloadManager {
	return new PreloadManager(config);
}
