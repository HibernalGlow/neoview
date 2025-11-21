/**
 * 设置导入导出管理器
 * 统一管理所有应用设置的导入、导出和重置
 */

import { keyBindingsStore } from './keybindings.svelte';
import { emmMetadataStore } from './emmMetadata.svelte';
import { fileBrowserStore } from './fileBrowser.svelte';
import { applyRuntimeThemeFromStorage } from '$lib/utils/runtimeTheme';
import type { RuntimeThemeMode, RuntimeThemePayload } from '$lib/utils/runtimeTheme';

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

        const settings: AppSettings = {
            version: '1.0.0',
            timestamp: Date.now(),
            keybindings: keyBindingsStore.bindings,
            emmMetadata: {
                enableEMM: emmMetadataStore.getState().enableEMM,
                fileListTagDisplayMode: emmMetadataStore.getState().fileListTagDisplayMode,
                manualDatabasePath: emmMetadataStore.getState().manualDatabasePath,
                manualSettingPath: emmMetadataStore.getState().manualSettingPath,
                manualTranslationDictPath: emmMetadataStore.getState().manualTranslationDictPath
            },
            fileBrowser: {
                sortField: fileBrowserStore.state.sortField,
                sortOrder: fileBrowserStore.state.sortOrder
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
