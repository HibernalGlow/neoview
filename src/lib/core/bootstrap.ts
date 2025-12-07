import { appState } from './state/appState';
import { settingsManager } from '$lib/settings/settingsManager';
import { initializeCacheSystem, teardownCacheSystem } from './cache';
import './tasks/taskSchedulerBridge';

let initialized = false;
let removeSettingsListener: (() => void) | null = null;

export function initializeCoreServices(): void {
	if (initialized) {
		return;
	}
	initialized = true;

	// 初始化缓存系统（异步，不阻塞）
	initializeCacheSystem().catch((e) => {
		console.warn('[Bootstrap] 缓存系统初始化失败:', e);
	});

	// Seed state with current settings snapshot
	appState.update({
		settings: settingsManager.getSettings()
	});

	const listener = (settings: any) => {
		appState.update({ settings });
	};

	settingsManager.addListener(listener);
	removeSettingsListener = () => settingsManager.removeListener(listener);
}

export function teardownCoreServices(): void {
	if (!initialized) return;
	removeSettingsListener?.();
	removeSettingsListener = null;
	teardownCacheSystem();
	initialized = false;
}





