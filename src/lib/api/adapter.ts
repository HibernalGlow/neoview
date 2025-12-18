/**
 * NeoView - API Adapter
 * 
 * 统一的 API 适配层，全面使用 Python HTTP API
 * 保留兼容层以支持现有代码
 */

import { PYTHON_API_BASE } from './config';
import { getEndpoint } from './commandMap';

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

// ===== HTTP 请求核心 =====

/**
 * invoke 适配器 - 调用 Python HTTP API
 * @deprecated 建议直接使用专门的 API 模块
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const endpoint = getEndpoint(cmd, args);
    
    if (!endpoint) {
        console.warn(`[Adapter] 未映射的命令: ${cmd}`, args);
        throw new Error(`Command not mapped: ${cmd}`);
    }
    
    const url = `${PYTHON_API_BASE}${endpoint.path}`;
    const body = endpoint.body ? JSON.stringify(endpoint.body(args ?? {})) : undefined;
    
    const response = await fetch(url, {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json' },
        body,
    });
    
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text || 'Request failed'}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
        return response.json();
    }
    
    const text = await response.text();
    if (!text) return null as T;
    
    try {
        return JSON.parse(text);
    } catch {
        return text as T;
    }
}

// ===== 文件路径转换 =====

/**
 * 转换文件路径为可访问的 URL
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function convertFileSrc(path: string, _protocol?: string): string {
    return `${PYTHON_API_BASE}/file?path=${encodeURIComponent(path)}`;
}

/**
 * 转换压缩包内文件路径为可访问的 URL
 */
export function convertArchiveFileSrc(archivePath: string, entryPath: string): string {
    return `${PYTHON_API_BASE}/archive/extract?archive_path=${encodeURIComponent(archivePath)}&inner_path=${encodeURIComponent(entryPath)}`;
}

/**
 * 转换缩略图路径为可访问的 URL
 */
export function convertThumbnailSrc(path: string, innerPath?: string, maxSize?: number): string {
    let url = `${PYTHON_API_BASE}/thumbnail?path=${encodeURIComponent(path)}`;
    if (innerPath) url += `&inner_path=${encodeURIComponent(innerPath)}`;
    if (maxSize) url += `&max_size=${maxSize}`;
    return url;
}

// ===== 事件系统 =====

const eventListeners = new Map<string, Set<(event: { payload: unknown }) => void>>();

/**
 * 监听后端事件
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

// ===== 窗口 API =====

export const mockWindow = {
    async minimize() { console.log('[Adapter] minimize not available in web mode'); },
    async maximize() { console.log('[Adapter] maximize not available in web mode'); },
    async close() { window.close(); },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async setFullscreen(_fullscreen: boolean) { console.log('[Adapter] setFullscreen not available in web mode'); },
    async isFullscreen() { return false; },
    async startDragging() { console.log('[Adapter] startDragging not available in web mode'); },
    async setTitle(title: string) { document.title = title; },
    async toggleMaximize() { console.log('[Adapter] toggleMaximize not available in web mode'); },
};

export async function getCurrentWindow(): Promise<unknown | null> {
    return null;
}

export async function getAppWindow() {
    return mockWindow;
}

// ===== Path API =====

export async function homeDir(): Promise<string> {
    try {
        const result = await invoke<string>('get_home_dir');
        if (result) return result;
    } catch {
        // 忽略错误
    }
    return 'C:\\';
}

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
