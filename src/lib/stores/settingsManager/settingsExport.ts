/**
 * 设置导出模块
 * 处理所有设置的导出功能
 */

import { keyBindingsStore } from '../keybindings';
import { fileBrowserStore } from '../fileBrowser.svelte';
import { bookmarkStore } from '../bookmark.svelte';
import { unifiedHistoryStore } from '../unifiedHistory.svelte';
import { historySettingsStore } from '../historySettings.svelte';
import { settingsManager as coreSettingsManager } from '$lib/settings/settingsManager';
import type { AppSettings, ExtendedSettingsData, FullExportPayload, ExportOptions } from './types';
import type { RuntimeThemeMode, RuntimeThemePayload } from '$lib/utils/runtimeTheme';
import {
    isBrowser,
    readJsonFromLocalStorage,
    readUiStateFromLocalStorage,
    readPanelsLayoutFromLocalStorage,
    readSearchHistoryFromLocalStorage,
    findCardConfigsFromLocalStorage,
    readPanelViewModesFromLocalStorage
} from './storageUtils';

/**
 * 导出基础应用设置
 */
export function exportAppSettings(): AppSettings {
    let themeMode: RuntimeThemeMode = 'system';
    let themeName: string | null = null;
    let runtimeTheme: RuntimeThemePayload | null = null;

    if (isBrowser()) {
        const storedMode = window.localStorage.getItem('theme-mode') as RuntimeThemeMode | null;
        const storedName = window.localStorage.getItem('theme-name');
        const rawRuntime = window.localStorage.getItem('runtime-theme');

        if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'system') {
            themeMode = storedMode;
        }
        themeName = storedName;

        if (rawRuntime) {
            try {
                runtimeTheme = JSON.parse(rawRuntime) as RuntimeThemePayload;
            } catch {}
        }
    }

    const emmConfig = readEmmConfig();

    const settings: AppSettings = {
        version: '1.0.0',
        timestamp: Date.now(),
        keybindings: keyBindingsStore.bindings,
        emmMetadata: emmConfig,
        fileBrowser: {
            sortField: fileBrowserStore.getState().sortField,
            sortOrder: fileBrowserStore.getState().sortOrder
        },
        theme: {
            mode: themeMode,
            name: themeName,
            runtimeTheme
        }
    };

    return settings;
}

/**
 * 读取 EMM 配置
 */
function readEmmConfig() {
    let enableEMM = true;
    let fileListTagDisplayMode: 'all' | 'collect' | 'none' = 'collect';
    let manualDatabasePath: string | undefined;
    let manualSettingPath: string | undefined;
    let manualTranslationDictPath: string | undefined;

    if (isBrowser()) {
        try {
            const dbPathsStr = window.localStorage.getItem('neoview-emm-database-paths');
            if (dbPathsStr) {
                try {
                    const parsed = JSON.parse(dbPathsStr) as string[];
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        manualDatabasePath = parsed[0];
                    }
                } catch {}
            }

            const settingPathStr = window.localStorage.getItem('neoview-emm-setting-path');
            if (settingPathStr) manualSettingPath = settingPathStr;

            const translationDictPathStr = window.localStorage.getItem('neoview-emm-translation-dict-path');
            if (translationDictPathStr) manualTranslationDictPath = translationDictPathStr;

            const enableEMMStr = window.localStorage.getItem('neoview-emm-enable');
            if (enableEMMStr !== null) enableEMM = enableEMMStr !== 'false';

            const fileListTagModeStr = window.localStorage.getItem('neoview-emm-file-list-tag-mode');
            if (fileListTagModeStr === 'all' || fileListTagModeStr === 'collect' || fileListTagModeStr === 'none') {
                fileListTagDisplayMode = fileListTagModeStr;
            }
        } catch (error) {
            console.error('加载 EMM 配置失败:', error);
        }
    }

    return {
        enableEMM,
        fileListTagDisplayMode,
        manualDatabasePath,
        manualSettingPath,
        manualTranslationDictPath
    };
}


/**
 * 构建扩展数据
 */
