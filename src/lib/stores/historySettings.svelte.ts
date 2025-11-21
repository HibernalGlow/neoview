/**
 * 历史记录设置 Store
 */

interface HistorySettings {
    /** 选中历史记录后是否同步切换文件树 */
    syncFileTreeOnHistorySelect: boolean;
}

const STORAGE_KEY = 'neoview-history-settings';

// 从 localStorage 加载设置
function loadSettings(): HistorySettings {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (err) {
        console.error('Failed to load history settings:', err);
    }
    // 默认值：不同步文件树（参考 NeeView 默认行为）
    return {
        syncFileTreeOnHistorySelect: false
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

    setSyncFileTreeOnHistorySelect(value: boolean) {
        this.settings.syncFileTreeOnHistorySelect = value;
        saveSettings(this.settings);
    }

    getAll(): HistorySettings {
        return { ...this.settings };
    }

    reset() {
        this.settings = {
            syncFileTreeOnHistorySelect: false
        };
        saveSettings(this.settings);
    }
}

export const historySettingsStore = new HistorySettingsStore();
