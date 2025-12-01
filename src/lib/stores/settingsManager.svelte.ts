/**
 * 设置导入导出管理器
 * 统一管理所有应用设置的导入、导出和重置
 */

import { keyBindingsStore } from './keybindings.svelte';
import { emmMetadataStore } from './emmMetadata.svelte';
import { fileBrowserStore } from './fileBrowser.svelte';
import { bookmarkStore } from './bookmark.svelte';
import { historyStore } from './history.svelte';
import { historySettingsStore } from './historySettings.svelte';
import { applyRuntimeThemeFromStorage } from '$lib/utils/runtimeTheme';
import type { RuntimeThemeMode, RuntimeThemePayload } from '$lib/utils/runtimeTheme';
import { settingsManager as coreSettingsManager } from '$lib/settings/settingsManager';
import type { NeoViewSettings } from '$lib/settings/settingsManager';
import type { PerformanceSettings as TauriPerformanceSettings } from '$lib/api/performance';
import { savePerformanceSettings } from '$lib/api/performance';

export interface AppSettings {
    version: string;
    timestamp: number;
    keybindings: any;
    emmMetadata: {
        enableEMM: boolean;
        fileListTagDisplayMode: 'all' | 'collect' | 'none';
        manualDatabasePath?: string;
        manualSettingPath?: string;
        manualTranslationDictPath?: string;
    };
    fileBrowser: {
        sortField: string;
        sortOrder: string;
    };
    theme?: {
        mode: RuntimeThemeMode;
        name?: string | null;
        runtimeTheme?: RuntimeThemePayload | null;
    };
}

export interface ExtendedSettingsData {
    uiState: Record<string, unknown>;
    panelsLayout: {
        panels?: unknown;
        sidebars?: unknown;
        sidebarManagement?: unknown;
        sidebarConfig?: unknown;
    };
    bookmarks?: unknown;
    history?: unknown;
    historySettings?: {
        syncFileTreeOnHistorySelect: boolean;
        syncFileTreeOnBookmarkSelect: boolean;
    };
    searchHistory?: Record<string, unknown>;
    upscalePanelSettings?: unknown;
    insightsCardsSettings?: unknown;
    themeStorage?: {
        customThemes?: unknown;
    };
    performanceSettings?: TauriPerformanceSettings;
    folderRatings?: unknown; // EMM 文件夹平均评分缓存
}

export interface FullExportPayload {
    version: string;
    timestamp: number;
    includeNativeSettings: boolean;
    includeExtendedData: boolean;
    nativeSettings?: NeoViewSettings;
    appSettings?: AppSettings;
    extended?: ExtendedSettingsData;
}

