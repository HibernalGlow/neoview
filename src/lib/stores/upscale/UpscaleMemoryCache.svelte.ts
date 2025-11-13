/**
 * Upscale Memory Cache Store
 * 超分内存缓存存储 - 兼容层，桥接到 PyO3 系统
 */

import { pyo3UpscaleManager } from './PyO3UpscaleManager.svelte';

// 任务状态类型
export interface UpscaleTask {
	id: string;
	imagePath: string;
	status: 'pending' | 'processing' | 'completed' | 'failed';
	progress: number;
	error?: string;
	resultUrl?: string;
}

// 缓存统计
export interface CacheStats {
	totalFiles: number;
	totalSize: number;
	cacheDir: string;
}

// 简单的响应式状态
class UpscaleState {
	currentTask = $state<UpscaleTask | null>(null);
	taskQueue = $state<UpscaleTask[]>([]);
	cacheStats = $state<CacheStats>({
		totalFiles: 0,
		totalSize: 0,
		cacheDir: ''
	});
}

const state = new UpscaleState();

// 导出 getter 函数
export function getCurrentTask() { return state.currentTask; }
export function getTaskQueue() { return state.taskQueue; }
export function getCacheStatsValue() { return state.cacheStats; }

// 兼容旧的导出（用于 $ 语法）
export const currentUpscaleTask = state.currentTask;
export const upscaleTaskQueue = state.taskQueue;
export const upscaleCacheStats = state.cacheStats;

/**
 * 更新缓存统计
 */
export async function updateCacheStats() {
	try {
		const stats = await pyo3UpscaleManager.getCacheStats();
		state.cacheStats = stats;
	} catch (error) {
		console.error('更新缓存统计失败:', error);
	}
}

/**
 * 清理缓存
 */
export async function cleanupCache(maxAgeDays: number = 30): Promise<number> {
	try {
		const removed = await pyo3UpscaleManager.cleanupCache(maxAgeDays);
		await updateCacheStats();
		return removed;
	} catch (error) {
		console.error('清理缓存失败:', error);
		return 0;
	}
}

/**
 * 添加任务到队列
 */
export function addTask(task: UpscaleTask) {
	state.taskQueue = [...state.taskQueue, task];
}

/**
 * 移除任务
 */
export function removeTask(taskId: string) {
	state.taskQueue = state.taskQueue.filter(t => t.id !== taskId);
	if (state.currentTask?.id === taskId) {
		state.currentTask = null;
	}
}

/**
 * 更新任务状态
 */
export function updateTask(taskId: string, updates: Partial<UpscaleTask>) {
	state.taskQueue = state.taskQueue.map(t => 
		t.id === taskId ? { ...t, ...updates } : t
	);
	
	if (state.currentTask?.id === taskId) {
		state.currentTask = { ...state.currentTask, ...updates };
	}
}

/**
 * 清空队列
 */
export function clearQueue() {
	state.taskQueue = [];
	state.currentTask = null;
}

/**
 * 设置当前任务
 */
export function setCurrentTask(task: UpscaleTask | null) {
	state.currentTask = task;
}

/**
 * 获取当前任务
 */
export function getCurrentTask(): UpscaleTask | null {
	return state.currentTask;
}

/**
 * 获取任务队列
 */
export function getTaskQueue(): UpscaleTask[] {
	return state.taskQueue;
}

/**
 * 获取缓存统计
 */
export function getCacheStats(): CacheStats {
	return state.cacheStats;
}
