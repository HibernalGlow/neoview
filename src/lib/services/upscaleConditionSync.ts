/**
 * 超分条件同步服务
 * 统一管理条件的保存和同步，减少维护点
 */

import { invoke } from '@tauri-apps/api/core';
import type { UpscaleCondition } from '$lib/components/panels/UpscalePanel';
import type { UpscaleConditionConfig } from '$lib/config/startupConfig';

/**
 * 将前端条件格式转换为 config.json 格式
 */
function toConfigFormat(conditions: UpscaleCondition[]): UpscaleConditionConfig[] {
	return conditions.map(c => ({
		id: c.id,
		name: c.name,
		enabled: c.enabled,
		priority: c.priority,
		minWidth: c.match.minWidth ?? 0,
		minHeight: c.match.minHeight ?? 0,
		maxWidth: c.match.maxWidth ?? 0,
		maxHeight: c.match.maxHeight ?? 0,
		minPixels: c.match.minPixels ?? 0,
		maxPixels: c.match.maxPixels ?? 0,
		regexBookPath: c.match.regexBookPath,
		regexImagePath: c.match.regexImagePath,
		matchInnerPath: c.match.matchInnerPath ?? false,
		modelName: c.action.model,
		scale: c.action.scale,
		tileSize: c.action.tileSize,
		noiseLevel: c.action.noiseLevel,
		skip: c.action.skip ?? false,
	}));
}

/**
 * 将前端条件格式转换为后端 invoke 格式
 */
function toBackendFormat(conditions: UpscaleCondition[]) {
	return conditions.map(c => ({
		id: c.id,
		name: c.name,
		enabled: c.enabled,
		priority: c.priority,
		minWidth: c.match.minWidth ?? 0,
		minHeight: c.match.minHeight ?? 0,
		maxWidth: c.match.maxWidth ?? 0,
		maxHeight: c.match.maxHeight ?? 0,
		minPixels: c.match.minPixels ?? 0,
		maxPixels: c.match.maxPixels ?? 0,
		regexBookPath: c.match.regexBookPath ?? null,
		regexImagePath: c.match.regexImagePath ?? null,
		matchInnerPath: c.match.matchInnerPath ?? false,
		modelName: c.action.model,
		scale: c.action.scale,
		tileSize: c.action.tileSize,
		noiseLevel: c.action.noiseLevel,
		skip: c.action.skip ?? false,
	}));
}

/**
 * 同步条件设置到所有目标
 * - localStorage（通过 saveSettings）
 * - config.json（持久化）
 * - UpscaleService 后端（如果已初始化）
 */
export async function syncUpscaleConditions(
	enabled: boolean,
	conditions: UpscaleCondition[],
	options?: {
		/** 是否保存到 localStorage，默认 true */
		saveToLocalStorage?: boolean;
		/** 是否保存到 config.json，默认 true */
		saveToConfig?: boolean;
		/** 是否同步到后端，默认 true */
		syncToBackend?: boolean;
	}
): Promise<void> {
	const {
		saveToLocalStorage = true,
		saveToConfig = true,
		syncToBackend = true,
	} = options ?? {};

	// 1. 保存到 localStorage
	if (saveToLocalStorage) {
		try {
			const { saveSettings } = await import('$lib/stores/upscale/upscalePanelStore.svelte');
			saveSettings();
		} catch (err) {
			console.warn('⚠️ 保存到 localStorage 失败:', err);
		}
	}

	// 2. 保存到 config.json
	if (saveToConfig) {
		try {
			const { getStartupConfig, saveStartupConfig } = await import('$lib/config/startupConfig');
			const config = await getStartupConfig();
			config.upscaleConditionsEnabled = enabled;
			config.upscaleConditions = toConfigFormat(conditions);
			await saveStartupConfig(config);
		} catch (err) {
			console.warn('⚠️ 保存到 config.json 失败:', err);
		}
	}

	// 3. 同步到后端 UpscaleService
	if (syncToBackend) {
		try {
			await invoke('upscale_service_sync_conditions', {
				enabled,
				conditions: toBackendFormat(conditions),
			});
			console.log('✅ 条件设置同步完成, 条件数:', conditions.length);
		} catch (err) {
			const errMsg = String(err);
			if (errMsg.includes('未初始化')) {
				console.log('ℹ️ UpscaleService 未初始化，条件将在下次打开书籍时生效');
			} else {
				console.warn('⚠️ 同步到后端失败:', err);
			}
		}
	}
}

/**
 * 仅同步到后端（用于 UpscaleStore 初始化时）
 */
export async function syncConditionsToBackend(
	enabled: boolean,
	conditions: UpscaleCondition[]
): Promise<void> {
	return syncUpscaleConditions(enabled, conditions, {
		saveToLocalStorage: false,
		saveToConfig: false,
		syncToBackend: true,
	});
}
