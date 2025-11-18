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

interface QueuedTask {
	bucket: TaskBucket;
	snapshot: TaskSnapshot;
	descriptor: TaskDescriptor;
}

export class TaskScheduler {
	private buckets: Record<TaskBucket, QueuedTask[]> = {
		current: [],
		forward: [],
		backward: [],
		background: []
	};
	private active = new Map<string, TaskSnapshot>();
	private listeners = new Set<TaskListener>();
	private metricsListeners = new Set<MetricsListener>();
	private concurrency: number;
	private running = 0;
	private readonly bucketOrder: TaskBucket[] = ['current', 'forward', 'backward', 'background'];

	constructor(concurrency = 2) {
		this.concurrency = concurrency;
	}

	setConcurrency(limit: number): void {
		this.concurrency = Math.max(1, limit);
		this.pump();
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
			running: this.running,
			concurrency: this.concurrency,
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

		this.buckets[bucket].push({ bucket, snapshot, descriptor });
		this.notify(snapshot);
		this.emitMetrics();
		this.pump();
		return snapshot;
	}

	private pump(): void {
		if (this.running >= this.concurrency) {
			return;
		}

		const entry = this.shiftNextTask();
		if (!entry) {
			return;
		}
		const { snapshot: next, descriptor } = entry;

		this.running += 1;
		next.status = 'running';
		next.startedAt = Date.now();
		this.active.set(next.id, next);
		this.notify(next);
		this.emitMetrics();

		const timeout =
			descriptor.timeoutMs && descriptor.timeoutMs > 0
				? setTimeout(() => {
						this.failTask(next.id, new Error('Task timeout'));
				  }, descriptor.timeoutMs)
				: null;

		descriptor
			.executor()
			.then((result) => {
				if (timeout) clearTimeout(timeout);
				this.completeTask(next.id, result);
			})
			.catch((error) => {
				if (timeout) clearTimeout(timeout);
				this.failTask(next.id, error);
			})
			.finally(() => {
				this.running -= 1;
				this.active.delete(next.id);
				this.emitMetrics();
				this.pump();
			});
	}

	cancel(taskId: string): void {
		const located = this.findQueuedTask(taskId);
		if (located) {
			const { bucket, index } = located;
			const [{ snapshot }] = this.buckets[bucket].splice(index, 1);
			snapshot.status = 'cancelled';
			snapshot.completedAt = Date.now();
			this.notify(snapshot);
			this.emitMetrics();
			return;
		}

		const activeTask = this.active.get(taskId);
		if (activeTask) {
			activeTask.status = 'cancelled';
			activeTask.completedAt = Date.now();
			this.notify(activeTask);
			this.emitMetrics();
			// 具体 executor 需要自行监听取消信号，这里仅标记状态
		}
	}

	private completeTask<TResult>(taskId: string, result: TResult): void {
		const task = this.active.get(taskId);
		if (!task) return;
		task.status = 'completed';
		task.completedAt = Date.now();
		task.result = result;
		this.notify(task);
		this.emitMetrics();
	}

	private failTask(taskId: string, error: unknown): void {
		const task = this.active.get(taskId);
		if (!task) return;
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
			snapshots.push(...this.buckets[bucket].map((task) => ({ ...task.snapshot })));
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

	private shiftNextTask(): QueuedTask | undefined {
		for (const bucket of this.bucketOrder) {
			const queue = this.buckets[bucket];
			if (queue.length > 0) {
				return queue.shift();
			}
		}
		return undefined;
	}

	private findQueuedTask(taskId: string): { bucket: TaskBucket; index: number } | null {
		for (const bucket of this.bucketOrder) {
			const queue = this.buckets[bucket];
			const index = queue.findIndex((task) => task.snapshot.id === taskId);
			if (index >= 0) {
				return { bucket, index };
			}
		}
		return null;
	}
}

export const taskScheduler = new TaskScheduler();

