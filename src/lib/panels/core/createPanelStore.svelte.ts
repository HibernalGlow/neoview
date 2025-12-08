/**
 * 面板状态工厂
 * 为每个面板实例创建独立的状态管理
 */

import type { FsItem } from '$lib/types';
import { SvelteSet } from 'svelte/reactivity';
import type { 
    PanelMode, 
    PanelState, 
    PanelConfig, 
    ViewStyle, 
    SortField, 
    SortOrder
} from './types';
import { DEFAULT_CONFIGS } from './types';
import { panelEventBus } from './eventBus.svelte';

// 存储键前缀
const STORAGE_PREFIX = 'neoview-panel-';

/**
 * 加载持久化状态
 */
function loadPersistedState(mode: PanelMode): Partial<PanelState> {
    try {
        const key = `${STORAGE_PREFIX}${mode}`;
        const stored = localStorage.getItem(key);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (err) {
        console.error(`[PanelStore] Failed to load ${mode} state:`, err);
    }
    return {};
}

/**
 * 保存持久化状态
 */
function savePersistedState(mode: PanelMode, state: Partial<PanelState>): void {
    try {
        const key = `${STORAGE_PREFIX}${mode}`;
        // 只保存需要持久化的字段
        const toSave = {
            viewStyle: state.viewStyle,
            sortConfig: state.sortConfig,
            thumbnailWidthPercent: state.thumbnailWidthPercent,
            inlineTreeMode: state.inlineTreeMode,
            penetrateMode: state.penetrateMode
        };
        localStorage.setItem(key, JSON.stringify(toSave));
    } catch (err) {
        console.error(`[PanelStore] Failed to save ${mode} state:`, err);
    }
}

/**
 * 创建默认状态
 */
function createDefaultState(initialPath: string): PanelState {
    return {
        viewStyle: 'list',
        sortConfig: { field: 'date', order: 'desc' },
        thumbnailWidthPercent: 20,
        multiSelectMode: false,
        deleteMode: false,
        inlineTreeMode: false,
        penetrateMode: false,
        showSearchBar: false,
        showMigrationBar: false,
        selectedItems: new SvelteSet(),
        currentPath: initialPath,
        items: []
    };
}

/**
 * 面板状态 Store 类
 */
export class PanelStore {
    // 模式和配置
    readonly mode: PanelMode;
    readonly config: PanelConfig;
    
    // 响应式状态
    state = $state<PanelState>(createDefaultState(''));
    
    // 历史记录（仅 folder 模式）
    private historyStack: string[] = [];
    private historyIndex = -1;
    
    constructor(mode: PanelMode, initialPath: string) {
        this.mode = mode;
        this.config = DEFAULT_CONFIGS[mode];
        
        // 初始化状态
        const defaultState = createDefaultState(initialPath);
        const persisted = loadPersistedState(mode);
        this.state = { ...defaultState, ...persisted, currentPath: initialPath };
        
        // 如果支持历史，添加初始路径
        if (this.config.enableHistory) {
            this.historyStack = [initialPath];
            this.historyIndex = 0;
        }
    }
    
    // ==================== Getters ====================
    get viewStyle() { return this.state.viewStyle; }
    get sortConfig() { return this.state.sortConfig; }
    get thumbnailWidthPercent() { return this.state.thumbnailWidthPercent; }
    get multiSelectMode() { return this.state.multiSelectMode; }
    get deleteMode() { return this.state.deleteMode; }
    get inlineTreeMode() { return this.state.inlineTreeMode; }
    get penetrateMode() { return this.state.penetrateMode; }
    get showSearchBar() { return this.state.showSearchBar; }
    get showMigrationBar() { return this.state.showMigrationBar; }
    get selectedItems() { return this.state.selectedItems; }
    get currentPath() { return this.state.currentPath; }
    get items() { return this.state.items; }
    
    get canGoBack() { 
        return this.config.enableHistory && this.historyIndex > 0; 
    }
    get canGoForward() { 
        return this.config.enableHistory && this.historyIndex < this.historyStack.length - 1; 
    }
    
    // ==================== 视图设置 ====================
    setViewStyle(style: ViewStyle) {
        this.state.viewStyle = style;
        this.persist();
    }
    
    setSort(field: SortField, order?: SortOrder) {
        const newOrder = order ?? (
            this.state.sortConfig.field === field && this.state.sortConfig.order === 'asc' 
                ? 'desc' 
                : 'asc'
        );
        this.state.sortConfig = { field, order: newOrder };
        this.persist();
    }
    
    setThumbnailWidthPercent(percent: number) {
        this.state.thumbnailWidthPercent = Math.max(10, Math.min(90, percent));
        this.persist();
    }
    
    // ==================== 模式切换 ====================
    toggleMultiSelectMode() {
        this.state.multiSelectMode = !this.state.multiSelectMode;
        if (!this.state.multiSelectMode) {
            this.state.selectedItems = new SvelteSet();
        }
    }
    
    toggleDeleteMode() {
        this.state.deleteMode = !this.state.deleteMode;
    }
    
    toggleInlineTreeMode() {
        this.state.inlineTreeMode = !this.state.inlineTreeMode;
        this.persist();
    }
    
    togglePenetrateMode() {
        this.state.penetrateMode = !this.state.penetrateMode;
        this.persist();
    }
    
    toggleShowSearchBar() {
        this.state.showSearchBar = !this.state.showSearchBar;
    }
    
    toggleShowMigrationBar() {
        this.state.showMigrationBar = !this.state.showMigrationBar;
    }
    
    // ==================== 选择操作 ====================
    selectItem(path: string) {
        this.state.selectedItems.add(path);
    }
    
    deselectItem(path: string) {
        this.state.selectedItems.delete(path);
    }
    
    toggleSelect(path: string) {
        if (this.state.selectedItems.has(path)) {
            this.deselectItem(path);
        } else {
            this.selectItem(path);
        }
    }
    
    selectAll() {
        this.state.selectedItems = new SvelteSet(this.state.items.map(i => i.path));
    }
    
    deselectAll() {
        this.state.selectedItems = new SvelteSet();
    }
    
    // ==================== 导航 ====================
    navigate(path: string) {
        this.state.currentPath = path;
        
        if (this.config.enableHistory) {
            // 截断前进历史，添加新路径
            this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
            this.historyStack.push(path);
            this.historyIndex = this.historyStack.length - 1;
        }
        
        panelEventBus.emitPathChanged(this.mode, path);
    }
    
    goBack(): string | null {
        if (!this.canGoBack) return null;
        this.historyIndex--;
        const path = this.historyStack[this.historyIndex];
        this.state.currentPath = path;
        return path;
    }
    
    goForward(): string | null {
        if (!this.canGoForward) return null;
        this.historyIndex++;
        const path = this.historyStack[this.historyIndex];
        this.state.currentPath = path;
        return path;
    }
    
    // ==================== 数据更新 ====================
    setItems(items: FsItem[]) {
        this.state.items = items;
    }
    
    // ==================== 持久化 ====================
    private persist() {
        savePersistedState(this.mode, this.state);
    }
}

/**
 * 创建面板 Store 的工厂函数
 */
export function createPanelStore(mode: PanelMode, initialPath: string): PanelStore {
    return new PanelStore(mode, initialPath);
}
