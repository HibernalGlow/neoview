export type TaskPriority = 'low' | 'normal' | 'high';
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TaskDescriptor<TPayload = unknown, TResult = unknown> {
	id?: string;
	type: string;
	payload?: TPayload;
	priority?: TaskPriority;
	timeoutMs?: number;
	executor: () => Promise<TResult>;
}

export interface TaskSnapshot<TResult = unknown> {
	id: string;
	type: string;
	status: TaskStatus;
	priority: TaskPriority;
	createdAt: number;
	startedAt?: number;
	completedAt?: number;
	error?: string;
	result?: TResult;
}

type TaskListener = (snapshot: TaskSnapshot) => void;

let idCounter = 0;
function nextId(prefix: string): string {
	idCounter += 1;
	return `${prefix}-${Date.now()}-${idCounter}`;
}

interface QueuedTask {
	snapshot: TaskSnapshot;
	descriptor: TaskDescriptor;
}

export class TaskScheduler {
	private queue: QueuedTask[] = [];
	private active = new Map<string, TaskSnapshot>();
	private listeners = new Set<TaskListener>();
	private concurrency: number;
	private running = 0;

	constructor(concurrency = 2) {
		this.concurrency = concurrency;
	}

	setConcurrency(limit: number): void {
		this.concurrency = Math.max(1, limit);
		this.pump();
	}

	subscribe(listener: TaskListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(snapshot: TaskSnapshot): void {
		for (const listener of this.listeners) {
			listener({ ...snapshot });
		}
	}

	enqueue<TPayload, TResult>(descriptor: TaskDescriptor<TPayload, TResult>): TaskSnapshot {
		const snapshot: TaskSnapshot<TResult> = {
			id: descriptor.id ?? nextId(descriptor.type),
			type: descriptor.type,
			status: 'queued',
			priority: descriptor.priority ?? 'normal',
			createdAt: Date.now()
		};

		this.queue.push({ snapshot, descriptor });
		this.notify(snapshot);
		this.pump();
		return snapshot;
	}

	private pump(): void {
		if (this.running >= this.concurrency) {
			return;
		}

		const entry = this.queue.shift();
		if (!entry) {
			return;
		}
		const { snapshot: next, descriptor } = entry;

		this.running += 1;
		next.status = 'running';
		next.startedAt = Date.now();
		this.active.set(next.id, next);
		this.notify(next);

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
				this.pump();
			});
	}

	cancel(taskId: string): void {
		const queuedIndex = this.queue.findIndex((task) => task.snapshot.id === taskId);
		if (queuedIndex >= 0) {
			const [{ snapshot }] = this.queue.splice(queuedIndex, 1);
			snapshot.status = 'cancelled';
			snapshot.completedAt = Date.now();
			this.notify(snapshot);
			return;
		}

		const activeTask = this.active.get(taskId);
		if (activeTask) {
			activeTask.status = 'cancelled';
			activeTask.completedAt = Date.now();
			this.notify(activeTask);
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
	}

	private failTask(taskId: string, error: unknown): void {
		const task = this.active.get(taskId);
		if (!task) return;
		task.status = 'failed';
		task.completedAt = Date.now();
		task.error = error instanceof Error ? error.message : String(error);
		this.notify(task);
	}

	getActiveTasks(): TaskSnapshot[] {
		return Array.from(this.active.values()).map((task) => ({ ...task }));
	}

	getQueuedTasks(): TaskSnapshot[] {
		return this.queue.map((task) => ({ ...task }));
	}
}

export const taskScheduler = new TaskScheduler();

