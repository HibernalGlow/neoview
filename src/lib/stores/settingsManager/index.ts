/**
 * 设置管理器模块入口
 * 使用 Barrel Export 模式统一导出所有功能
 */

// 导出核心管理器
export { settingsManager } from './core.svelte';

// 导出类型定义
export type {
    AppSettings,
    ExtendedSettingsData,
    FullExportPayload,
    ImportModules,
    ImportOptions,
    ExportOptions
} from './types';

// 导出导出功能函数（供直接使用）
export {
    exportAppSettings,
    buildFullPayload,
    exportToFile,
    exportFullToFile
} from './settingsExport';

// 导出导入功能函数（供直接使用）
export {
    importAppSettings,
    importFromFile,
    applyFullPayload,
    resetAllSettings
} from './settingsImport';

// 导出存储工具函数（供其他模块使用）
export {
    isBrowser,
    readJsonFromLocalStorage,
    writeJsonToLocalStorage,
    readStringFromLocalStorage,
    writeStringToLocalStorage,
    removeFromLocalStorage,
    readUiStateFromLocalStorage,
    readPanelsLayoutFromLocalStorage,
    readSearchHistoryFromLocalStorage,
    findCardConfigsFromLocalStorage,
    readPanelViewModesFromLocalStorage
} from './storageUtils';
