/**
 * 作业引擎
 * 管理作业调度器和工作线程池
 * 参考 NeeView JobEngine 设计
 */

import { JobScheduler } from './JobScheduler';
import { JobWorker } from './JobWorker';
import { 
	type JobDefinition, 
	type JobSource, 
	type IJobCommand,
	JobCategory, 
	JobPriority,
	generateId 
} from '../types';

/** 引擎配置 */
export interface EngineConfig {
	maxWorkerSize: number;
	initialWorkerSize: number;
	primaryWorkerCount: number;
}

/** 引擎状态 */
export interface EngineState {
	isBusy: boolean;
	workerCount: number;
	pendingJobs: number;
	runningJobs: number;
}

/**
 * 作业引擎
 * 单例模式，管理全局作业调度
 */
export class JobEngine {
	private static instance: JobEngine | null = null;
	
	private scheduler: JobScheduler;
	private workers: (JobWorker | null)[];
	private config: EngineConfig;
	private disposed = false;
	
	// 事件
	private busyChangedListeners: ((isBusy: boolean) => void)[] = [];
	private isBusy = false;

	private constructor(config?: Partial<EngineConfig>) {
		this.config = {
			maxWorkerSize: 4,
			initialWorkerSize: 2,
			primaryWorkerCount: 1,
			...config
		};
		
		this.scheduler = new JobScheduler();
		this.workers = new Array(this.config.maxWorkerSize).fill(null);
		
		// 初始化工作线程
		this.changeWorkerSize(this.config.initialWorkerSize);
	}

	/** 获取单例实例 */
	static getInstance(config?: Partial<EngineConfig>): JobEngine {
		if (!JobEngine.instance) {
			JobEngine.instance = new JobEngine(config);
		}
		return JobEngine.instance;
	}

	/** 重置单例（用于测试） */
	static resetInstance(): void {
		if (JobEngine.instance) {
			JobEngine.instance.dispose();
			JobEngine.instance = null;
		}
	}

	/** 获取调度器 */
	getScheduler(): JobScheduler {
		return this.scheduler;
	}

	/** 是否繁忙 */
	get busy(): boolean {
		return this.isBusy;
	}

	/** 获取工作线程数组 */
	getWorkers(): (JobWorker | null)[] {
		return [...this.workers];
	}

	/** 调整工作线程数量 */
	changeWorkerSize(size: number): void {
		if (this.disposed) return;
		
		const targetSize = Math.max(0, Math.min(size, this.config.maxWorkerSize));
		const primaryCount = Math.min(this.config.primaryWorkerCount, targetSize);
		const isLimited = primaryCount <= 1;
		
		for (let i = 0; i < this.config.maxWorkerSize; i++) {
			if (i < targetSize) {
				// 创建或更新工作线程
				if (!this.workers[i]) {
					const worker = new JobWorker(
						`worker-${i}`,
						this.scheduler,
						{
							isPrimary: i < primaryCount,
							isLimited
						}
					);
					
					// 监听繁忙状态
					worker.onBusyChanged(() => this.updateBusyState());
					worker.run();
					
					this.workers[i] = worker;
				} else {
					// 更新现有工作线程配置
					this.workers[i]!.isPrimary = i < primaryCount;
					this.workers[i]!.isLimited = isLimited;
				}
			} else {
				// 移除多余的工作线程
				if (this.workers[i]) {
					this.workers[i]!.dispose();
					this.workers[i] = null;
				}
			}
		}
		
		// 唤醒所有工作线程
		this.scheduler.raiseQueueChanged();
	}

	/** 更新繁忙状态 */
	private updateBusyState(): void {
		if (this.disposed) return;
		
		const newBusy = this.workers.some(w => w?.isBusy);
		if (this.isBusy !== newBusy) {
			this.isBusy = newBusy;
			for (const listener of this.busyChangedListeners) {
				try {
					listener(newBusy);
				} catch (error) {
					console.error('Busy changed listener error:', error);
				}
			}
		}
	}

	/** 添加繁忙状态监听器 */
	onBusyChanged(listener: (isBusy: boolean) => void): () => void {
		this.busyChangedListeners.push(listener);
		return () => {
			const index = this.busyChangedListeners.indexOf(listener);
			if (index !== -1) {
				this.busyChangedListeners.splice(index, 1);
			}
		};
	}

	/** 注册作业客户端 */
	registerClient(name: string, category: JobCategory) {
		return this.scheduler.registerClient(name, category);
	}

	/** 注销作业客户端 */
	unregisterClient(clientId: string): void {
		this.scheduler.unregisterClient(clientId);
	}

	/** 提交作业 */
	submitJob(
		category: JobCategory,
		priority: JobPriority,
		command: IJobCommand,
		options?: {
			pageIndex?: number;
			bookPath?: string;
		}
	): JobSource {
		const definition: JobDefinition = {
			id: generateId(),
			category,
			priority,
			command,
			createdAt: Date.now(),
			...options
		};
		
		const client = this.scheduler.registerClient('default', category);
		const sources = this.scheduler.order(client, [{
			definition,
			priority
		}]);
		
		return sources[0];
	}

	/** 取消作业 */
	cancelJob(jobId: string): boolean {
		return this.scheduler.cancelJob(jobId);
	}

	/** 取消页面作业 */
	cancelPageJobs(pageIndex: number, bookPath?: string): number {
		return this.scheduler.cancelPageJobs(pageIndex, bookPath);
	}

	/** 取消类别作业 */
	cancelCategoryJobs(category: JobCategory): number {
		return this.scheduler.cancelCategoryJobs(category);
	}

	/** 获取状态 */
	getState(): EngineState {
		const stats = this.scheduler.getStats();
		return {
			isBusy: this.isBusy,
			workerCount: this.workers.filter(w => w !== null).length,
			pendingJobs: stats.pending,
			runningJobs: stats.running
		};
	}

	/** 清理已完成作业 */
	cleanup(): void {
		this.scheduler.cleanup();
	}

	/** 销毁引擎 */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		
		// 停止所有工作线程
		for (const worker of this.workers) {
			worker?.dispose();
		}
		this.workers.fill(null);
		
		// 销毁调度器
		this.scheduler.dispose();
		
		this.busyChangedListeners = [];
	}
}

/** 获取作业引擎实例 */
export function getJobEngine(config?: Partial<EngineConfig>): JobEngine {
	return JobEngine.getInstance(config);
}

/** 页面内容作业命令 */
export class PageContentJobCommand implements IJobCommand {
	private abortController = new AbortController();
	private executor: (signal: AbortSignal) => Promise<void>;

	constructor(executor: (signal: AbortSignal) => Promise<void>) {
		this.executor = executor;
	}

	async execute(): Promise<void> {
		await this.executor(this.abortController.signal);
	}

	cancel(): void {
		this.abortController.abort();
	}
}
