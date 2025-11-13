/**
 * Upscale Workflow Store
 * 超分工作流 - 兼容层，桥接到 PyO3 系统
 */

import { pyo3UpscaleManager } from './PyO3UpscaleManager.svelte';
import { 
	currentUpscaleTask, 
	upscaleTaskQueue, 
	addTask, 
	updateTask, 
	removeTask 
} from './UpscaleMemoryCache.svelte';

// 配置
let preupscaleEnabled = $state(true);
let maxMemoryMB = $state(500);

/**
 * 执行内存中超分
 */
export async function performUpscaleInMemory(
	imagePath: string,
	options?: {
		model?: string;
		scale?: number;
		timeout?: number;
	}
): Promise<Uint8Array> {
	const taskId = `task-${Date.now()}`;
	
	// 创建任务
	const task = {
		id: taskId,
		imagePath,
		status: 'processing' as const,
		progress: 0
	};
	
	addTask(task);
	currentUpscaleTask = task;
	
	try {
		// 设置模型
		if (options?.model) {
			await pyo3UpscaleManager.setModel(options.model, options.scale || 2);
		}
		
		// 执行超分
		updateTask(taskId, { progress: 50 });
		const result = await pyo3UpscaleManager.upscaleImage(
			imagePath, 
			options?.timeout || 60.0
		);
		
		// 完成
		updateTask(taskId, { 
			status: 'completed', 
			progress: 100 
		});
		
		return result;
	} catch (error) {
		updateTask(taskId, { 
			status: 'failed', 
			error: error instanceof Error ? error.message : String(error)
		});
		throw error;
	}
}

/**
 * 预超分
 */
export async function preupscaleInMemory(
	imagePaths: string[],
	options?: {
		model?: string;
		scale?: number;
	}
): Promise<void> {
	if (!preupscaleEnabled) return;
	
	for (const imagePath of imagePaths) {
		try {
			// 检查缓存
			const cached = await pyo3UpscaleManager.checkCache(imagePath);
			if (cached) continue;
			
			// 执行超分
			await performUpscaleInMemory(imagePath, options);
		} catch (error) {
			console.error('预超分失败:', imagePath, error);
		}
	}
}

/**
 * 创建 Blob URL
 */
export function createBlobUrl(data: Uint8Array): string {
	const blob = new Blob([data], { type: 'image/webp' });
	return URL.createObjectURL(blob);
}

/**
 * 释放 Blob URL
 */
export function releaseBlobUrl(url: string): void {
	URL.revokeObjectURL(url);
}

/**
 * 获取任务进度
 */
export function getTaskProgress(taskId: string): number {
	const task = upscaleTaskQueue.find(t => t.id === taskId);
	return task?.progress || 0;
}

/**
 * 获取任务状态
 */
export function getTaskStatus(taskId: string): string {
	const task = upscaleTaskQueue.find(t => t.id === taskId);
	return task?.status || 'unknown';
}

/**
 * 获取任务进度颜色
 */
export function getTaskProgressColor(progress: number): string {
	if (progress < 30) return 'bg-blue-500';
	if (progress < 70) return 'bg-yellow-500';
	return 'bg-green-500';
}

/**
 * 设置预超分开关
 */
export function setPreupscaleEnabled(enabled: boolean): void {
	preupscaleEnabled = enabled;
}

/**
 * 设置最大内存
 */
export function setMaxMemory(memoryMB: number): void {
	maxMemoryMB = memoryMB;
}

/**
 * 获取预超分状态
 */
export function getPreupscaleEnabled(): boolean {
	return preupscaleEnabled;
}

/**
 * 获取最大内存
 */
export function getMaxMemory(): number {
	return maxMemoryMB;
}
