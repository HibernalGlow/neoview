/**
 * 面板上下文 - 为每个面板实例提供独立的状态管理
 * 支持文件夹、历史、书签等不同模式
 * 
 * 设计思路：
 * 1. 每个面板实例有独立的 PanelContext
 * 2. 子组件通过 getContext 获取状态
 * 3. 不同模式的行为通过策略模式实现
 */

import type { FolderViewStyle, FolderSortField, FolderSortOrder } from '$lib/components/panels/folderPanel/stores/folderPanelStore.svelte';

export type PanelMode = 'folder' | 'history' | 'bookmark';

export interface PanelState {
    viewStyle: FolderViewStyle;
    sortField: FolderSortField;
    sortOrder: FolderSortOrder;
    multiSelectMode: boolean;
    deleteMode: boolean;
    showSearchBar: boolean;
    showMigrationBar: boolean;
    penetrateMode: boolean;
    inlineTreeMode: boolean;
    thumbnailWidthPercent: number;
}

export interface PanelActions {
    setViewStyle: (style: FolderViewStyle) => void;
    setSort: (field: FolderSortField, order?: FolderSortOrder) => void;
    toggleMultiSelectMode: () => void;
    toggleDeleteMode: () => void;
    toggleShowSearchBar: () => void;
    toggleShowMigrationBar: () => void;
    togglePenetrateMode: () => void;
    toggleInlineTreeMode: () => void;
    setThumbnailWidthPercent: (percent: number) => void;
    // 模式特定的操作
    deleteItem: (path: string) => Promise<void>;
    refresh: () => void;
}

export interface PanelContext {
    mode: PanelMode;
    state: PanelState;
    actions: PanelActions;
}

// 存储键
const STORAGE_KEYS = {
    folder: 'neoview-folder-panel-settings',
    history: 'neoview-history-panel-settings',
    bookmark: 'neoview-bookmark-panel-settings'
};

function createDefaultState(): PanelState {
    return {
        viewStyle: 'list',
        sortField: 'date',
        sortOrder: 'desc',
        multiSelectMode: false,
        deleteMode: false,
        showSearchBar: false,
        showMigrationBar: false,
        penetrateMode: false,
        inlineTreeMode: false,
        thumbnailWidthPercent: 20
    };
}

function loadState(mode: PanelMode): PanelState {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS[mode]);
        if (stored) {
            const parsed = JSON.parse(stored);
            return { ...createDefaultState(), ...parsed };
        }
    } catch (err) {
        console.error(`[PanelContext] Failed to load ${mode} state:`, err);
    }
    return createDefaultState();
}

function saveState(mode: PanelMode, state: PanelState) {
    try {
        localStorage.setItem(STORAGE_KEYS[mode], JSON.stringify(state));
    } catch (err) {
        console.error(`[PanelContext] Failed to save ${mode} state:`, err);
    }
}

/**
 * 创建面板上下文类
 * 每个面板实例使用一个独立的上下文
 */
export class PanelContextStore {
    mode: PanelMode;
    state = $state<PanelState>(createDefaultState());
    
    // 刷新回调
    private onRefresh?: () => void;
    // 删除策略
    private deleteStrategy?: (path: string) => Promise<void>;

    constructor(mode: PanelMode, options?: {
        onRefresh?: () => void;
        deleteStrategy?: (path: string) => Promise<void>;
    }) {
        this.mode = mode;
        this.state = loadState(mode);
        this.onRefresh = options?.onRefresh;
        this.deleteStrategy = options?.deleteStrategy;
    }

    // Getters
    get viewStyle() { return this.state.viewStyle; }
    get sortField() { return this.state.sortField; }
    get sortOrder() { return this.state.sortOrder; }
    get multiSelectMode() { return this.state.multiSelectMode; }
    get deleteMode() { return this.state.deleteMode; }
    get showSearchBar() { return this.state.showSearchBar; }
    get showMigrationBar() { return this.state.showMigrationBar; }
    get penetrateMode() { return this.state.penetrateMode; }
    get inlineTreeMode() { return this.state.inlineTreeMode; }
    get thumbnailWidthPercent() { return this.state.thumbnailWidthPercent; }
    get sortConfig() { return { field: this.state.sortField, order: this.state.sortOrder }; }

    // Actions
    setViewStyle(style: FolderViewStyle) {
        this.state.viewStyle = style;
        saveState(this.mode, this.state);
    }

    setSort(field: FolderSortField, order?: FolderSortOrder) {
        const newOrder = order ?? (this.state.sortField === field && this.state.sortOrder === 'asc' ? 'desc' : 'asc');
        this.state.sortField = field;
        this.state.sortOrder = newOrder;
        saveState(this.mode, this.state);
    }

    toggleMultiSelectMode() {
        this.state.multiSelectMode = !this.state.multiSelectMode;
        saveState(this.mode, this.state);
    }

    toggleDeleteMode() {
        this.state.deleteMode = !this.state.deleteMode;
        saveState(this.mode, this.state);
    }

    toggleShowSearchBar() {
        this.state.showSearchBar = !this.state.showSearchBar;
        saveState(this.mode, this.state);
    }

    toggleShowMigrationBar() {
        this.state.showMigrationBar = !this.state.showMigrationBar;
        saveState(this.mode, this.state);
    }

    togglePenetrateMode() {
        this.state.penetrateMode = !this.state.penetrateMode;
        saveState(this.mode, this.state);
    }

    toggleInlineTreeMode() {
        this.state.inlineTreeMode = !this.state.inlineTreeMode;
        saveState(this.mode, this.state);
    }

    setThumbnailWidthPercent(percent: number) {
        this.state.thumbnailWidthPercent = Math.max(10, Math.min(90, percent));
        saveState(this.mode, this.state);
    }

    // 模式特定操作
    async deleteItem(path: string): Promise<void> {
        if (this.deleteStrategy) {
            await this.deleteStrategy(path);
        }
    }

    refresh() {
        this.onRefresh?.();
    }

    // 设置回调
    setOnRefresh(callback: () => void) {
        this.onRefresh = callback;
    }

    setDeleteStrategy(strategy: (path: string) => Promise<void>) {
        this.deleteStrategy = strategy;
    }
}

// Svelte context key
export const PANEL_CONTEXT_KEY = Symbol('panel-context');
