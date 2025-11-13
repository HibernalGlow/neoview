/**
 * UpscaleManager V2 - 重写版本
 * 修复卡住问题和模型路径问题
 */

import { writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

// 超分状态
export const upscaleState = writable({
	isUpscaling: false,
	progress: 0,
	status: '',
	showProgress: false,
	upscaledImageData: '',
	upscaledImageBlob: null,
	startTime: 0,
	error: null as string | null
});

// 超分设置
export const upscaleSettings = writable({
	active_algorithm: 'waifu2x',
	global_upscale_enabled: true,
	preload_pages: 3,
	cache_ttl_hours: 8,
	waifu2x: {
		model: 'models-cunet',
		noise_level: '0',
		scale: '2',
		tile_size: '400',
		gpu_id: '0',
		threads: '1:2:2'
	}
});

// 防止并发超分
let isProcessing = false;

/**
 * 执行超分（简化版本）
 */
export async function performUpscale(imageData: string): Promise<void> {
	// 防止重复调用
	if (isProcessing) {
		console.warn('[UpscaleManager] 已有超分任务在进行中，忽略新请求');
		return;
	}

	isProcessing = true;

	try {
		// 更新状态
		upscaleState.update(state => ({
			...state,
			isUpscaling: true,
			progress: 0,
			status: '准备超分...',
			error: null
		}));

		console.log('[UpscaleManager] 开始超分，数据长度:', imageData.length);

		// 调用后端超分命令
		const result = await invoke<string>('upscale_image_from_data', {
			imageData: imageData,
			model: 'waifu2x_cunet',
			scale: 2
		});

		console.log('[UpscaleManager] 超分完成，结果长度:', result.length);

		// 更新状态为完成
		upscaleState.update(state => ({
			...state,
			isUpscaling: false,
			progress: 100,
			status: '超分完成',
			upscaledImageData: result,
			showProgress: true
		}));

	} catch (error) {
		const errorMsg = String(error);
		console.error('[UpscaleManager] 超分失败:', errorMsg);

		upscaleState.update(state => ({
			...state,
			isUpscaling: false,
			progress: 0,
			status: '超分失败',
			error: errorMsg,
			showProgress: false
		}));

	} finally {
		isProcessing = false;
	}
}

/**
 * 检查超分可用性
 */
export async function checkUpscaleAvailability(): Promise<boolean> {
	try {
		await invoke('check_upscale_availability');
		console.log('[UpscaleManager] 超分工具可用');
		return true;
	} catch (error) {
		console.error('[UpscaleManager] 超分工具不可用:', error);
		return false;
	}
}

/**
 * 初始化超分设置
 */
export async function initUpscaleSettingsManager(): Promise<void> {
	try {
		await invoke('init_upscale_settings_manager');
		console.log('[UpscaleManager] 超分设置初始化完成');
	} catch (error) {
		console.error('[UpscaleManager] 初始化超分设置失败:', error);
	}
}

/**
 * 获取全局超分开关状态
 */
export async function getGlobalUpscaleEnabled(): Promise<boolean> {
	try {
		const enabled = await invoke<boolean>('get_global_upscale_enabled');
		return enabled;
	} catch (error) {
		console.error('[UpscaleManager] 获取全局超分开关失败:', error);
		return true; // 默认启用
	}
}

/**
 * 设置全局超分开关
 */
export async function setGlobalUpscaleEnabled(enabled: boolean): Promise<void> {
	try {
		await invoke('set_global_upscale_enabled', { enabled });
		console.log('[UpscaleManager] 全局超分开关已设置:', enabled);
	} catch (error) {
		console.error('[UpscaleManager] 设置全局超分开关失败:', error);
	}
}

/**
 * 重置超分状态
 */
export function resetUpscaleState(): void {
	upscaleState.set({
		isUpscaling: false,
		progress: 0,
		status: '',
		showProgress: false,
		upscaledImageData: '',
		upscaledImageBlob: null,
		startTime: 0,
		error: null
	});
	isProcessing = false;
	console.log('[UpscaleManager] 超分状态已重置');
}

/**
 * 获取超分状态
 */
export function getUpscaleState() {
	let state: {
		isUpscaling: boolean;
		progress: number;
		status: string;
		showProgress: boolean;
		upscaledImageData: string;
		upscaledImageBlob: null;
		startTime: number;
		error: string | null;
	} | undefined;
	
	const unsubscribe = upscaleState.subscribe(s => state = s);
	unsubscribe();
	
	return state;
}

/**
 * 检查是否正在超分
 */
export function isUpscaling(): boolean {
	return isProcessing;
}
