/**
 * 加载模式 Store
 * 支持 4 种组合：
 * - blob + img
 * - blob + canvas
 * - tempfile + img
 * - tempfile + canvas
 */

export type DataSource = 'blob' | 'tempfile';
export type RenderMode = 'img' | 'canvas';

import { settingsManager } from '$lib/settings/settingsManager';
import { setLargeFileThreshold } from '$lib/api/pageManager';

export interface LoadModeConfig {
	dataSource: DataSource;
	renderMode: RenderMode;
}

// 4 种预设组合
export const LOAD_MODE_PRESETS: Record<string, LoadModeConfig> = {
	'blob-img': { dataSource: 'blob', renderMode: 'img' },
	'blob-canvas': { dataSource: 'blob', renderMode: 'canvas' },
	'tempfile-img': { dataSource: 'tempfile', renderMode: 'img' },
	'tempfile-canvas': { dataSource: 'tempfile', renderMode: 'canvas' }
};

export type LoadModePreset = keyof typeof LOAD_MODE_PRESETS;

const STORAGE_KEY = 'neoview-load-mode-v2';

function createLoadModeStore() {
	// 从 localStorage 加载
	function loadConfig(): LoadModeConfig {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored) as LoadModeConfig;
				if (
					(parsed.dataSource === 'blob' || parsed.dataSource === 'tempfile') &&
					(parsed.renderMode === 'img' || parsed.renderMode === 'canvas')
				) {
					return parsed;
				}
			}
		} catch {
			// 忽略
		}
		return { dataSource: 'blob', renderMode: 'img' }; // 默认
	}

	let config = $state<LoadModeConfig>(loadConfig());

	function saveConfig() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
		} catch {
			// 忽略
		}
	}

	function setDataSource(source: DataSource) {
		config = { ...config, dataSource: source };
		saveConfig();
		console.log(`🔄 数据源: ${source === 'blob' ? 'Blob (IPC)' : 'Tempfile (asset://)'}`);
	}

	function setRenderMode(mode: RenderMode) {
		config = { ...config, renderMode: mode };
		saveConfig();
		console.log(`🔄 渲染模式: ${mode === 'img' ? 'img 元素' : 'canvas'}`);
	}

	function setPreset(preset: LoadModePreset) {
		const presetConfig = LOAD_MODE_PRESETS[preset];
		if (presetConfig) {
			config = { ...presetConfig };
			saveConfig();
			console.log(`🔄 切换到预设: ${preset}`);
		}
	}

	function toggleDataSource() {
		setDataSource(config.dataSource === 'blob' ? 'tempfile' : 'blob');
	}

	function toggleRenderMode() {
		setRenderMode(config.renderMode === 'img' ? 'canvas' : 'img');
	}

	function cyclePreset() {
		const presets = Object.keys(LOAD_MODE_PRESETS);
		const currentKey = `${config.dataSource}-${config.renderMode}`;
		const currentIndex = presets.indexOf(currentKey);
		const nextIndex = (currentIndex + 1) % presets.length;
		setPreset(presets[nextIndex] as LoadModePreset);
	}

	function getPresetLabel(): string {
		const labels: Record<string, string> = {
			'blob-img': 'Blob + img',
			'blob-canvas': 'Blob + canvas',
			'tempfile-img': 'Temp + img',
			'tempfile-canvas': 'Temp + canvas'
		};
		return labels[`${config.dataSource}-${config.renderMode}`] || 'Unknown';
	}

	// 监听设置变更并同步到后端
	settingsManager.addListener((s) => {
		const threshold = s.performance.archiveTempfileThresholdMB;
		setLargeFileThreshold(threshold).catch((err) => {
			console.error('❌ 同步大文件阈值到后端失败:', err);
		});
	});

	// 初始同步
	setLargeFileThreshold(settingsManager.getSettings().performance.archiveTempfileThresholdMB).catch(
		() => {}
	);

	return {
		get config() { return config; },
		get dataSource() { return config.dataSource; },
		get renderMode() { return config.renderMode; },
		get isBlobMode() { return config.dataSource === 'blob'; },
		get isTempfileMode() { return config.dataSource === 'tempfile'; },
		get isImgMode() { return config.renderMode === 'img'; },
		get isCanvasMode() { return config.renderMode === 'canvas'; },
		/** 直接从设置获取的直连 URL 阈值 (MB) */
		get directUrlThresholdMB() {
			return settingsManager.getSettings().performance.directUrlThresholdMB;
		},
		/** 直接从设置获取的压缩包临时文件阈值 (MB) */
		get archiveTempfileThresholdMB() {
			return settingsManager.getSettings().performance.archiveTempfileThresholdMB;
		},
		// 兼容旧 API
		get mode() { return config.dataSource === 'blob' ? 'ipc' : 'tempfile' as const; },
		get isIpcMode() { return config.dataSource === 'blob'; },
		setDataSource,
		setRenderMode,
		setPreset,
		toggleDataSource,
		toggleRenderMode,
		cyclePreset,
		getPresetLabel,
		// 兼容旧 API
		toggle: toggleDataSource
	};
}

export const loadModeStore = createLoadModeStore();
