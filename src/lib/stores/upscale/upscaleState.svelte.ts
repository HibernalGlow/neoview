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
}

export const upscaleState = $state<UpscaleStateType>({
	isUpscaling: false,
	progress: 0,
	currentTask: null,
	error: null
});

export function setUpscaleState(state: Partial<UpscaleStateType>) {
	Object.assign(upscaleState, state);
}

export function resetUpscaleState() {
	upscaleState.isUpscaling = false;
	upscaleState.progress = 0;
	upscaleState.currentTask = null;
	upscaleState.error = null;
}