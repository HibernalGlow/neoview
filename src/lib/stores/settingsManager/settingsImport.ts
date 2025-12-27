/**
 * 设置导入模块
 * 处理所有设置的导入功能
 */

import { keyBindingsStore } from '../keybindings';
import { emmMetadataStore } from '../emmMetadata.svelte';
import { fileBrowserStore } from '../fileBrowser.svelte';
import { bookmarkStore } from '../bookmark.svelte';
import { unifiedHistoryStore } from '../unifiedHistory.svelte';
import { historySettingsStore } from '../historySettings.svelte';
import { applyRuntimeThemeFromStorage } from '$lib/utils/runtimeTheme';
import { settingsManager as coreSettingsManager } from '$lib/settings/settingsManager';
import { savePerformanceSettings } from '$lib/api/performance';
import type { AppSettings, FullExportPayload, ImportOptions } from './types';
import { isBrowser, writeJsonToLocalStorage, writeStringToLocalStorage } from './storageUtils';

/**
 * 从 JSON 导入基础设置
 */
export function importAppSettings(settings: AppSettings): void {
    try {
        if (settings.keybindings) {
            keyBindingsStore.bindings = settings.keybindings;
            keyBindingsStore.saveToStorage();
        }

        if (settings.emmMetadata) {
            emmMetadataStore.updateSettings(settings.emmMetadata);
        }

        if (settings.fileBrowser) {
            fileBrowserStore.setSort(
                settings.fileBrowser.sortField as any,
                settings.fileBrowser.sortOrder as any
            );
        }

        if (settings.theme && isBrowser()) {
            const { mode, name, runtimeTheme } = settings.theme;
            if (mode) {
                window.localStorage.setItem('theme-mode', mode);
            }
            if (name) {
                window.localStorage.setItem('theme-name', name);
            } else {
                window.localStorage.removeItem('theme-name');
            }
            if (runtimeTheme) {
                window.localStorage.setItem('runtime-theme', JSON.stringify(runtimeTheme));
            } else {
                window.localStorage.removeItem('runtime-theme');
            }
            applyRuntimeThemeFromStorage();
        }

        console.log('✅ 设置已导入');
    } catch (error) {
        console.error('❌ 导入设置失败:', error);
        throw error;
    }
}

/**
 * 从文件导入设置
 */
export async function importFromFile(file: File): Promise<void> {
    try {
        const text = await file.text();
        const settings = JSON.parse(text) as AppSettings;
        importAppSettings(settings);
    } catch (error) {
        console.error('❌ 从文件导入设置失败:', error);
        throw error;
    }
}


/**
 * 导入快捷键配置
 */
function importKeybindings(keybindings: any): void {
    try {
        keyBindingsStore.bindings = keybindings;
        if (isBrowser()) {
            writeJsonToLocalStorage('neoview-keybindings', keybindings);
        }
    } catch (error) {
        console.error('导入快捷键失败:', error);
    }
}

/**
 * 导入 EMM 配置
 */
function importEmmConfig(emmMetadata: AppSettings['emmMetadata']): void {
    if (!isBrowser()) return;
    try {
        const meta = emmMetadata;
        if (meta.manualDatabasePath) {
            writeJsonToLocalStorage('neoview-emm-database-paths', [meta.manualDatabasePath]);
        }
        if (meta.manualSettingPath) {
            writeStringToLocalStorage('neoview-emm-setting-path', meta.manualSettingPath);
        }
        if (meta.manualTranslationDictPath) {
            writeStringToLocalStorage('neoview-emm-translation-dict-path', meta.manualTranslationDictPath);
        }
        writeStringToLocalStorage('neoview-emm-enable', String(meta.enableEMM));
        writeStringToLocalStorage('neoview-emm-file-list-tag-mode', meta.fileListTagDisplayMode);
    } catch (error) {
        console.error('导入 EMM 配置失败:', error);
    }
}

/**
 * 导入 UI 状态
 */
function importUiState(uiState: Record<string, unknown>): void {
    if (!isBrowser()) return;
    try {
        for (const [key, value] of Object.entries(uiState)) {
            writeJsonToLocalStorage(`neoview-ui-${key}`, value);
        }
    } catch (error) {
        console.error('导入 UI 状态失败:', error);
    }
}

