/**
 * 作业调度器
 * 管理作业队列，按优先级调度作业给工作线程
 * 参考 NeeView JobScheduler 设计
 */

import { 
	type JobDefinition, 
	type JobOrder, 
	type JobSource, 
	JobStatus, 
	JobPriority,
	JobCategory,
	generateId 
} from '../types';

/** 作业客户端 */
export interface JobClient {
	id: string;
	name: string;
	category: JobCategory;
	orders: Map<string, JobOrder>;
}

/** 调度器配置 */
export interface SchedulerConfig {
	maxQueueSize: number;
	priorityBoostInterval: number;
	starvationThreshold: number;
}

/** 队列变化事件 */
export type QueueChangedListener = () => void;

/**
 * 作业调度器
 * 负责管理作业队列和调度策略
 */
export class JobScheduler {
	private clients = new Map<string, JobClient>();
	private jobSources = new Map<string, JobSource>();
	private queueChangedListeners: QueueChangedListener[] = [];
	private config: SchedulerConfig;
	private lock = false;

	constructor(config?: Partial<SchedulerConfig>) {
		this.config = {
			maxQueueSize: 1000,
			priorityBoostInterval: 5000,
			starvationThreshold: 10000,
			...config
		};
	}

	/** 获取调度器锁 */
	get Lock(): boolean {
		return this.lock;
	}

	/** 注册客户端 */
	registerClient(name: string, category: JobCategory): JobClient {
		const id = generateId();
		const client: JobClient = {
			id,
			name,
			category,
			orders: new Map()
		};
		this.clients.set(id, client);
		return client;
	}

	/** 注销客户端 */
	unregisterClient(clientId: string): void {
		const client = this.clients.get(clientId);
		if (client) {
			// 取消该客户端所有待处理作业
			for (const [jobId] of client.orders) {
				this.cancelJob(jobId);
			}
			this.clients.delete(clientId);
		}
	}

	/** 提交作业订单 */
	order(client: JobClient, orders: JobOrder[]): JobSource[] {
		const sources: JobSource[] = [];
		
		// 清除该客户端旧的订单
		this.clearClientOrders(client);
		
		// 添加新订单
		for (const order of orders) {
			const source = this.createJobSource(order.definition);
			client.orders.set(source.id, order);
			this.jobSources.set(source.id, source);
			sources.push(source);
		}
		
		// 通知队列变化
		this.raiseQueueChanged();
		
		return sources;
	}

	/** 创建作业源 */
	private createJobSource(definition: JobDefinition): JobSource {
		return {
			id: definition.id,
			definition,
			status: JobStatus.Pending,
			progress: 0
		};
	}

	/** 清除客户端订单 */
	private clearClientOrders(client: JobClient): void {
		for (const [jobId] of client.orders) {
			const source = this.jobSources.get(jobId);
			if (source && source.status === JobStatus.Pending) {
				this.jobSources.delete(jobId);
			}
		}
		client.orders.clear();
	}

	/** 取消作业 */
	cancelJob(jobId: string): boolean {
		const source = this.jobSources.get(jobId);
		if (!source) return false;
		
		if (source.status === JobStatus.Pending || source.status === JobStatus.Running) {
			source.status = JobStatus.Cancelled;
			source.definition.command.cancel();
			return true;
		}
		return false;
	}

	/** 取消指定页面的所有作业 */
	cancelPageJobs(pageIndex: number, bookPath?: string): number {
		let cancelled = 0;
		for (const [jobId, source] of this.jobSources) {
			if (source.definition.pageIndex === pageIndex) {
				if (bookPath && source.definition.bookPath !== bookPath) {
					continue;
				}
				if (this.cancelJob(jobId)) {
					cancelled++;
				}
			}
		}
		return cancelled;
	}

	/** 取消指定类别的所有作业 */
	cancelCategoryJobs(category: JobCategory): number {
		let cancelled = 0;
		for (const [jobId, source] of this.jobSources) {
			if (source.definition.category === category) {
				if (this.cancelJob(jobId)) {
					cancelled++;
				}
			}
		}
		return cancelled;
	}

