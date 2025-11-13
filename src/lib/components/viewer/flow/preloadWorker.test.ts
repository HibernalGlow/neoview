/**
 * PreloadWorker 单元测试
 * 测试并发限制、去重行为和失败重试机制
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPreloadWorker, type PreloadTask, type PreloadTaskResult } from '../preloadWorker';

// 测试用的任务结果类型
interface TestTaskResult extends PreloadTaskResult {
	value?: string;
	delay?: number;
}

describe('PreloadWorker', () => {
	let worker: ReturnType<typeof createPreloadWorker<TestTaskResult>>;
	let mockRunTask: ReturnType<typeof vi.fn>;
	let mockOnTaskSuccess: ReturnType<typeof vi.fn>;
	let mockOnTaskFailure: ReturnType<typeof vi.fn>;
	let mockOnStateChange: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockRunTask = vi.fn();
		mockOnTaskSuccess = vi.fn();
		mockOnTaskFailure = vi.fn();
		mockOnStateChange = vi.fn();

		worker = createPreloadWorker<TestTaskResult>({
			concurrency: () => 2, // 默认并发数为2
			runTask: mockRunTask,
			onTaskSuccess: mockOnTaskSuccess,
			onTaskFailure: mockOnTaskFailure,
			onStateChange: mockOnStateChange,
			dedupeKey: (task) => task.hash,
			retryDelayMs: 100
		});
	});

	it('应该正确初始化worker', () => {
		expect(worker.isRunning()).toBe(false);
		expect(worker.pending()).toBe(0);
		expect(mockOnStateChange).toHaveBeenCalledWith({ running: 0, queued: 0 });
	});

	it('应该处理单个任务', async () => {
		const task: PreloadTask = { data: 'test-data', hash: 'test-hash', pageIndex: 0 };
		const expectedResult: TestTaskResult = { value: 'result' };

		mockRunTask.mockResolvedValue(expectedResult);

		worker.enqueue(task);
		expect(worker.pending()).toBe(0); // 任务应该立即开始执行
		expect(worker.isRunning()).toBe(true);

		// 等待任务完成
		await vi.waitFor(() => {
			expect(mockRunTask).toHaveBeenCalledWith(task);
			expect(mockOnTaskSuccess).toHaveBeenCalledWith(task, expectedResult);
			expect(worker.isRunning()).toBe(false);
		});
	});

	it('应该限制并发数量', async () => {
		const tasks: PreloadTask[] = [
			{ data: 'data1', hash: 'hash1', pageIndex: 0 },
			{ data: 'data2', hash: 'hash2', pageIndex: 1 },
			{ data: 'data3', hash: 'hash3', pageIndex: 2 }
		];

		// 模拟长时间运行的任务
		mockRunTask.mockImplementation(async (task) => {
			await new Promise(resolve => setTimeout(resolve, 100));
			return { value: `result-${task.hash}` };
		});

		// 入队3个任务
		tasks.forEach(task => worker.enqueue(task));

		// 应该只有2个任务在运行，1个在队列中
		expect(mockRunTask).toHaveBeenCalledTimes(2);
		expect(worker.pending()).toBe(1);
		expect(worker.isRunning()).toBe(true);

		// 等待所有任务完成
		await vi.waitFor(() => {
			expect(mockRunTask).toHaveBeenCalledTimes(3);
			expect(worker.isRunning()).toBe(false);
			expect(worker.pending()).toBe(0);
		});
	});

	it('应该去重相同hash的任务', async () => {
		const task1: PreloadTask = { data: 'data1', hash: 'same-hash', pageIndex: 0 };
		const task2: PreloadTask = { data: 'data2', hash: 'same-hash', pageIndex: 1 };
		const expectedResult: TestTaskResult = { value: 'result' };

		mockRunTask.mockResolvedValue(expectedResult);

		// 入队两个相同hash的任务
		worker.enqueue(task1);
		worker.enqueue(task2);

		// 应该只执行第一个任务
		expect(mockRunTask).toHaveBeenCalledTimes(1);
		expect(mockRunTask).toHaveBeenCalledWith(task1);

		// 等待任务完成
		await vi.waitFor(() => {
			expect(mockOnTaskSuccess).toHaveBeenCalledWith(task1, expectedResult);
			expect(worker.isRunning()).toBe(false);
		});
	});

	it('应该处理任务失败', async () => {
		const task: PreloadTask = { data: 'test-data', hash: 'test-hash', pageIndex: 0 };
		const error = new Error('Test error');

		mockRunTask.mockRejectedValue(error);

		worker.enqueue(task);

		// 等待任务失败
		await vi.waitFor(() => {
			expect(mockRunTask).toHaveBeenCalledWith(task);
			expect(mockOnTaskFailure).toHaveBeenCalledWith(task, error);
			expect(worker.isRunning()).toBe(false);
		});
	});

	it('应该支持重试机制', async () => {
		const task: PreloadTask = { data: 'test-data', hash: 'test-hash', pageIndex: 0 };
		const retryResult: TestTaskResult = { value: 'retry-success' };

		// 第一次调用返回重试标记
		mockRunTask
			.mockResolvedValueOnce({ requeue: true })
			.mockResolvedValueOnce(retryResult);

		worker.enqueue(task);

		// 等待重试完成
		await vi.waitFor(() => {
			expect(mockRunTask).toHaveBeenCalledTimes(2);
			expect(mockOnTaskSuccess).toHaveBeenCalledWith(task, retryResult);
			expect(worker.isRunning()).toBe(false);
		}, { timeout: 1000 }); // 增加超时时间以等待重试延迟
	});

	it('应该支持动态并发数', async () => {
		let concurrencyValue = 1;
		const dynamicWorker = createPreloadWorker<TestTaskResult>({
			concurrency: () => concurrencyValue,
			runTask: mockRunTask,
			onTaskSuccess: mockOnTaskSuccess,
			onTaskFailure: mockOnTaskFailure,
			onStateChange: mockOnStateChange
		});

		const tasks: PreloadTask[] = [
			{ data: 'data1', hash: 'hash1', pageIndex: 0 },
			{ data: 'data2', hash: 'hash2', pageIndex: 1 },
			{ data: 'data3', hash: 'hash3', pageIndex: 2 }
		];

		// 模拟长时间运行的任务
		mockRunTask.mockImplementation(async (task) => {
			await new Promise(resolve => setTimeout(resolve, 100));
			return { value: `result-${task.hash}` };
		});

		// 初始并发数为1
		tasks.forEach(task => dynamicWorker.enqueue(task));
		expect(mockRunTask).toHaveBeenCalledTimes(1);

		// 增加并发数到3
		concurrencyValue = 3;
		dynamicWorker.notifyIdle();

		// 等待所有任务完成
		await vi.waitFor(() => {
			expect(mockRunTask).toHaveBeenCalledTimes(3);
			expect(dynamicWorker.isRunning()).toBe(false);
		});
	});

	it('应该支持清空队列', async () => {
		const tasks: PreloadTask[] = [
			{ data: 'data1', hash: 'hash1', pageIndex: 0 },
			{ data: 'data2', hash: 'hash2', pageIndex: 1 },
			{ data: 'data3', hash: 'hash3', pageIndex: 2 }
		];

		// 模拟长时间运行的任务
		mockRunTask.mockImplementation(async (task) => {
			await new Promise(resolve => setTimeout(resolve, 100));
			return { value: `result-${task.hash}` };
		});

		// 入队3个任务
		tasks.forEach(task => worker.enqueue(task));

		// 清空队列
		worker.clear();
		expect(worker.pending()).toBe(0);

		// 等待正在运行的任务完成
		await vi.waitFor(() => {
			expect(worker.isRunning()).toBe(false);
		});

		// 应该只处理了并发限制内的任务
		expect(mockRunTask).toHaveBeenCalledTimes(2);
	});

	it('应该正确报告状态变化', async () => {
		const task: PreloadTask = { data: 'test-data', hash: 'test-hash', pageIndex: 0 };
		const expectedResult: TestTaskResult = { value: 'result' };

		mockRunTask.mockResolvedValue(expectedResult);

		// 重置调用记录
		mockOnStateChange.mockClear();

		worker.enqueue(task);

		// 等待任务完成
		await vi.waitFor(() => {
			expect(worker.isRunning()).toBe(false);
		});

		// 验证状态变化调用
		expect(mockOnStateChange).toHaveBeenCalledWith({ running: 0, queued: 0 }); // 初始状态
		expect(mockOnStateChange).toHaveBeenCalledWith({ running: 1, queued: 0 }); // 任务开始
		expect(mockOnStateChange).toHaveBeenCalledWith({ running: 0, queued: 0 }); // 任务完成
	});
});