/**
 * 虚拟面板设置 Store
 * 为历史面板和书签面板提供独立的工具栏状态
 */

import type { FolderViewStyle, FolderSortField, FolderSortOrder } from '$lib/components/panels/folderPanel/stores/folderPanelStore.svelte';

export type TreePosition = 'left' | 'right' | 'top' | 'bottom';

export interface VirtualPanelSettings {
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
    folderTreeVisible: boolean;
    folderTreeLayout: TreePosition;
    folderTreeSize: number;
}

const STORAGE_KEY_HISTORY = 'neoview-history-panel-settings';
const STORAGE_KEY_BOOKMARK = 'neoview-bookmark-panel-settings';

function createDefaultSettings(): VirtualPanelSettings {
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
        thumbnailWidthPercent: 20,
        folderTreeVisible: false,
        folderTreeLayout: 'left',
        folderTreeSize: 200
    };
}

function loadSettings(storageKey: string): VirtualPanelSettings {
    try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
            const parsed = JSON.parse(stored);
            return { ...createDefaultSettings(), ...parsed };
        }
    } catch (err) {
        console.error(`Failed to load settings from ${storageKey}:`, err);
    }
    return createDefaultSettings();
}

function saveSettings(storageKey: string, settings: VirtualPanelSettings) {
    try {
        localStorage.setItem(storageKey, JSON.stringify(settings));
    } catch (err) {
        console.error(`Failed to save settings to ${storageKey}:`, err);
    }
}

class VirtualPanelSettingsStore {
    private historySettings = $state<VirtualPanelSettings>(loadSettings(STORAGE_KEY_HISTORY));
    private bookmarkSettings = $state<VirtualPanelSettings>(loadSettings(STORAGE_KEY_BOOKMARK));

    // History panel getters
    get historyViewStyle() { return this.historySettings.viewStyle; }
    get historySortField() { return this.historySettings.sortField; }
    get historySortOrder() { return this.historySettings.sortOrder; }
    get historyMultiSelectMode() { return this.historySettings.multiSelectMode; }
    get historyDeleteMode() { return this.historySettings.deleteMode; }
    get historyShowSearchBar() { return this.historySettings.showSearchBar; }
    get historyShowMigrationBar() { return this.historySettings.showMigrationBar; }
    get historyPenetrateMode() { return this.historySettings.penetrateMode; }
    get historyInlineTreeMode() { return this.historySettings.inlineTreeMode; }
    get historyThumbnailWidthPercent() { return this.historySettings.thumbnailWidthPercent; }
    get historyFolderTreeVisible() { return this.historySettings.folderTreeVisible; }
    get historyFolderTreeLayout() { return this.historySettings.folderTreeLayout; }
    get historyFolderTreeSize() { return this.historySettings.folderTreeSize; }
    get historyFolderTreeConfig() { return { visible: this.historySettings.folderTreeVisible, layout: this.historySettings.folderTreeLayout, size: this.historySettings.folderTreeSize }; }

    // Bookmark panel getters
    get bookmarkViewStyle() { return this.bookmarkSettings.viewStyle; }
    get bookmarkSortField() { return this.bookmarkSettings.sortField; }
    get bookmarkSortOrder() { return this.bookmarkSettings.sortOrder; }
    get bookmarkMultiSelectMode() { return this.bookmarkSettings.multiSelectMode; }
    get bookmarkDeleteMode() { return this.bookmarkSettings.deleteMode; }
    get bookmarkShowSearchBar() { return this.bookmarkSettings.showSearchBar; }
    get bookmarkShowMigrationBar() { return this.bookmarkSettings.showMigrationBar; }
    get bookmarkPenetrateMode() { return this.bookmarkSettings.penetrateMode; }
    get bookmarkInlineTreeMode() { return this.bookmarkSettings.inlineTreeMode; }
    get bookmarkThumbnailWidthPercent() { return this.bookmarkSettings.thumbnailWidthPercent; }
    get bookmarkFolderTreeVisible() { return this.bookmarkSettings.folderTreeVisible; }
    get bookmarkFolderTreeLayout() { return this.bookmarkSettings.folderTreeLayout; }
    get bookmarkFolderTreeSize() { return this.bookmarkSettings.folderTreeSize; }
    get bookmarkFolderTreeConfig() { return { visible: this.bookmarkSettings.folderTreeVisible, layout: this.bookmarkSettings.folderTreeLayout, size: this.bookmarkSettings.folderTreeSize }; }

    // Generic getters by mode
    getSettings(mode: 'history' | 'bookmark'): VirtualPanelSettings {
        return mode === 'history' ? { ...this.historySettings } : { ...this.bookmarkSettings };
    }