/**
 * 导入面板布局
 */
function importPanelsLayout(panelsLayout: any): void {
    if (!isBrowser()) return;
    try {
        if (panelsLayout.panels) writeJsonToLocalStorage('neoview-panels', panelsLayout.panels);
        if (panelsLayout.sidebars) writeJsonToLocalStorage('neoview-sidebars', panelsLayout.sidebars);
        if (panelsLayout.sidebarManagement) writeJsonToLocalStorage('neoview-sidebar-management', panelsLayout.sidebarManagement);
        if (panelsLayout.sidebarConfig) writeJsonToLocalStorage('neoview-sidebar-config', panelsLayout.sidebarConfig);
    } catch (error) {
        console.error('导入面板布局失败:', error);
    }
}

/**
 * 导入书签
 */
function importBookmarks(bookmarks: any[], strategy: 'merge' | 'overwrite'): void {
    try {
        if (strategy === 'overwrite') {
            bookmarkStore.clear();
        }
        for (const b of bookmarks) {
            try {
                bookmarkStore.add({
                    name: b.name,
                    path: b.path,
                    isDir: b.type === 'folder'
                } as any);
            } catch (error) {
                console.error('导入单条书签失败:', error, b);
            }
        }
    } catch (error) {
        console.error('导入书签失败:', error);
    }
}

/**
 * 导入历史记录
 */
function importHistory(history: any[], strategy: 'merge' | 'overwrite'): void {
    try {
        if (strategy === 'overwrite') {
            unifiedHistoryStore.clear();
        }
        for (const h of history) {
            try {
                const pathStack = h.pathStack ?? [{ path: h.path }];
                const currentIndex = h.currentIndex ?? h.currentPage ?? 0;
                const totalItems = h.totalItems ?? h.totalPages ?? 0;
                unifiedHistoryStore.add(pathStack, currentIndex, totalItems, {
                    displayName: h.displayName ?? h.name,
                    thumbnail: h.thumbnail,
                });
            } catch (error) {
                console.error('导入单条历史失败:', error, h);
            }
        }
    } catch (error) {
        console.error('导入历史记录失败:', error);
    }
}


/**
 * 导入搜索历史
 */
function importSearchHistory(searchHistory: Record<string, unknown>): void {
    if (!isBrowser()) return;
    try {
        const m = searchHistory;
        if (m.file) writeJsonToLocalStorage('neoview-file-search-history', m.file);
        if (m.bookmark) writeJsonToLocalStorage('neoview-bookmark-search-history', m.bookmark);
        if (m.history) writeJsonToLocalStorage('neoview-history-search-history', m.history);
    } catch (error) {
        console.error('导入搜索历史失败:', error);
    }
}

/**
 * 导入扩展设置
 */
function importExtendedSettings(extended: any, modules: ImportOptions['modules']): void {
    if (!isBrowser()) return;

    if (modules.panelsLayout && extended.insightsCardsSettings) {
        writeJsonToLocalStorage('neoview-insights-cards', extended.insightsCardsSettings);
    }

    if (modules.panelsLayout && extended.cardConfigs) {
        const cardConfigsData = extended.cardConfigs as { key: string; data: unknown };
        if (cardConfigsData.key && cardConfigsData.data) {
            writeJsonToLocalStorage(cardConfigsData.key, cardConfigsData.data);
        }
    }

    if (modules.fileBrowserSort && extended.folderPanelSettings) {
        const fps = extended.folderPanelSettings;
        if (fps.homePath) writeStringToLocalStorage('neoview-homepage-path', fps.homePath);
        if (fps.panelState) writeJsonToLocalStorage('neoview-folder-panel', fps.panelState);
        if (fps.quickFolderTargets) writeJsonToLocalStorage('neoview-quick-folder-targets', fps.quickFolderTargets);
    }

    if (modules.customThemes && extended.themeStorage?.customThemes !== undefined) {
        writeJsonToLocalStorage('custom-themes', extended.themeStorage.customThemes);
    }

    if (modules.uiState && extended.excludedPaths) {
        writeJsonToLocalStorage('neoview-excluded-paths', extended.excludedPaths);
    }

    if (modules.uiState && extended.voiceControl) {
        writeJsonToLocalStorage('neoview-voice-control', extended.voiceControl);
    }

    if (modules.panelsLayout && extended.virtualPanelSettings) {
        if (extended.virtualPanelSettings.history) {
            writeJsonToLocalStorage('neoview-history-panel-settings', extended.virtualPanelSettings.history);
        }
        if (extended.virtualPanelSettings.bookmark) {
            writeJsonToLocalStorage('neoview-bookmark-panel-settings', extended.virtualPanelSettings.bookmark);
        }
    }

    if (modules.panelsLayout && extended.panelViewModes) {
        for (const [panelId, mode] of Object.entries(extended.panelViewModes)) {
            writeStringToLocalStorage(`neoview-panel-viewmode-${panelId}`, mode as string);
        }
    }
}


