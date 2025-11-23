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
    };
    bookmarks?: unknown;
    history?: unknown;
    historySettings?: {
        syncFileTreeOnHistorySelect: boolean;
        syncFileTreeOnBookmarkSelect: boolean;
    };
    searchHistory?: Record<string, unknown>;
    upscalePanelSettings?: unknown;
    themeStorage?: {
        customThemes?: unknown;
    };
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
    } {
        const panels = this.readJsonFromLocalStorage('neoview-panels');
        const sidebars = this.readJsonFromLocalStorage('neoview-sidebars');
        const sidebarManagement = this.readJsonFromLocalStorage('neoview-sidebar-management');
        return { panels, sidebars, sidebarManagement };
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

    async exportFullToFile(options: { includeNativeSettings: boolean; includeExtendedData: boolean }): Promise<void> {
        const includeNativeSettings = options.includeNativeSettings;
        const includeExtendedData = options.includeExtendedData;

        if (!includeNativeSettings && !includeExtendedData) {
            return;
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
            }

            payload.extended = extended;
        }

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
