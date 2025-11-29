/**
 * 加载队列管理器
 * 提供优先级队列和并发控制
 */

/** 加载任务 */
interface LoadTask {
	pageIndex: number;
	priority: number; // 数字越大优先级越高
	resolve: () => void;
	reject: (error: Error) => void;
	executor: () => Promise<void>;
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
 */
export class LoadQueueManager {
	private queue: LoadTask[] = [];
	private activeCount = 0;
	private maxConcurrent: number;

	constructor(maxConcurrent = 4) {
		this.maxConcurrent = maxConcurrent;
	}

	/**
	 * 添加加载任务到队列
	 */
	enqueue(
		pageIndex: number,
		priority: number,
		executor: () => Promise<void>
	): Promise<void> {
		return new Promise((resolve, reject) => {
			this.queue.push({
				pageIndex,
				priority,
				resolve,
				reject,
				executor
			});

			// 按优先级排序（高优先级在前）
			this.queue.sort((a, b) => b.priority - a.priority);

			// 尝试处理队列
			this.processQueue();
		});
	}

	/**
	 * 提升任务优先级（用于当前页切换时）
	 */
	boostPriority(pageIndex: number, newPriority: number): void {
		const task = this.queue.find(t => t.pageIndex === pageIndex);
		if (task && task.priority < newPriority) {
			task.priority = newPriority;
			// 重新排序
			this.queue.sort((a, b) => b.priority - a.priority);
		}
	}

	/**
	 * 取消指定页面的加载任务
	 */
	cancel(pageIndex: number): void {
		const index = this.queue.findIndex(t => t.pageIndex === pageIndex);
		if (index !== -1) {
			const task = this.queue[index];
			this.queue.splice(index, 1);
			task.reject(new Error('Task cancelled'));
		}
	}

	/**
	 * 清空队列
	 */
	clear(): void {
		for (const task of this.queue) {
			task.reject(new Error('Queue cleared'));
		}
		this.queue = [];
	}

	/**
	 * 获取队列状态
	 */
	getStatus(): { queueLength: number; activeCount: number } {
		return {
			queueLength: this.queue.length,
			activeCount: this.activeCount
		};
	}

	/**
	 * 处理队列
	 */
	private processQueue(): void {
		while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
			const task = this.queue.shift()!;
			this.activeCount++;

			task.executor()
				.then(() => task.resolve())
				.catch(err => task.reject(err))
				.finally(() => {
					this.activeCount--;
					// 继续处理队列
					this.processQueue();
				});
		}
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