class SettingsManager {
    /**
     * 导出所有设置到JSON
     */
    exportSettings(): AppSettings {
        let themeMode: RuntimeThemeMode = 'system';
        let themeName: string | null = null;
        let runtimeTheme: RuntimeThemePayload | null = null;

        if (typeof window !== 'undefined' && window.localStorage) {
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

        let enableEMM = true;
        let fileListTagDisplayMode: 'all' | 'collect' | 'none' = 'collect';
        let manualDatabasePath: string | undefined;
        let manualSettingPath: string | undefined;
        let manualTranslationDictPath: string | undefined;

        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                const dbPathsStr = window.localStorage.getItem('neoview-emm-database-paths');
                const settingPathStr = window.localStorage.getItem('neoview-emm-setting-path');
                const translationDictPathStr = window.localStorage.getItem('neoview-emm-translation-dict-path');
                const enableEMMStr = window.localStorage.getItem('neoview-emm-enable');
                const fileListTagModeStr = window.localStorage.getItem('neoview-emm-file-list-tag-mode');

                if (dbPathsStr) {
                    try {
                        const parsed = JSON.parse(dbPathsStr) as string[];
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            manualDatabasePath = parsed[0];
                        }
                    } catch {}
                }

                if (settingPathStr) {
                    manualSettingPath = settingPathStr;
                }

                if (translationDictPathStr) {
                    manualTranslationDictPath = translationDictPathStr;
                }

                if (enableEMMStr !== null) {
                    enableEMM = enableEMMStr !== 'false';
                }

                if (fileListTagModeStr === 'all' || fileListTagModeStr === 'collect' || fileListTagModeStr === 'none') {
                    fileListTagDisplayMode = fileListTagModeStr;
                }
            } catch (error) {
                console.error('加载 EMM 配置失败:', error);
            }
        }

        const settings: AppSettings = {
            version: '1.0.0',
            timestamp: Date.now(),
            keybindings: keyBindingsStore.bindings,
            emmMetadata: {
                enableEMM,
                fileListTagDisplayMode,
                manualDatabasePath,
                manualSettingPath,
                manualTranslationDictPath
            },
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
     * 导出设置为JSON文件
     */
    async exportToFile(): Promise<void> {
        try {
            const settings = this.exportSettings();
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
     * 从JSON导入设置
     */
    importSettings(settings: AppSettings): void {
        try {
            // 导入快捷键绑定
            if (settings.keybindings) {
                keyBindingsStore.bindings = settings.keybindings;
                keyBindingsStore.saveToStorage();
            }

            // 导入EMM设置
            if (settings.emmMetadata) {
                emmMetadataStore.updateSettings(settings.emmMetadata);
            }

            // 导入文件浏览器设置
            if (settings.fileBrowser) {
                fileBrowserStore.setSort(
                    settings.fileBrowser.sortField as any,
                    settings.fileBrowser.sortOrder as any
                );
            }

            if (settings.theme && typeof window !== 'undefined' && window.localStorage) {
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

    private readJsonFromLocalStorage(key: string): unknown {
        if (typeof window === 'undefined' || !window.localStorage) {
            return null;
        }
        try {
            const raw = window.localStorage.getItem(key);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (error) {
            console.error(`读取本地存储键失败: ${key}`, error);
            return null;
        }
    }

    private readUiStateFromLocalStorage(): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        if (typeof window === 'undefined' || !window.localStorage) {
            return result;
        }
        try {
            for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i);
                if (!key || !key.startsWith('neoview-ui-')) continue;
                const shortKey = key.replace('neoview-ui-', '');
                const value = window.localStorage.getItem(key);
                if (value === null) continue;
                try {
                    result[shortKey] = JSON.parse(value);
                } catch {
                    result[shortKey] = value;
                }
            }
        } catch (error) {
            console.error('读取 UI 状态失败:', error);
        }
        return result;
    }

    private readPanelsLayoutFromLocalStorage(): {
        panels?: unknown;
        sidebars?: unknown;
        sidebarManagement?: unknown;
        sidebarConfig?: unknown;
    } {
        const panels = this.readJsonFromLocalStorage('neoview-panels');
        const sidebars = this.readJsonFromLocalStorage('neoview-sidebars');
        const sidebarManagement = this.readJsonFromLocalStorage('neoview-sidebar-management');
        const sidebarConfig = this.readJsonFromLocalStorage('neoview-sidebar-config');
        return { panels, sidebars, sidebarManagement, sidebarConfig };
    }

    private readSearchHistoryFromLocalStorage(): Record<string, unknown> {
        const keys = [
            'neoview-file-search-history',
            'neoview-bookmark-search-history',
            'neoview-history-search-history'
        ];
        const result: Record<string, unknown> = {};
        if (typeof window === 'undefined' || !window.localStorage) {
            return result;
        }
        for (const key of keys) {
            try {
                const raw = window.localStorage.getItem(key);
                if (!raw) continue;
                const shortKey = key.replace('neoview-', '').replace(/-search-history$/, '');
                try {
                    result[shortKey] = JSON.parse(raw);
                } catch {
                    result[shortKey] = raw;
                }
            } catch (error) {
                console.error(`读取搜索历史失败: ${key}`, error);
            }
        }
        return result;
    }

    buildFullPayload(options: { includeNativeSettings: boolean; includeExtendedData: boolean }): FullExportPayload | null {
        const includeNativeSettings = options.includeNativeSettings;
        const includeExtendedData = options.includeExtendedData;

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
            const appSettings = this.exportSettings();
            payload.appSettings = appSettings;

            const extended: ExtendedSettingsData = {
                uiState: this.readUiStateFromLocalStorage(),
                panelsLayout: this.readPanelsLayoutFromLocalStorage(),
                bookmarks: undefined,
                history: undefined,
                historySettings: undefined,
                searchHistory: this.readSearchHistoryFromLocalStorage(),
                upscalePanelSettings: undefined,
                themeStorage: {}
            };

            try {
                extended.bookmarks = bookmarkStore.getAll();
            } catch (error) {
                console.error('导出书签失败:', error);
            }

            try {
                extended.history = historyStore.getAll();
            } catch (error) {
                console.error('导出历史记录失败:', error);
            }

            try {
                extended.historySettings = historySettingsStore.getAll();
            } catch (error) {
                console.error('导出历史记录设置失败:', error);
            }

            const upscaleSettings = this.readJsonFromLocalStorage('pyo3_upscale_settings');
            if (upscaleSettings) {
                extended.upscalePanelSettings = upscaleSettings;
            }

            const insightsCardsSettings = this.readJsonFromLocalStorage('neoview-insights-cards');
            if (insightsCardsSettings) {
                extended.insightsCardsSettings = insightsCardsSettings;
            }

            if (typeof window !== 'undefined' && window.localStorage) {
                const rawCustomThemes = window.localStorage.getItem('custom-themes');
                if (rawCustomThemes) {
                    try {
                        extended.themeStorage = {
                            customThemes: JSON.parse(rawCustomThemes)
                        };
                    } catch {
                        extended.themeStorage = {
                            customThemes: rawCustomThemes
                        };
                    }
                }

                // 导出文件夹评分缓存
                const rawFolderRatings = window.localStorage.getItem('neoview-emm-folder-ratings');
                if (rawFolderRatings) {
                    try {
                        extended.folderRatings = JSON.parse(rawFolderRatings);
                    } catch {
                        extended.folderRatings = rawFolderRatings;
                    }
                }
            }

            payload.extended = extended;
        }

        return payload;
    }

    async exportFullToFile(options: { includeNativeSettings: boolean; includeExtendedData: boolean }): Promise<void> {
        const payload = this.buildFullPayload(options);
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

    async applyFullPayload(
        payload: FullExportPayload,
        options: {
            importNativeSettings: boolean;
            modules: {
                nativeSettings?: boolean;
                keybindings?: boolean;
                emmConfig?: boolean;
                fileBrowserSort?: boolean;
                uiState?: boolean;
                panelsLayout?: boolean;
                bookmarks?: boolean;
                history?: boolean;
                historySettings?: boolean;
                searchHistory?: boolean;
                upscaleSettings?: boolean;
                customThemes?: boolean;
                performanceSettings?: boolean;
                folderRatings?: boolean;
            };
            strategy: 'merge' | 'overwrite';
        }
    ): Promise<void> {
        const { importNativeSettings, modules, strategy } = options;

        if (importNativeSettings && payload.nativeSettings) {
            try {
                // 原生设置总是覆盖式导入
                coreSettingsManager.importSettings(JSON.stringify(payload.nativeSettings));
            } catch (error) {
                console.error('导入原生设置失败:', error);
            }
        }

        const extended = payload.extended;
        if (!extended) return;

        // keybindings
        if (modules.keybindings && payload.appSettings?.keybindings) {
            try {
                keyBindingsStore.bindings = payload.appSettings.keybindings;
                // 私有方法，这里暂时直接写入 localStorage 以避免访问私有方法
                if (typeof window !== 'undefined' && window.localStorage) {
                    try {
                        window.localStorage.setItem('neoview-keybindings', JSON.stringify(payload.appSettings.keybindings));
                    } catch (error) {
                        console.error('写入快捷键存储失败:', error);
                    }
                }
            } catch (error) {
                console.error('导入快捷键失败:', error);
            }
        }

        // EMM 配置：写回 localStorage，让 emmMetadataStore 下一次初始化时生效
        if (modules.emmConfig && payload.appSettings?.emmMetadata && typeof window !== 'undefined' && window.localStorage) {
            try {
                const meta = payload.appSettings.emmMetadata;
                if (meta.manualDatabasePath) {
                    window.localStorage.setItem('neoview-emm-database-paths', JSON.stringify([meta.manualDatabasePath]));
                }
                if (meta.manualSettingPath) {
                    window.localStorage.setItem('neoview-emm-setting-path', meta.manualSettingPath);
                }
                if (meta.manualTranslationDictPath) {
                    window.localStorage.setItem('neoview-emm-translation-dict-path', meta.manualTranslationDictPath);
                }
                window.localStorage.setItem('neoview-emm-enable', String(meta.enableEMM));
                window.localStorage.setItem('neoview-emm-file-list-tag-mode', meta.fileListTagDisplayMode);
            } catch (error) {
                console.error('导入 EMM 配置失败:', error);
            }
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
        if (modules.uiState && typeof window !== 'undefined' && window.localStorage) {
            try {
                const uiState = extended.uiState || {};
                const keys = Object.keys(uiState);
                for (const key of keys) {
                    const fullKey = `neoview-ui-${key}`;
                    const value = uiState[key];
                    window.localStorage.setItem(fullKey, JSON.stringify(value));
                }
            } catch (error) {
                console.error('导入 UI 状态失败:', error);
            }
        }

        // 面板布局
        if (modules.panelsLayout && typeof window !== 'undefined' && window.localStorage) {
            try {
                if (extended.panelsLayout.panels) {
                    window.localStorage.setItem('neoview-panels', JSON.stringify(extended.panelsLayout.panels));
                }
                if (extended.panelsLayout.sidebars) {
                    window.localStorage.setItem('neoview-sidebars', JSON.stringify(extended.panelsLayout.sidebars));
                }
                if (extended.panelsLayout.sidebarManagement) {
                    window.localStorage.setItem('neoview-sidebar-management', JSON.stringify(extended.panelsLayout.sidebarManagement));
                }
                if (extended.panelsLayout.sidebarConfig) {
                    window.localStorage.setItem('neoview-sidebar-config', JSON.stringify(extended.panelsLayout.sidebarConfig));
                }
            } catch (error) {
                console.error('导入面板布局失败:', error);
            }
        }

        // 洞察面板卡片设置
        if (modules.panelsLayout && extended.insightsCardsSettings && typeof window !== 'undefined' && window.localStorage) {
            try {
                window.localStorage.setItem('neoview-insights-cards', JSON.stringify(extended.insightsCardsSettings));
            } catch (error) {
                console.error('导入洞察面板设置失败:', error);
            }
        }

        // 书签
        if (modules.bookmarks && extended.bookmarks && Array.isArray(extended.bookmarks)) {
            try {
                if (strategy === 'overwrite') {
                    bookmarkStore.clear();
                }
                for (const b of extended.bookmarks as any[]) {
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

        // 历史记录
        if (modules.history && extended.history && Array.isArray(extended.history)) {
            try {
                if (strategy === 'overwrite') {
                    historyStore.clear();
                }
                for (const h of extended.history as any[]) {
                    try {
                        historyStore.add(h.path, h.name, h.currentPage, h.totalPages, h.thumbnail);
                    } catch (error) {
                        console.error('导入单条历史失败:', error, h);
                    }
                }
            } catch (error) {
                console.error('导入历史记录失败:', error);
            }
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
        if (modules.searchHistory && extended.searchHistory && typeof window !== 'undefined' && window.localStorage) {
            try {
                const m = extended.searchHistory as Record<string, unknown>;
                if (m.file) {
                    window.localStorage.setItem('neoview-file-search-history', JSON.stringify(m.file));
                }
                if (m.bookmark) {
                    window.localStorage.setItem('neoview-bookmark-search-history', JSON.stringify(m.bookmark));
                }
                if (m.history) {
                    window.localStorage.setItem('neoview-history-search-history', JSON.stringify(m.history));
                }
            } catch (error) {
                console.error('导入搜索历史失败:', error);
            }
        }

        // 超分设置
        if (modules.upscaleSettings && extended.upscalePanelSettings && typeof window !== 'undefined' && window.localStorage) {
            try {
                window.localStorage.setItem('pyo3_upscale_settings', JSON.stringify(extended.upscalePanelSettings));
            } catch (error) {
                console.error('导入超分设置失败:', error);
            }
        }

        // 自定义主题
        if (modules.customThemes && extended.themeStorage && typeof window !== 'undefined' && window.localStorage) {
            try {
                if (extended.themeStorage.customThemes !== undefined) {
                    window.localStorage.setItem('custom-themes', JSON.stringify(extended.themeStorage.customThemes));
                }
            } catch (error) {
                console.error('导入自定义主题失败:', error);
            }
        }

        // 文件夹评分缓存
        if (modules.folderRatings && extended.folderRatings && typeof window !== 'undefined' && window.localStorage) {
            try {
                window.localStorage.setItem('neoview-emm-folder-ratings', JSON.stringify(extended.folderRatings));
                // 同步到 store
                import('./emm/folderRating').then(({ folderRatingStore }) => {
                    folderRatingStore.importCache(extended.folderRatings as any);
                });
            } catch (error) {
                console.error('导入文件夹评分缓存失败:', error);
            }
        }

        if (modules.performanceSettings && extended.performanceSettings) {
            try {
                await savePerformanceSettings(extended.performanceSettings);
            } catch (error) {
                console.error('导入性能设置失败:', error);
            }
        }
    }

    /**
     * 从文件导入设置
     */
    async importFromFile(file: File): Promise<void> {
        try {
            const text = await file.text();
            const settings = JSON.parse(text) as AppSettings;
            this.importSettings(settings);
        } catch (error) {
            console.error('❌ 从文件导入设置失败:', error);
            throw error;
        }
    }

    /**
     * 重置所有设置到默认值
     */
    resetAllSettings(): void {
        try {
            keyBindingsStore.resetToDefault();
            // EMM和文件浏览器可以根据需要添加重置方法
            console.log('✅ 所有设置已重置');
        } catch (error) {
            console.error('❌ 重置设置失败:', error);
            throw error;
        }
    }
}

export const settingsManager = new SettingsManager();
