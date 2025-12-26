/**
 * 设置管理器核心模块
 * 整合所有子模块，提供统一的 API 接口
 */

import type { AppSettings, FullExportPayload, ImportOptions, ExportOptions } from './types';
import { exportAppSettings, buildFullPayload, exportToFile, exportFullToFile } from './settingsExport';
import { importAppSettings, importFromFile, applyFullPayload, resetAllSettings } from './settingsImport';

/**
 * 设置管理器类
 * 统一管理所有应用设置的导入、导出和重置
 */
class SettingsManager {
    /**
     * 导出所有设置到 JSON 对象
     */
    exportSettings(): AppSettings {
        return exportAppSettings();
    }

    /**
     * 导出设置为 JSON 文件
     */
    async exportToFile(): Promise<void> {
        return exportToFile();
    }

    /**
     * 从 JSON 导入设置
     */
    importSettings(settings: AppSettings): void {
        return importAppSettings(settings);
    }

    /**
     * 从文件导入设置
     */
    async importFromFile(file: File): Promise<void> {
        return importFromFile(file);
    }

    /**
     * 构建完整导出载荷
     */
    buildFullPayload(options: ExportOptions): FullExportPayload | null {
        return buildFullPayload(options);
    }

    /**
     * 导出完整设置为 JSON 文件
     */
    async exportFullToFile(options: ExportOptions): Promise<void> {
        return exportFullToFile(options);
    }

    /**
     * 应用完整导出载荷
     */
    async applyFullPayload(payload: FullExportPayload, options: ImportOptions): Promise<void> {
        return applyFullPayload(payload, options);
    }

    /**
     * 重置所有设置到默认值
     */
    resetAllSettings(): void {
        return resetAllSettings();
    }
}

// 导出单例实例
export const settingsManager = new SettingsManager();
