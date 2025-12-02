/**
 * 悬停预览设置 Store
 * 管理缩略图悬停预览的开关和延迟时间
 */
import { writable, derived, get } from 'svelte/store';

const STORAGE_KEY = 'neoview-hover-preview-settings';

export interface HoverPreviewSettings {
	enabled: boolean;
	delayMs: number; // 悬停延迟（毫秒）
}

const defaultSettings: HoverPreviewSettings = {
	enabled: true,
	delayMs: 500 // 默认 0.5 秒
};

// 从 localStorage 加载设置
function loadSettings(): HoverPreviewSettings {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			const parsed = JSON.parse(saved);
			return {
				enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : defaultSettings.enabled,
				delayMs: typeof parsed.delayMs === 'number' ? parsed.delayMs : defaultSettings.delayMs
			};
		}
	} catch (e) {
		console.warn('Failed to load hover preview settings:', e);
	}
	return defaultSettings;
}

// 保存设置到 localStorage
function saveSettings(settings: HoverPreviewSettings) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch (e) {
		console.warn('Failed to save hover preview settings:', e);
	}
}

// 创建 store
const store = writable<HoverPreviewSettings>(loadSettings());

// 订阅变化并保存
store.subscribe((settings) => {
	saveSettings(settings);
});

// 导出 store 和操作函数
export const hoverPreviewSettings = {
	subscribe: store.subscribe,
	
	/** 获取当前设置 */
	get(): HoverPreviewSettings {
		return get(store);
	},
	
	/** 设置是否启用 */
	setEnabled(enabled: boolean) {
		store.update((s) => ({ ...s, enabled }));
	},
	
	/** 设置延迟时间 */
	setDelayMs(delayMs: number) {
		store.update((s) => ({ ...s, delayMs: Math.max(0, Math.min(2000, delayMs)) }));
	},
	
	/** 切换启用状态 */
	toggle() {
		store.update((s) => ({ ...s, enabled: !s.enabled }));
	},
	
	/** 重置为默认设置 */
	reset() {
		store.set(defaultSettings);
	}
};

// 导出派生 store 用于组件
export const hoverPreviewEnabled = derived(store, ($s) => $s.enabled);
export const hoverPreviewDelayMs = derived(store, ($s) => $s.delayMs);
