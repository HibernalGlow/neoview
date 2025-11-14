/**
 * Upscale State
 * 超分状态管理
 */

import type { PyO3UpscaleManager } from './PyO3UpscaleManager.svelte';

export interface UpscaleStateType {
	isUpscaling: boolean;
	progress: number;
	currentTask: string | null;
	error: string | null;
	currentImageHash: string | null;
	mode: 'auto' | 'manual' | null;
}

export function resetUpscaleState() {
	upscaleState.isUpscaling = false;
	upscaleState.progress = 0;
	upscaleState.currentTask = null;
	upscaleState.error = null;
	upscaleState.currentImageHash = null;
	upscaleState.mode = null;
}

/**
 * 开始超分处理
 */
export function startUpscale(imageHash: string, mode: 'auto' | 'manual', task?: string) {
	upscaleState.isUpscaling = true;
	upscaleState.progress = 0;
	upscaleState.currentImageHash = imageHash;
	upscaleState.mode = mode;
	upscaleState.currentTask = task || (mode === 'auto' ? '自动超分中' : '手动超分中');
	upscaleState.error = null;
}

/**
 * 更新超分进度
 */
export function updateUpscaleProgress(progress: number, task?: string) {
	upscaleState.progress = Math.max(0, Math.min(100, progress));
	if (task) {
		upscaleState.currentTask = task;
	}
}

/**
 * 完成超分处理
 */
export function completeUpscale() {
	upscaleState.isUpscaling = false;
	upscaleState.progress = 100;
	upscaleState.currentTask = '转换完成';
	// 保留 currentImageHash 和 mode 一段时间，便于 UI 状态同步
	setTimeout(() => {
		if (!upscaleState.isUpscaling) {
			upscaleState.currentImageHash = null;
			upscaleState.mode = null;
		}
	}, 1000);
}

/**
 * 设置超分错误
 */
export function setUpscaleError(error: string) {
	upscaleState.isUpscaling = false;
	upscaleState.error = error;
	upscaleState.currentTask = '处理失败';
}

export const upscaleState = $state<UpscaleStateType>({
	isUpscaling: false,
	progress: 0,
	currentTask: null,
	error: null,
	currentImageHash: null,
	mode: null
});