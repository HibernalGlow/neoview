import PQueue from 'p-queue';

export type TaskPriority = 'low' | 'normal' | 'high';
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskBucket = 'current' | 'forward' | 'backward' | 'background';

export interface TaskDescriptor<TPayload = unknown, TResult = unknown> {
	id?: string;
	type: string;
	payload?: TPayload;
	priority?: TaskPriority;
	bucket?: TaskBucket;
	pageIndices?: number[];
	source?: string;
	timeoutMs?: number;
	executor: () => Promise<TResult>;
}

export interface TaskSnapshot<TResult = unknown> {
	id: string;
	type: string;
	status: TaskStatus;
	priority: TaskPriority;
	bucket: TaskBucket;
	pageIndices?: number[];
	source?: string;
	createdAt: number;
	startedAt?: number;
	completedAt?: number;
	error?: string;
	result?: TResult;
}

export interface TaskSchedulerMetrics {
	queueDepth: Record<TaskBucket, number>;
	running: number;
	concurrency: number;
	updatedAt: number;
}

type TaskListener = (snapshot: TaskSnapshot) => void;
type MetricsListener = (metrics: TaskSchedulerMetrics) => void;

let idCounter = 0;
function nextId(prefix: string): string {
	idCounter += 1;
	return `${prefix}-${Date.now()}-${idCounter}`;
}

export class TaskScheduler {
	private queue: PQueue;
	private buckets: Record<TaskBucket, TaskSnapshot[]> = {
		current: [],
		forward: [],
		backward: [],
		background: []
	};
	private active = new Map<string, TaskSnapshot>();
	private controllers = new Map<string, AbortController>();
	private listeners = new Set<TaskListener>();
	private metricsListeners = new Set<MetricsListener>();
	private readonly bucketOrder: TaskBucket[] = ['current', 'forward', 'backward', 'background'];

	constructor(concurrency?: number) {
		// 默认并发度：根据 CPU 核心数动态调整，最少 8，最多 32
		// 参考 NeeView 的 JobClient 多线程设计
		const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
		const resolvedConcurrency = concurrency ?? Math.min(32, Math.max(8, cores * 2));
		this.queue = new PQueue({ concurrency: resolvedConcurrency });
	}

	setConcurrency(limit: number): void {
		this.queue.concurrency = Math.max(1, limit);
		this.emitMetrics();
	}