	/** 获取下一个作业 */
	fetchNextJob(priorityMin: number, priorityMax: number): JobSource | null {
		this.lock = true;
		try {
			let bestJob: JobSource | null = null;
			let bestPriority = -1;
			let bestCreatedAt = Infinity;
			
			for (const source of this.jobSources.values()) {
				if (source.status !== JobStatus.Pending) continue;
				
				const priority = source.definition.priority;
				if (priority < priorityMin || priority > priorityMax) continue;
				
				// 优先级高的优先，同优先级按创建时间排序
				if (priority > bestPriority || 
					(priority === bestPriority && source.definition.createdAt < bestCreatedAt)) {
					bestJob = source;
					bestPriority = priority;
					bestCreatedAt = source.definition.createdAt;
				}
			}
			
			if (bestJob) {
				bestJob.status = JobStatus.Running;
				bestJob.startedAt = Date.now();
			}
			
			return bestJob;
		} finally {
			this.lock = false;
		}
	}

	/** 完成作业 */
	completeJob(jobId: string, success: boolean, error?: string): void {
		const source = this.jobSources.get(jobId);
		if (!source) return;
		
		source.status = success ? JobStatus.Completed : JobStatus.Failed;
		source.completedAt = Date.now();
		source.result = {
			success,
			error,
			duration: source.completedAt - (source.startedAt || source.definition.createdAt)
		};
		
		// 通知队列变化
		this.raiseQueueChanged();
	}

	/** 更新作业进度 */
	updateProgress(jobId: string, progress: number): void {
		const source = this.jobSources.get(jobId);
		if (source) {
			source.progress = Math.min(100, Math.max(0, progress));
		}
	}

	/** 获取队列统计 */
	getStats(): {
		pending: number;
		running: number;
		completed: number;
		failed: number;
		cancelled: number;
	} {
		const stats = {
			pending: 0,
			running: 0,
			completed: 0,
			failed: 0,
			cancelled: 0
		};
		
		for (const source of this.jobSources.values()) {
			switch (source.status) {
				case JobStatus.Pending: stats.pending++; break;
				case JobStatus.Running: stats.running++; break;
				case JobStatus.Completed: stats.completed++; break;
				case JobStatus.Failed: stats.failed++; break;
				case JobStatus.Cancelled: stats.cancelled++; break;
			}
		}
		
		return stats;
	}

	/** 清理已完成的作业 */
	cleanup(): void {
		const now = Date.now();
		const maxAge = 60000; // 1分钟后清理
		
		for (const [jobId, source] of this.jobSources) {
			if (source.status === JobStatus.Completed || 
				source.status === JobStatus.Failed || 
				source.status === JobStatus.Cancelled) {
				if (source.completedAt && now - source.completedAt > maxAge) {
					this.jobSources.delete(jobId);
				}
			}
		}
	}

	/** 添加队列变化监听器 */
	addQueueChangedListener(listener: QueueChangedListener): void {
		this.queueChangedListeners.push(listener);
	}

	/** 移除队列变化监听器 */
	removeQueueChangedListener(listener: QueueChangedListener): void {
		const index = this.queueChangedListeners.indexOf(listener);
		if (index !== -1) {
			this.queueChangedListeners.splice(index, 1);
		}
	}

	/** 触发队列变化事件 */
	raiseQueueChanged(): void {
		for (const listener of this.queueChangedListeners) {
			try {
				listener();
			} catch (error) {
				console.error('Queue changed listener error:', error);
			}
		}
	}

	/** 获取作业源 */
	getJobSource(jobId: string): JobSource | undefined {
		return this.jobSources.get(jobId);
	}

	/** 获取客户端 */
	getClient(clientId: string): JobClient | undefined {
		return this.clients.get(clientId);
	}

	/** 销毁调度器 */
	dispose(): void {
		// 取消所有待处理作业
		for (const source of this.jobSources.values()) {
			if (source.status === JobStatus.Pending || source.status === JobStatus.Running) {
				source.status = JobStatus.Cancelled;
				source.definition.command.cancel();
			}
		}
		
		this.jobSources.clear();
		this.clients.clear();
		this.queueChangedListeners = [];
	}
}

/** 创建默认调度器实例 */
export function createScheduler(config?: Partial<SchedulerConfig>): JobScheduler {
	return new JobScheduler(config);
}