function buildExtendedData(): ExtendedSettingsData {
    const extended: ExtendedSettingsData = {
        uiState: readUiStateFromLocalStorage(),
        panelsLayout: readPanelsLayoutFromLocalStorage(),
        bookmarks: undefined,
        history: undefined,
        historySettings: undefined,
        searchHistory: readSearchHistoryFromLocalStorage(),
        upscalePanelSettings: undefined,
        themeStorage: {}
    };

    try {
        extended.bookmarks = bookmarkStore.getAll();
    } catch (error) {
        console.error('导出书签失败:', error);
    }

    try {
        extended.history = unifiedHistoryStore.getAll();
    } catch (error) {
        console.error('导出历史记录失败:', error);
    }

    try {
        extended.historySettings = historySettingsStore.getAll();
    } catch (error) {
        console.error('导出历史记录设置失败:', error);
    }

    const upscaleSettings = readJsonFromLocalStorage('pyo3_upscale_settings');
    if (upscaleSettings) extended.upscalePanelSettings = upscaleSettings;

    const insightsCardsSettings = readJsonFromLocalStorage('neoview-insights-cards');
    if (insightsCardsSettings) extended.insightsCardsSettings = insightsCardsSettings;

    const cardConfigs = findCardConfigsFromLocalStorage();
    if (cardConfigs) extended.cardConfigs = cardConfigs;

    if (isBrowser()) {
        const homePath = window.localStorage.getItem('neoview-homepage-path');
        const panelState = readJsonFromLocalStorage('neoview-folder-panel');
        const quickFolderTargets = readJsonFromLocalStorage('neoview-quick-folder-targets');
        if (homePath || panelState || quickFolderTargets) {
            extended.folderPanelSettings = {
                homePath: homePath || undefined,
                panelState: panelState || undefined,
                quickFolderTargets: quickFolderTargets || undefined
            };
        }

        const rawCustomThemes = window.localStorage.getItem('custom-themes');
        if (rawCustomThemes) {
            try {
                extended.themeStorage = { customThemes: JSON.parse(rawCustomThemes) };
            } catch {
                extended.themeStorage = { customThemes: rawCustomThemes };
            }
        }

        const rawFolderRatings = window.localStorage.getItem('neoview-emm-folder-ratings');
        if (rawFolderRatings) {
            try { extended.folderRatings = JSON.parse(rawFolderRatings); } catch {}
        }

        const rawExcludedPaths = window.localStorage.getItem('neoview-excluded-paths');
        if (rawExcludedPaths) {
            try { extended.excludedPaths = JSON.parse(rawExcludedPaths); } catch {}
        }

        const rawVoiceControl = window.localStorage.getItem('neoview-voice-control');
        if (rawVoiceControl) {
            try { extended.voiceControl = JSON.parse(rawVoiceControl); } catch {}
        }

        const rawHistoryPanelSettings = window.localStorage.getItem('neoview-history-panel-settings');
        const rawBookmarkPanelSettings = window.localStorage.getItem('neoview-bookmark-panel-settings');
        if (rawHistoryPanelSettings || rawBookmarkPanelSettings) {
            extended.virtualPanelSettings = {};
            if (rawHistoryPanelSettings) {
                try { extended.virtualPanelSettings.history = JSON.parse(rawHistoryPanelSettings); } catch {}
            }
            if (rawBookmarkPanelSettings) {
                try { extended.virtualPanelSettings.bookmark = JSON.parse(rawBookmarkPanelSettings); } catch {}
            }
        }

        const panelViewModes = readPanelViewModesFromLocalStorage();
        if (Object.keys(panelViewModes).length > 0) {
            extended.panelViewModes = panelViewModes;
        }
    }

    return extended;
}


/**
 * 构建完整导出载荷
 */
export function buildFullPayload(options: ExportOptions): FullExportPayload | null {
    const { includeNativeSettings, includeExtendedData } = options;

    if (!includeNativeSettings && !includeExtendedData) {
        return null;
    }

    const payload: FullExportPayload = {
        version: '1.0.0',
        timestamp: Date.now(),
        includeNativeSettings,
        includeExtendedData
    };

    if (includeNativeSettings) {
        try {
            payload.nativeSettings = coreSettingsManager.getSettings();
        } catch (error) {
            console.error('导出原生设置失败:', error);
        }
    }

    if (includeExtendedData) {
        payload.appSettings = exportAppSettings();
        payload.extended = buildExtendedData();
    }

    return payload;
}

/**
 * 导出设置为 JSON 文件
 */
export async function exportToFile(): Promise<void> {
    try {
        const settings = exportAppSettings();
        const json = JSON.stringify(settings, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `neoview-settings-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('✅ 设置已导出');
    } catch (error) {
        console.error('❌ 导出设置失败:', error);
        throw error;
    }
}

/**
 * 导出完整设置为 JSON 文件
 */
export async function exportFullToFile(options: ExportOptions): Promise<void> {
    const payload = buildFullPayload(options);
    if (!payload) return;

    try {
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `neoview-data-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('✅ 完整设置已导出');
    } catch (error) {
        console.error('❌ 导出完整设置失败:', error);
        throw error;
    }
}
