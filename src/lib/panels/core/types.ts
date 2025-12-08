/**
 * 面板系统类型定义
 * 统一定义所有面板相关的类型
 */

import type { FsItem } from '$lib/types';

// ==================== 面板模式 ====================
export type PanelMode = 'folder' | 'history' | 'bookmark';

// ==================== 视图样式 ====================
export type ViewStyle = 'list' | 'content' | 'banner' | 'thumbnail';

// ==================== 排序配置 ====================
export type SortField = 'name' | 'path' | 'date' | 'size' | 'type' | 'random' | 'rating' | 'collectTagCount';
export type SortOrder = 'asc' | 'desc';

export interface SortConfig {
    field: SortField;
    order: SortOrder;
}

// ==================== 面板状态 ====================
export interface PanelState {
    // 视图
    viewStyle: ViewStyle;
    sortConfig: SortConfig;
    thumbnailWidthPercent: number;
    
    // 模式
    multiSelectMode: boolean;
    deleteMode: boolean;
    inlineTreeMode: boolean;
    penetrateMode: boolean;
    
    // UI 显示
    showSearchBar: boolean;
    showMigrationBar: boolean;
    
    // 选中项
    selectedItems: Set<string>;
    
    // 当前路径
    currentPath: string;
    
    // 项目列表
    items: FsItem[];
}

// ==================== 面板操作接口 ====================
export interface PanelActions {
    // 导航
    navigate: (path: string) => void;
    goBack: () => void;
    goForward: () => void;
    goUp: () => void;
    goHome: () => void;
    refresh: () => void;
    
    // 视图设置
    setViewStyle: (style: ViewStyle) => void;
    setSort: (field: SortField, order?: SortOrder) => void;
    setThumbnailWidthPercent: (percent: number) => void;
    
    // 模式切换
    toggleMultiSelectMode: () => void;
    toggleDeleteMode: () => void;
    toggleInlineTreeMode: () => void;
    togglePenetrateMode: () => void;
    toggleShowSearchBar: () => void;
    toggleShowMigrationBar: () => void;
    
    // 选择操作
    selectItem: (path: string) => void;
    deselectItem: (path: string) => void;
    selectAll: () => void;
    deselectAll: () => void;
    toggleSelect: (path: string) => void;
    
    // 项目操作 (根据模式不同行为不同)
    openItem: (item: FsItem) => Promise<void>;
    deleteItems: (paths: string[]) => Promise<void>;
}

// ==================== 面板事件 ====================
export type PanelEventType = 
    | 'item-opened'      // 项目被打开
    | 'item-deleted'     // 项目被删除
    | 'path-changed'     // 路径改变
    | 'selection-changed' // 选择改变
    | 'state-changed'    // 状态改变
    | 'bookmark-added'   // 书签添加
    | 'history-updated'; // 历史更新

export interface PanelEvent {
    type: PanelEventType;
    source: PanelMode;
    data?: unknown;
}

export type PanelEventHandler = (event: PanelEvent) => void;

// ==================== 面板配置 ====================
export interface PanelConfig {
    mode: PanelMode;
    
    // 功能开关
    enableNavigation: boolean;    // 是否支持导航
    enableHistory: boolean;       // 是否记录历史
    enableSearch: boolean;        // 是否支持搜索
    enableMigration: boolean;     // 是否支持迁移栏
    enableFolderTree: boolean;    // 是否支持文件夹树
    enableBatchDelete: boolean;   // 是否支持批量删除
    
    // 排序标签定制
    dateSortLabel: string;        // 日期排序显示的标签 (文件夹="日期", 历史/书签="添加时间")
    
    // 删除行为
    deleteLabel: string;          // 删除按钮显示的标签
    deleteConfirmTitle: string;   // 删除确认标题
}

// ==================== 默认配置 ====================
export const DEFAULT_CONFIGS: Record<PanelMode, PanelConfig> = {
    folder: {
        mode: 'folder',
        enableNavigation: true,
        enableHistory: true,
        enableSearch: true,
        enableMigration: true,
        enableFolderTree: true,
        enableBatchDelete: true,
        dateSortLabel: '日期',
        deleteLabel: '删除',
        deleteConfirmTitle: '确定删除选中的文件?'
    },
    history: {
        mode: 'history',
        enableNavigation: false,
        enableHistory: false,
        enableSearch: true,
        enableMigration: false,
        enableFolderTree: false,
        enableBatchDelete: true,
        dateSortLabel: '添加时间',
        deleteLabel: '移除',
        deleteConfirmTitle: '确定从历史记录中移除?'
    },
    bookmark: {
        mode: 'bookmark',
        enableNavigation: false,
        enableHistory: false,
        enableSearch: true,
        enableMigration: false,
        enableFolderTree: false,
        enableBatchDelete: true,
        dateSortLabel: '添加时间',
        deleteLabel: '移除',
        deleteConfirmTitle: '确定从书签中移除?'
    }
};
