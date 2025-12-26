/**
 * 本地存储工具函数
 * 提供统一的 localStorage 读写操作
 */

/**
 * 检查是否在浏览器环境中
 */
export function isBrowser(): boolean {
    return typeof window !== 'undefined' && window.localStorage !== undefined;
}

/**
 * 从 localStorage 读取 JSON 数据
 */
export function readJsonFromLocalStorage(key: string): unknown {
    if (!isBrowser()) {
        return null;
    }
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (error) {
        console.error(`读取本地存储键失败: ${key}`, error);
        return null;
    }
}

/**
 * 向 localStorage 写入 JSON 数据
 */
export function writeJsonToLocalStorage(key: string, value: unknown): boolean {
    if (!isBrowser()) {
        return false;
    }
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error(`写入本地存储键失败: ${key}`, error);
        return false;
    }
}

/**
 * 从 localStorage 读取字符串数据
 */
export function readStringFromLocalStorage(key: string): string | null {
    if (!isBrowser()) {
        return null;
    }
    try {
        return window.localStorage.getItem(key);
    } catch (error) {
        console.error(`读取本地存储键失败: ${key}`, error);
        return null;
    }
}

/**
 * 向 localStorage 写入字符串数据
 */
export function writeStringToLocalStorage(key: string, value: string): boolean {
    if (!isBrowser()) {
        return false;
    }
    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch (error) {
        console.error(`写入本地存储键失败: ${key}`, error);
        return false;
    }
}

/**
 * 从 localStorage 删除数据
 */
export function removeFromLocalStorage(key: string): void {
    if (!isBrowser()) {
        return;
    }
    try {
        window.localStorage.removeItem(key);
    } catch (error) {
        console.error(`删除本地存储键失败: ${key}`, error);
    }
}

/**
 * 读取 UI 状态数据
 */
export function readUiStateFromLocalStorage(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (!isBrowser()) {
        return result;
    }
    try {
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (!key || !key.startsWith('neoview-ui-')) continue;
            const shortKey = key.replace('neoview-ui-', '');
            const value = window.localStorage.getItem(key);
            if (value === null) continue;
            try {
                result[shortKey] = JSON.parse(value);
            } catch {
                result[shortKey] = value;
            }
        }
    } catch (error) {
        console.error('读取 UI 状态失败:', error);
    }
    return result;
}

/**
 * 读取面板布局数据
 */
export function readPanelsLayoutFromLocalStorage(): {
    panels?: unknown;
    sidebars?: unknown;
    sidebarManagement?: unknown;
    sidebarConfig?: unknown;
} {
    const panels = readJsonFromLocalStorage('neoview-panels');
    const sidebars = readJsonFromLocalStorage('neoview-sidebars');
    const sidebarManagement = readJsonFromLocalStorage('neoview-sidebar-management');
    const sidebarConfig = readJsonFromLocalStorage('neoview-sidebar-config');
    return { panels, sidebars, sidebarManagement, sidebarConfig };
}

/**
 * 读取搜索历史数据
 */
export function readSearchHistoryFromLocalStorage(): Record<string, unknown> {
    const keys = [
        'neoview-file-search-history',
        'neoview-bookmark-search-history',
        'neoview-history-search-history'
    ];
    const result: Record<string, unknown> = {};
    if (!isBrowser()) {
        return result;
    }
    for (const key of keys) {
        try {
            const raw = window.localStorage.getItem(key);
            if (!raw) continue;
            const shortKey = key.replace('neoview-', '').replace(/-search-history$/, '');
            try {
                result[shortKey] = JSON.parse(raw);
            } catch {
                result[shortKey] = raw;
            }
        } catch (error) {
            console.error(`读取搜索历史失败: ${key}`, error);
        }
    }
    return result;
}

/**
 * 查找版本化的卡片配置存储键
 */
export function findCardConfigsFromLocalStorage(): { key: string; data: unknown } | null {
    if (!isBrowser()) {
        return null;
    }
    for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('neoview_card_configs_v')) {
            const cardConfigs = readJsonFromLocalStorage(key);
            if (cardConfigs) {
                return { key, data: cardConfigs };
            }
            break;
        }
    }
    return null;
}

/**
 * 读取面板视图模式
 */
export function readPanelViewModesFromLocalStorage(): Record<string, string> {
    const panelViewModes: Record<string, string> = {};
    if (!isBrowser()) {
        return panelViewModes;
    }
    for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('neoview-panel-viewmode-')) {
            const panelId = key.replace('neoview-panel-viewmode-', '');
            const value = window.localStorage.getItem(key);
            if (value) {
                panelViewModes[panelId] = value;
            }
        }
    }
    return panelViewModes;
}
