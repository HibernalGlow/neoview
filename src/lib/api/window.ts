/**
 * NeoView - Window API
 * 
 * 窗口管理 API，封装 Tauri 窗口功能
 * Web 模式下提供 mock 实现
 */

// ===== 环境检测 =====

let _isTauri: boolean | null = null;

/**
 * 检测是否运行在 Tauri 环境中
 */
export function isRunningInTauri(): boolean {
    if (_isTauri !== null) return _isTauri;
    _isTauri = typeof window !== 'undefined' && 
        (('__TAURI__' in window) || ('__TAURI_INTERNALS__' in window));
    return _isTauri;
}

/**
 * 获取当前运行模式
 */
export function getRunMode(): 'tauri' | 'web' {
    return isRunningInTauri() ? 'tauri' : 'web';
}

// ===== 窗口 API =====

/**
 * Mock 窗口对象（Web 模式）
 */
export const mockWindow = {
    async minimize() { console.log('[Window] minimize not available in web mode'); },
    async maximize() { console.log('[Window] maximize not available in web mode'); },
    async close() { window.close(); },
    async setFullscreen(_fullscreen: boolean) { console.log('[Window] setFullscreen not available in web mode'); },
    async isFullscreen() { return false; },
    async startDragging() { console.log('[Window] startDragging not available in web mode'); },
    async setTitle(title: string) { document.title = title; },
    async toggleMaximize() { console.log('[Window] toggleMaximize not available in web mode'); },
};

/**
 * 获取当前窗口对象
 */
export async function getCurrentWindow(): Promise<unknown | null> {
    return null;
}

/**
 * 获取应用窗口
 */
export async function getAppWindow() {
    return mockWindow;
}

// ===== 事件系统 =====

const eventListeners = new Map<string, Set<(event: { payload: unknown }) => void>>();

/**
 * 监听事件
 */
export async function listen<T>(
    event: string,
    handler: (event: { payload: T }) => void
): Promise<() => void> {
    if (!eventListeners.has(event)) {
        eventListeners.set(event, new Set());
    }
    eventListeners.get(event)!.add(handler as (event: { payload: unknown }) => void);
    
    return () => {
        const handlers = eventListeners.get(event);
        if (handlers) {
            handlers.delete(handler as (event: { payload: unknown }) => void);
            if (handlers.size === 0) eventListeners.delete(event);
        }
    };
}

/**
 * 发送事件
 */
export async function emit(event: string, payload?: unknown): Promise<void> {
    const handlers = eventListeners.get(event);
    if (handlers) {
        for (const handler of handlers) {
            handler({ payload });
        }
    }
}

// ===== Path API =====

import { apiGet } from './http-bridge';

/**
 * 获取用户主目录
 */
export async function homeDir(): Promise<string> {
    try {
        const result = await apiGet<string>('/system/home-dir');
        if (result) return result;
    } catch {
        // 忽略错误
    }
    return 'C:\\';
}

/**
 * 获取应用数据目录
 */
export async function appDataDir(): Promise<string> {
    return '';
}

/**
 * 获取路径的目录部分
 */
export async function dirname(path: string): Promise<string> {
    const sep = path.includes('/') ? '/' : '\\';
    const parts = path.split(sep);
    parts.pop();
    return parts.join(sep) || sep;
}

/**
 * 连接路径
 */
export async function join(...paths: string[]): Promise<string> {
    const sep = paths[0]?.includes('/') ? '/' : '\\';
    return paths.join(sep).replace(/[/\\]+/g, sep);
}

/**
 * 获取路径的文件名部分
 */
export async function basename(path: string): Promise<string> {
    const sep = path.includes('/') ? '/' : '\\';
    const parts = path.split(sep);
    return parts[parts.length - 1] || '';
}

// ===== 类型导出 =====

export type UnlistenFn = () => void;
