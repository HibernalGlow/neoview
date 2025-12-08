/**
 * 历史面板视图设置 Store（单例）
 * - 独立于 historyStore（数据）
 * - 自动持久化到 localStorage
 */
import { SvelteSet } from 'svelte/reactivity';
import { historyStore } from './history.svelte';
import { bookStore } from './book.svelte';
import type { FsItem } from '$lib/types';

// ==================== 类型 ====================
export type ViewStyle = 'list' | 'content' | 'banner' | 'thumbnail';
export type SortField = 'name' | 'date' | 'size' | 'type' | 'random' | 'rating';
export type SortOrder = 'asc' | 'desc';

// ==================== 持久化 ====================
const STORAGE_KEY = 'neoview-history';

function load() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch { return {}; }
}

function save(data: object) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ==================== 配置（静态） ====================
export const HISTORY_CONFIG = {
    mode: 'history' as const,
    features: {
        navigation: false,
        tabs: false,
        folderTree: false,
        migration: false,
        penetrate: false,
        syncToFolder: true,
    },
    labels: {
        title: '历史记录',
        dateSortLabel: '打开时间',
        deleteLabel: '移除',
        emptyMessage: '暂无历史记录',
    },
};

// ==================== Store 类 ====================
const saved = load();

class HistoryViewStore {
    // 持久化设置
    viewStyle = $state<ViewStyle>(saved.viewStyle ?? 'list');
    sortField = $state<SortField>(saved.sortField ?? 'date');
    sortOrder = $state<SortOrder>(saved.sortOrder ?? 'desc');
    thumbnailWidth = $state<number>(saved.thumbnailWidth ?? 20);
    
    // 运行时状态
    multiSelectMode = $state(false);
    deleteMode = $state(false);
    showSearchBar = $state(false);
    searchKeyword = $state('');
    selectedItems = $state(new SvelteSet<string>());
    items = $state<FsItem[]>([]);
    isLoading = $state(false);
    
    // 配置
    readonly config = HISTORY_CONFIG;
    
    // ==================== 计算属性 ====================
    get filteredItems(): FsItem[] {
        let result = this.items;
        
        // 搜索过滤
        if (this.searchKeyword) {
            const kw = this.searchKeyword.toLowerCase();
            result = result.filter(i => i.name.toLowerCase().includes(kw));
        }
        
        // 排序
        result = this.sortItems(result);
        
        return result;
    }
    
    get selectedCount() { return this.selectedItems.size; }
    get itemCount() { return this.items.length; }
    
    // ==================== 排序 ====================
    private sortItems(items: FsItem[]): FsItem[] {
        if (this.sortField === 'random') {
            return [...items].sort(() => Math.random() - 0.5);
        }
        
        const sorted = [...items].sort((a, b) => {
            let cmp = 0;
            switch (this.sortField) {
                case 'name':
                    cmp = a.name.localeCompare(b.name);
                    break;
                case 'date':
                    cmp = (a.modified ?? 0) - (b.modified ?? 0);
                    break;
                case 'size':
                    cmp = (a.size ?? 0) - (b.size ?? 0);
                    break;
                case 'type': {
                    const extA = a.name.split('.').pop() ?? '';
                    const extB = b.name.split('.').pop() ?? '';
                    cmp = extA.localeCompare(extB);
                    break;
                }
            }
            return this.sortOrder === 'asc' ? cmp : -cmp;
        });
        
        return sorted;
    }
    
    // ==================== 视图设置 ====================
    setViewStyle(v: ViewStyle) {
        this.viewStyle = v;
        this.persist();
    }
    
    setSort(field: SortField) {
        if (field === this.sortField) {
            this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
        }
        this.persist();
    }
    
    setThumbnailWidth(v: number) {
        this.thumbnailWidth = Math.max(10, Math.min(90, v));
        this.persist();
    }
    
    // ==================== 模式切换 ====================
    toggleMultiSelect() {
        this.multiSelectMode = !this.multiSelectMode;
        if (!this.multiSelectMode) {
            this.selectedItems.clear();
        }
    }
    
    toggleDelete() {
        this.deleteMode = !this.deleteMode;
    }
    
    toggleSearch() {
        this.showSearchBar = !this.showSearchBar;
        if (!this.showSearchBar) {
            this.searchKeyword = '';
        }
    }
    
    setSearchKeyword(v: string) {
        this.searchKeyword = v;
    }
    
    // ==================== 选择操作 ====================
    select(path: string) {
        this.selectedItems.add(path);
    }
    
    deselect(path: string) {
        this.selectedItems.delete(path);
    }
    
    toggleSelect(path: string) {
        if (this.selectedItems.has(path)) {
            this.selectedItems.delete(path);
        } else {
            this.selectedItems.add(path);
        }
    }
    
    selectAll() {
        this.filteredItems.forEach(i => this.selectedItems.add(i.path));
    }
    
    deselectAll() {
        this.selectedItems.clear();
    }
    
    // ==================== 数据操作 ====================
    async load() {
        this.isLoading = true;
        try {
            const records = historyStore.getAll();
            this.items = records.map(h => ({
                path: h.path,
                name: h.name,
                isDir: false,
                isImage: true,
                size: 0,
                modified: h.timestamp,
            }));
        } finally {
            this.isLoading = false;
        }
    }
    
    async deleteSelected() {
        for (const path of this.selectedItems) {
            historyStore.removeByPath(path);
        }
        this.selectedItems.clear();
        await this.load();
        // 事件通知
        window.dispatchEvent(new CustomEvent('panel:history-changed'));
    }
    
    async openItem(item: FsItem) {
        await bookStore.openBook(item.path);
        // 事件通知
        window.dispatchEvent(new CustomEvent('panel:item-opened', { 
            detail: { path: item.path, source: 'history' } 
        }));
    }
    
    // ==================== 持久化 ====================
    private persist() {
        save({
            viewStyle: this.viewStyle,
            sortField: this.sortField,
            sortOrder: this.sortOrder,
            thumbnailWidth: this.thumbnailWidth,
        });
    }
}

// ==================== 导出单例 ====================
export const historyViewStore = new HistoryViewStore();