/**
 * 应用完整导出载荷
 */
export async function applyFullPayload(
    payload: FullExportPayload,
    options: ImportOptions
): Promise<void> {
    const { importNativeSettings, modules, strategy } = options;

    // 导入原生设置
    if (importNativeSettings && payload.nativeSettings) {
        try {
            coreSettingsManager.importSettings(JSON.stringify(payload.nativeSettings));
        } catch (error) {
            console.error('导入原生设置失败:', error);
        }
    }

    const extended = payload.extended;
    if (!extended) return;

    // 快捷键
    if (modules.keybindings && payload.appSettings?.keybindings) {
        importKeybindings(payload.appSettings.keybindings);
    }

    // EMM 配置
    if (modules.emmConfig && payload.appSettings?.emmMetadata) {
        importEmmConfig(payload.appSettings.emmMetadata);
    }

    // 文件浏览排序
    if (modules.fileBrowserSort && payload.appSettings?.fileBrowser) {
        try {
            fileBrowserStore.setSort(
                payload.appSettings.fileBrowser.sortField as any,
                payload.appSettings.fileBrowser.sortOrder as any
            );
        } catch (error) {
            console.error('导入文件浏览排序失败:', error);
        }
    }

    // UI 状态
    if (modules.uiState && extended.uiState) {
        importUiState(extended.uiState);
    }

    // 面板布局
    if (modules.panelsLayout && extended.panelsLayout) {
        importPanelsLayout(extended.panelsLayout);
    }

    // 书签
    if (modules.bookmarks && extended.bookmarks && Array.isArray(extended.bookmarks)) {
        importBookmarks(extended.bookmarks as any[], strategy);
    }

    // 历史记录
    if (modules.history && extended.history && Array.isArray(extended.history)) {
        importHistory(extended.history as any[], strategy);
    }

    // 历史设置
    if (modules.historySettings && extended.historySettings) {
        try {
            const hs = extended.historySettings;
            historySettingsStore.reset();
            historySettingsStore.setSyncFileTreeOnHistorySelect(hs.syncFileTreeOnHistorySelect);
            historySettingsStore.setSyncFileTreeOnBookmarkSelect(hs.syncFileTreeOnBookmarkSelect);
        } catch (error) {
            console.error('导入历史记录设置失败:', error);
        }
    }

    // 搜索历史
    if (modules.searchHistory && extended.searchHistory) {
        importSearchHistory(extended.searchHistory);
    }

    // 超分设置
    if (modules.upscaleSettings && extended.upscalePanelSettings && isBrowser()) {
        writeJsonToLocalStorage('pyo3_upscale_settings', extended.upscalePanelSettings);
    }

    // 文件夹评分缓存
    if (modules.folderRatings && extended.folderRatings && isBrowser()) {
        writeJsonToLocalStorage('neoview-emm-folder-ratings', extended.folderRatings);
        import('../emm/folderRating').then(({ folderRatingStore }) => {
            folderRatingStore.importCache(extended.folderRatings as any);
        });
    }

    // 性能设置
    if (modules.performanceSettings && extended.performanceSettings) {
        try {
            await savePerformanceSettings(extended.performanceSettings);
        } catch (error) {
            console.error('导入性能设置失败:', error);
        }
    }

    // 扩展设置
    importExtendedSettings(extended, modules);
}

/**
 * 重置所有设置到默认值
 */
export function resetAllSettings(): void {
    try {
        keyBindingsStore.resetToDefault();
        console.log('✅ 所有设置已重置');
    } catch (error) {
        console.error('❌ 重置设置失败:', error);
        throw error;
    }
}
