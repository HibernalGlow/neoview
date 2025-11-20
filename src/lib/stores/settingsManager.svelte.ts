/**
 * 设置导入导出管理器
 * 统一管理所有应用设置的导入、导出和重置
 */

import { keyBindingsStore } from './keybindings.svelte';
import { emmMetadataStore } from './emmMetadata.svelte';
import { fileBrowserStore } from './fileBrowser.svelte';

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
}

class SettingsManager {
    /**
     * 导出所有设置到JSON
     */
    exportSettings(): AppSettings {
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