    // History panel setters
    setHistoryViewStyle(value: FolderViewStyle) {
        this.historySettings.viewStyle = value;
        saveSettings(STORAGE_KEY_HISTORY, this.historySettings);
    }
    setHistorySortField(value: FolderSortField) {
        this.historySettings.sortField = value;
        saveSettings(STORAGE_KEY_HISTORY, this.historySettings);
    }
    setHistorySortOrder(value: FolderSortOrder) {
        this.historySettings.sortOrder = value;
        saveSettings(STORAGE_KEY_HISTORY, this.historySettings);
    }
    toggleHistoryMultiSelectMode() {
        this.historySettings.multiSelectMode = !this.historySettings.multiSelectMode;
        saveSettings(STORAGE_KEY_HISTORY, this.historySettings);
    }
    toggleHistoryDeleteMode() {
        this.historySettings.deleteMode = !this.historySettings.deleteMode;
        saveSettings(STORAGE_KEY_HISTORY, this.historySettings);
    }
    toggleHistoryShowSearchBar() {
        this.historySettings.showSearchBar = !this.historySettings.showSearchBar;
        saveSettings(STORAGE_KEY_HISTORY, this.historySettings);
    }
    toggleHistoryShowMigrationBar() {
        this.historySettings.showMigrationBar = !this.historySettings.showMigrationBar;
        saveSettings(STORAGE_KEY_HISTORY, this.historySettings);
    }
    toggleHistoryPenetrateMode() {
        this.historySettings.penetrateMode = !this.historySettings.penetrateMode;
        saveSettings(STORAGE_KEY_HISTORY, this.historySettings);
    }
    toggleHistoryInlineTreeMode() {
        this.historySettings.inlineTreeMode = !this.historySettings.inlineTreeMode;
        saveSettings(STORAGE_KEY_HISTORY, this.historySettings);
    }
    setHistoryThumbnailWidthPercent(value: number) {
        this.historySettings.thumbnailWidthPercent = Math.max(10, Math.min(50, value));
        saveSettings(STORAGE_KEY_HISTORY, this.historySettings);
    }
    toggleHistoryFolderTreeVisible() {
        this.historySettings.folderTreeVisible = !this.historySettings.folderTreeVisible;
        saveSettings(STORAGE_KEY_HISTORY, this.historySettings);
    }
    setHistoryFolderTreeLayout(value: TreePosition) {
        this.historySettings.folderTreeLayout = value;
        saveSettings(STORAGE_KEY_HISTORY, this.historySettings);
    }
    setHistoryFolderTreeSize(value: number) {
        this.historySettings.folderTreeSize = Math.max(100, Math.min(500, value));
        saveSettings(STORAGE_KEY_HISTORY, this.historySettings);
    }
    setHistorySort(field: FolderSortField, order?: FolderSortOrder) {
        const newOrder = order ?? (this.historySettings.sortField === field && this.historySettings.sortOrder === 'asc' ? 'desc' : 'asc');
        this.historySettings.sortField = field;
        this.historySettings.sortOrder = newOrder;
        saveSettings(STORAGE_KEY_HISTORY, this.historySettings);
    }

    // Bookmark panel setters
    setBookmarkViewStyle(value: FolderViewStyle) {
        this.bookmarkSettings.viewStyle = value;
        saveSettings(STORAGE_KEY_BOOKMARK, this.bookmarkSettings);
    }
    setBookmarkSortField(value: FolderSortField) {
        this.bookmarkSettings.sortField = value;
        saveSettings(STORAGE_KEY_BOOKMARK, this.bookmarkSettings);
    }
    setBookmarkSortOrder(value: FolderSortOrder) {
        this.bookmarkSettings.sortOrder = value;
        saveSettings(STORAGE_KEY_BOOKMARK, this.bookmarkSettings);
    }
    toggleBookmarkMultiSelectMode() {
        this.bookmarkSettings.multiSelectMode = !this.bookmarkSettings.multiSelectMode;
        saveSettings(STORAGE_KEY_BOOKMARK, this.bookmarkSettings);
    }
    toggleBookmarkDeleteMode() {
        this.bookmarkSettings.deleteMode = !this.bookmarkSettings.deleteMode;
        saveSettings(STORAGE_KEY_BOOKMARK, this.bookmarkSettings);
    }
    toggleBookmarkShowSearchBar() {
        this.bookmarkSettings.showSearchBar = !this.bookmarkSettings.showSearchBar;
        saveSettings(STORAGE_KEY_BOOKMARK, this.bookmarkSettings);
    }
    toggleBookmarkShowMigrationBar() {
        this.bookmarkSettings.showMigrationBar = !this.bookmarkSettings.showMigrationBar;
        saveSettings(STORAGE_KEY_BOOKMARK, this.bookmarkSettings);
    }
    toggleBookmarkPenetrateMode() {
        this.bookmarkSettings.penetrateMode = !this.bookmarkSettings.penetrateMode;
        saveSettings(STORAGE_KEY_BOOKMARK, this.bookmarkSettings);
    }
    toggleBookmarkInlineTreeMode() {
        this.bookmarkSettings.inlineTreeMode = !this.bookmarkSettings.inlineTreeMode;
        saveSettings(STORAGE_KEY_BOOKMARK, this.bookmarkSettings);
    }
    setBookmarkThumbnailWidthPercent(value: number) {
        this.bookmarkSettings.thumbnailWidthPercent = Math.max(10, Math.min(50, value));
        saveSettings(STORAGE_KEY_BOOKMARK, this.bookmarkSettings);
    }
    toggleBookmarkFolderTreeVisible() {
        this.bookmarkSettings.folderTreeVisible = !this.bookmarkSettings.folderTreeVisible;
        saveSettings(STORAGE_KEY_BOOKMARK, this.bookmarkSettings);
    }
    setBookmarkFolderTreeLayout(value: TreePosition) {
        this.bookmarkSettings.folderTreeLayout = value;
        saveSettings(STORAGE_KEY_BOOKMARK, this.bookmarkSettings);
    }
    setBookmarkFolderTreeSize(value: number) {
        this.bookmarkSettings.folderTreeSize = Math.max(100, Math.min(500, value));
        saveSettings(STORAGE_KEY_BOOKMARK, this.bookmarkSettings);
    }
    setBookmarkSort(field: FolderSortField, order?: FolderSortOrder) {
        const newOrder = order ?? (this.bookmarkSettings.sortField === field && this.bookmarkSettings.sortOrder === 'asc' ? 'desc' : 'asc');
        this.bookmarkSettings.sortField = field;
        this.bookmarkSettings.sortOrder = newOrder;
        saveSettings(STORAGE_KEY_BOOKMARK, this.bookmarkSettings);
    }
}

export const virtualPanelSettingsStore = new VirtualPanelSettingsStore();
