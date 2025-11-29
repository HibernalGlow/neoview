/**
 * 作业工作线程
 * 从调度器获取作业并执行
 * 参考 NeeView JobWorker 设计
 */

import { JobScheduler } from './JobScheduler';
import { JobStatus, JobPriority, type JobSource } from '../types';

/** 工作线程配置 */
export interface WorkerConfig {
	isPrimary: boolean;      // 是否为主工作线程
	isLimited: boolean;      // 是否受限模式
	idleTimeout: number;     // 空闲超时 (ms)
}

/** 工作线程状态 */
export interface WorkerState {
	id: string;
	isBusy: boolean;
	currentJob: JobSource | null;
	jobsCompleted: number;
	jobsFailed: number;
}

/**
 * 作业工作线程
 * 负责从调度器获取作业并执行
 */
export class JobWorker {
	private scheduler: JobScheduler;
	private config: WorkerConfig;
	private state: WorkerState;
	
	private running = false;
	private abortController: AbortController | null = null;
	private wakeUpResolver: (() => void) | null = null;
	private jobPriorityMin: number = JobPriority.Idle;
	private jobPriorityMax: number = JobPriority.Critical;
	
	// 事件
	private busyChangedListeners: ((isBusy: boolean) => void)[] = [];

	constructor(
		id: string,
		scheduler: JobScheduler,
		config?: Partial<WorkerConfig>
	) {
		this.scheduler = scheduler;
		this.config = {
			isPrimary: false,
			isLimited: false,
			idleTimeout: 30000,
			...config
		};
		
		this.state = {
			id,
			isBusy: false,
			currentJob: null,
			jobsCompleted: 0,
			jobsFailed: 0
		};
		
		this.updatePriorityRange();
		
		// 监听队列变化
		this.scheduler.addQueueChangedListener(() => this.wakeUp());
	}

	/** 获取工作线程ID */
	get id(): string {
		return this.state.id;
	}

	/** 是否繁忙 */
	get isBusy(): boolean {
		return this.state.isBusy;
	}

	/** 是否为主工作线程 */
	get isPrimary(): boolean {
		return this.config.isPrimary;
	}

	set isPrimary(value: boolean) {
		if (this.config.isPrimary !== value) {
			this.config.isPrimary = value;
			this.updatePriorityRange();
		}
	}

	/** 是否受限模式 */
	get isLimited(): boolean {
		return this.config.isLimited;
	}

	set isLimited(value: boolean) {
		if (this.config.isLimited !== value) {
			this.config.isLimited = value;
			this.updatePriorityRange();
		}
	}

	/** 更新优先级范围 */
	private updatePriorityRange(): void {
		if (this.config.isPrimary) {
			// 主工作线程处理高优先级任务
			this.jobPriorityMin = JobPriority.Normal;
			this.jobPriorityMax = JobPriority.Critical;
		} else {
			// 辅助工作线程处理低优先级任务
			this.jobPriorityMin = JobPriority.Idle;
			this.jobPriorityMax = this.config.isLimited 
				? JobPriority.Critical 
				: JobPriority.Low;
		}
	}

	/** 添加繁忙状态变化监听器 */
	onBusyChanged(listener: (isBusy: boolean) => void): () => void {
		this.busyChangedListeners.push(listener);
		return () => {
			const index = this.busyChangedListeners.indexOf(listener);
			if (index !== -1) {
				this.busyChangedListeners.splice(index, 1);
			}
		};
	}

	/** 设置繁忙状态 */
	private setBusy(isBusy: boolean): void {
		if (this.state.isBusy !== isBusy) {
			this.state.isBusy = isBusy;
			for (const listener of this.busyChangedListeners) {
				try {
					listener(isBusy);
				} catch (error) {
					console.error('Busy changed listener error:', error);
				}
			}
		}
	}

	/** 唤醒工作线程 */
	private wakeUp(): void {
		if (this.wakeUpResolver) {
			this.wakeUpResolver();
			this.wakeUpResolver = null;
		}
	}

	/** 等待唤醒 */
	private async waitForWakeUp(): Promise<void> {
		return new Promise<void>((resolve) => {
			this.wakeUpResolver = resolve;
		});
	}

	/** 启动工作线程 */
	run(): void {
		if (this.running) return;
		
		this.running = true;
		this.abortController = new AbortController();
		
		// 异步执行工作循环
		this.workerLoop().catch(error => {
			if (error.name !== 'AbortError') {
				console.error(`Worker ${this.state.id} error:`, error);
			}
		});
	}

	/** 停止工作线程 */
	cancel(): void {
		this.running = false;
		this.abortController?.abort();
		this.wakeUp();
	}

	/** 工作循环 */
	private async workerLoop(): Promise<void> {
		while (this.running) {
			// 检查取消
			if (this.abortController?.signal.aborted) {
				break;
			}
			
			// 获取下一个作业
			const job = this.scheduler.fetchNextJob(this.jobPriorityMin, this.jobPriorityMax);
			
			if (!job) {
				// 没有作业，等待
				this.setBusy(false);
				await Promise.race([
					this.waitForWakeUp(),
					this.sleep(this.config.idleTimeout)
				]);
				continue;
			}
			
			// 执行作业
			this.setBusy(true);
			this.state.currentJob = job;
			
			try {
				await this.executeJob(job);
				this.state.jobsCompleted++;
			} catch (error) {
				this.state.jobsFailed++;
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				this.scheduler.completeJob(job.id, false, errorMessage);
			} finally {
				this.state.currentJob = null;
			}
		}
		
		this.setBusy(false);
	}

	/** 执行作业 */
	private async executeJob(job: JobSource): Promise<void> {
		try {
			// 执行作业命令
			await job.definition.command.execute();
			
			// 标记完成
			this.scheduler.completeJob(job.id, true);
		} catch (error) {
			if (job.status !== JobStatus.Cancelled) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				this.scheduler.completeJob(job.id, false, errorMessage);
			}
			throw error;
		}
	}

	/** 休眠 */
	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/** 获取状态 */
	getState(): WorkerState {
		return { ...this.state };
	}

	/** 销毁工作线程 */
	dispose(): void {
		this.cancel();
		this.busyChangedListeners = [];
	}
}

/** 创建工作线程工厂 */
export function createWorker(
	id: string,
	scheduler: JobScheduler,
	config?: Partial<WorkerConfig>
): JobWorker {
	return new JobWorker(id, scheduler, config);
}
