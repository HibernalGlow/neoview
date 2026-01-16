/**
 * 历史记录设置 Store
 */

interface HistorySettings {
    /** 选中历史记录后是否同步切换文件树 */
    syncFileTreeOnHistorySelect: boolean;
    /** 选中书签后是否同步切换文件树 */
    syncFileTreeOnBookmarkSelect: boolean;
    /** 历史记录保存数量（0 为无限） */
    maxHistorySize: number;
    /** 书签保存数量（0 为无限） */
    maxBookmarkSize: number;
}

const STORAGE_KEY = 'neoview-history-settings';

// 从 localStorage 加载设置
function loadSettings(): HistorySettings {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // 确保新字段有默认值
            return {
                syncFileTreeOnHistorySelect: parsed.syncFileTreeOnHistorySelect ?? false,
                syncFileTreeOnBookmarkSelect: parsed.syncFileTreeOnBookmarkSelect ?? false,
                maxHistorySize: parsed.maxHistorySize ?? 0,
                maxBookmarkSize: parsed.maxBookmarkSize ?? 0
            };
        }
    } catch (err) {
        console.error('Failed to load history settings:', err);
    }
    // 默认值：不同步文件树（参考 NeeView 默认行为）
    return {
        syncFileTreeOnHistorySelect: false,
        syncFileTreeOnBookmarkSelect: false,
        maxHistorySize: 0,
        maxBookmarkSize: 0
    };
}

// 保存设置到 localStorage
function saveSettings(settings: HistorySettings) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (err) {
        console.error('Failed to save history settings:', err);
    }
}

class HistorySettingsStore {
    private settings = $state<HistorySettings>(loadSettings());

    get syncFileTreeOnHistorySelect() {
        return this.settings.syncFileTreeOnHistorySelect;
    }

    get syncFileTreeOnBookmarkSelect() {
        return this.settings.syncFileTreeOnBookmarkSelect;
    }

    get maxHistorySize() {
        return this.settings.maxHistorySize;
    }

    get maxBookmarkSize() {
        return this.settings.maxBookmarkSize;
    }

    setMaxHistorySize(value: number) {
        this.settings.maxHistorySize = value;
        saveSettings(this.settings);
    }

    setMaxBookmarkSize(value: number) {
        this.settings.maxBookmarkSize = value;
        saveSettings(this.settings);
    }

    setSyncFileTreeOnHistorySelect(value: boolean) {
        this.settings.syncFileTreeOnHistorySelect = value;
        saveSettings(this.settings);
    }

    setSyncFileTreeOnBookmarkSelect(value: boolean) {
        this.settings.syncFileTreeOnBookmarkSelect = value;
        saveSettings(this.settings);
    }

    getAll(): HistorySettings {
        return { ...this.settings };
    }

    reset() {
        this.settings = {
            syncFileTreeOnHistorySelect: false,
            syncFileTreeOnBookmarkSelect: false,
            maxHistorySize: 0,
            maxBookmarkSize: 0
        };
        saveSettings(this.settings);
    }
}

export const historySettingsStore = new HistorySettingsStore();