	subscribe(listener: TaskListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	subscribeMetrics(listener: MetricsListener): () => void {
		this.metricsListeners.add(listener);
		listener(this.buildMetrics());
		return () => this.metricsListeners.delete(listener);
	}

	private notify(snapshot: TaskSnapshot): void {
		for (const listener of this.listeners) {
			listener({ ...snapshot });
		}
	}

	private emitMetrics(): void {
		const metrics = this.buildMetrics();
		for (const listener of this.metricsListeners) {
			listener({ ...metrics });
		}
	}

	private buildMetrics(): TaskSchedulerMetrics {
		return {
			queueDepth: {
				current: this.buckets.current.length,
				forward: this.buckets.forward.length,
				backward: this.buckets.backward.length,
				background: this.buckets.background.length
			},
			running: this.queue.pending,
			concurrency: this.queue.concurrency,
			updatedAt: Date.now()
		};
	}

	enqueue<TPayload, TResult>(descriptor: TaskDescriptor<TPayload, TResult>): TaskSnapshot {
		const bucket = descriptor.bucket ?? 'background';
		const snapshot: TaskSnapshot<TResult> = {
			id: descriptor.id ?? nextId(descriptor.type),
			type: descriptor.type,
			status: 'queued',
			priority: descriptor.priority ?? 'normal',
			bucket,
			pageIndices: descriptor.pageIndices,
			source: descriptor.source,
			createdAt: Date.now()
		};

		this.buckets[bucket].push(snapshot);
		const controller = new AbortController();
		this.controllers.set(snapshot.id, controller);

		void this.queue
			.add(
				async () => {
					this.removeQueuedSnapshot(snapshot.id);
					snapshot.status = 'running';
					snapshot.startedAt = Date.now();
					this.active.set(snapshot.id, snapshot);
					this.notify(snapshot);
					this.emitMetrics();

					const result = await this.runWithTimeout(descriptor, snapshot.id);
					return result;
				},
				{
					id: snapshot.id,
					priority: this.toQueuePriority(bucket, snapshot.priority),
					signal: controller.signal
				}
			)
			.then((result) => {
				this.completeTask(snapshot.id, result);
			})
			.catch((error: unknown) => {
				const current = this.active.get(snapshot.id);
				if (current?.status === 'cancelled') {
					return;
				}
				if (error instanceof Error && error.name === 'AbortError') {
					return;
				}
				this.failTask(snapshot.id, error);
			})
			.finally(() => {
				this.active.delete(snapshot.id);
				this.controllers.delete(snapshot.id);
				this.emitMetrics();
			});

		this.notify(snapshot);
		this.emitMetrics();
		return snapshot;
	}

	private async runWithTimeout<TResult>(
		descriptor: TaskDescriptor<unknown, TResult>,
		taskId: string
	): Promise<TResult> {
		const timeoutMs = descriptor.timeoutMs ?? 0;
		if (timeoutMs <= 0) {
			return descriptor.executor();
		}

		return new Promise<TResult>((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.controllers.get(taskId)?.abort();
				reject(new Error('Task timeout'));
			}, timeoutMs);

			descriptor
				.executor()
				.then((result) => {
					clearTimeout(timeout);
					resolve(result);
				})
				.catch((error) => {
					clearTimeout(timeout);
					reject(error);
				});
		});
	}

	private toQueuePriority(bucket: TaskBucket, priority: TaskPriority): number {
		const bucketWeight: Record<TaskBucket, number> = {
			current: 400,
			forward: 300,
			backward: 200,
			background: 100
		};
		const priorityWeight: Record<TaskPriority, number> = {
			low: 1,
			normal: 2,
			high: 3
		};
		return bucketWeight[bucket] + priorityWeight[priority];
	}

	private removeQueuedSnapshot(taskId: string): void {
		for (const bucket of this.bucketOrder) {
			const queue = this.buckets[bucket];
			const index = queue.findIndex((task) => task.id === taskId);
			if (index >= 0) {
				queue.splice(index, 1);
				return;
			}
		}
	}

	cancel(taskId: string): void {
		const queuedTask = this.getQueuedTask(taskId);
		if (queuedTask) {
			queuedTask.status = 'cancelled';
			queuedTask.completedAt = Date.now();
			this.removeQueuedSnapshot(taskId);
			this.controllers.get(taskId)?.abort();
			this.notify(queuedTask);
			this.emitMetrics();
			this.controllers.delete(taskId);
			return;
		}

		const activeTask = this.active.get(taskId);
		if (activeTask) {
			activeTask.status = 'cancelled';
			activeTask.completedAt = Date.now();
			this.controllers.get(taskId)?.abort();
			this.notify(activeTask);
			this.emitMetrics();
			// 具体 executor 需要自行监听取消信号，这里仅标记状态
		}
	}

	private completeTask<TResult>(taskId: string, result: TResult): void {
		const task = this.active.get(taskId);
		if (!task) return;
		if (task.status === 'cancelled') return;
		task.status = 'completed';
		task.completedAt = Date.now();
		task.result = result;
		this.notify(task);
		this.emitMetrics();
	}

	private failTask(taskId: string, error: unknown): void {
		const task = this.active.get(taskId);
		if (!task) return;
		if (task.status === 'cancelled') return;
		task.status = 'failed';
		task.completedAt = Date.now();
		task.error = error instanceof Error ? error.message : String(error);
		this.notify(task);
		this.emitMetrics();
	}

	getActiveTasks(): TaskSnapshot[] {
		return Array.from(this.active.values()).map((task) => ({ ...task }));
	}

	getQueuedTasks(): TaskSnapshot[] {
		const snapshots: TaskSnapshot[] = [];
		for (const bucket of this.bucketOrder) {
			snapshots.push(...this.buckets[bucket].map((task) => ({ ...task })));
		}
		return snapshots;
	}

	getQueueDepth(): Record<TaskBucket, number> {
		return {
			current: this.buckets.current.length,
			forward: this.buckets.forward.length,
			backward: this.buckets.backward.length,
			background: this.buckets.background.length
		};
	}

	private getQueuedTask(taskId: string): TaskSnapshot | null {
		for (const bucket of this.bucketOrder) {
			const queue = this.buckets[bucket];
			const found = queue.find((task) => task.id === taskId);
			if (found) {
				return found;
			}
		}
		return null;
	}
}

export const taskScheduler = new TaskScheduler();

