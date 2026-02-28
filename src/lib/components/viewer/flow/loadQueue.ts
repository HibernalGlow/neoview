/**
 * 加载队列管理器
 * 提供优先级队列和并发控制
 */

import PQueue from 'p-queue';

/** 加载任务 */
interface LoadTask {
	pageIndex: number;
	priority: number; // 数字越大优先级越高
	resolve: () => void;
	reject: (error: Error) => void;
	executor: () => Promise<void>;
	queueId: string;
	controller: AbortController;
	started: boolean;
	settled: boolean;
	cancelled: boolean;
	cleared: boolean;
}

/** 队列清空错误（用于区分正常取消和真正错误） */
export class QueueClearedError extends Error {
	constructor(message = 'Queue cleared') {
		super(message);
		this.name = 'QueueClearedError';
	}
}

/** 任务取消错误 */
export class TaskCancelledError extends Error {
	constructor(pageIndex: number) {
		super(`Task cancelled for page ${pageIndex}`);
		this.name = 'TaskCancelledError';
	}
}

/** 优先级常量 */
export const LoadPriority = {
	CRITICAL: 100,   // 当前页
	HIGH: 80,        // 双页模式的第二页
	NORMAL: 50,      // 普通预加载
	LOW: 20,         // 缩略图
	BACKGROUND: 10   // 后台任务
} as const;

/**
 * 加载队列管理器
 * 控制并发数量和优先级调度
 * 【优化】使用插入排序代替全量排序，O(n) vs O(n log n)
 */
export class LoadQueueManager {
	private queue: PQueue;
	private tasksByPage = new Map<number, LoadTask>();
	private maxConcurrent: number;

	constructor(maxConcurrent = 4) {
		this.maxConcurrent = maxConcurrent;
		this.queue = new PQueue({ concurrency: maxConcurrent });
	}

	/**
	 * 添加加载任务到队列
	 * 【优化】使用二分查找插入，保持有序，O(log n) 查找 + O(n) 插入
	 */
	enqueue(
		pageIndex: number,
		priority: number,
		executor: () => Promise<void>
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const controller = new AbortController();
			const queueId = `page-${pageIndex}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
			const task: LoadTask = {
				pageIndex,
				priority,
				resolve,
				reject,
				executor,
				queueId,
				controller,
				started: false,
				settled: false,
				cancelled: false,
				cleared: false
			};

			this.tasksByPage.set(pageIndex, task);

			void this.queue
				.add(
					async () => {
						task.started = true;
						if (task.cleared) {
							throw new QueueClearedError();
						}
						if (task.cancelled) {
							throw new TaskCancelledError(pageIndex);
						}
						await task.executor();
					},
					{ priority, signal: controller.signal }
				)
				.then(() => {
					if (!task.settled) {
						task.settled = true;
						task.resolve();
					}
				})
				.catch((error: unknown) => {
					if (!task.settled) {
						task.settled = true;
						if (task.cleared) {
							task.reject(new QueueClearedError());
							return;
						}
						if (task.cancelled) {
							task.reject(new TaskCancelledError(pageIndex));
							return;
						}
						task.reject(error instanceof Error ? error : new Error(String(error)));
					}
				})
				.finally(() => {
					this.tasksByPage.delete(pageIndex);
				});
		});
	}

	/**
	 * 提升任务优先级（用于当前页切换时）
	 */
	boostPriority(pageIndex: number, newPriority: number): void {
		const task = this.tasksByPage.get(pageIndex);
		if (task && task.priority < newPriority) {
			task.priority = newPriority;
		}
	}

	/**
	 * 取消指定页面的加载任务
	 */
	cancel(pageIndex: number): void {
		const task = this.tasksByPage.get(pageIndex);
		if (!task || task.started || task.settled) return;

		task.cancelled = true;
		task.controller.abort();
		if (!task.settled) {
			task.settled = true;
			task.reject(new TaskCancelledError(pageIndex));
		}
		this.tasksByPage.delete(pageIndex);
	}

	/**
	 * 清空队列（使用专门的错误类型，便于上层识别）
	 */
	clear(): void {
		for (const task of this.tasksByPage.values()) {
			if (!task.started && !task.settled) {
				task.cleared = true;
				task.controller.abort();
				task.settled = true;
				task.reject(new QueueClearedError());
			}
		}
		this.queue.clear();
		this.tasksByPage.clear();
	}

	/**
	 * 获取队列状态
	 */
	getStatus(): { queueLength: number; activeCount: number } {
		return {
			queueLength: this.queue.size,
			activeCount: this.queue.pending
		};
	}
}

// 单例实例
let instance: LoadQueueManager | null = null;

export function getLoadQueue(maxConcurrent = 4): LoadQueueManager {
	if (!instance) {
		instance = new LoadQueueManager(maxConcurrent);
	}
	return instance;
}

export function resetLoadQueue(): void {
	if (instance) {
		instance.clear();
		instance = null;
	}
}

