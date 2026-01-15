/**
 * 设置管理器类型定义
 * 定义所有设置相关的接口和类型
 */

import type { RuntimeThemeMode, RuntimeThemePayload } from '$lib/utils/runtimeTheme';
import type { NeoViewSettings } from '$lib/settings/settingsManager';
import type { PerformanceSettings as TauriPerformanceSettings } from '$lib/api/performance';

/**
 * 应用设置接口
 * 包含基础应用配置
 */
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

/**
 * 扩展设置数据接口
 */
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
    insightsCards?: unknown; // Supports neoview-insights-cards
    cardConfigs?: unknown;
    folderPanelSettings?: {
        homePath?: string;
        panelState?: unknown;
        quickFolderTargets?: unknown;
    };
    themeStorage?: {
        customThemes?: unknown;
    };
    performanceSettings?: TauriPerformanceSettings;
    folderRatings?: unknown;
    excludedPaths?: string[];
    voiceControl?: unknown;
    virtualPanelSettings?: {
        history?: unknown;
        bookmark?: unknown;
    };
    panelViewModes?: Record<string, string>;
}

/**
 * 完整导出数据载荷接口
 */
export interface FullExportPayload {
    version: string;
    timestamp: number;
    includeNativeSettings: boolean;
    includeExtendedData: boolean;
    nativeSettings?: NeoViewSettings;
    appSettings?: AppSettings;
    extended?: ExtendedSettingsData;
}

/**
 * 导入模块配置接口
 */
export interface ImportModules {
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
    insightsCards?: boolean;
    folderPanelSettings?: boolean;
}

/**
 * 导入选项接口
 */
export interface ImportOptions {
    importNativeSettings: boolean;
    modules: ImportModules;
    strategy: 'merge' | 'overwrite';
}

/**
 * 导出选项接口
 */
export interface ExportOptions {
    includeNativeSettings: boolean;
    includeExtendedData: boolean;
}

// 重新导出依赖类型
export type { RuntimeThemeMode, RuntimeThemePayload } from '$lib/utils/runtimeTheme';
export type { NeoViewSettings } from '$lib/settings/settingsManager';
export type { PerformanceSettings as TauriPerformanceSettings } from '$lib/api/performance';
