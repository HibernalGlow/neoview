/**
 * NeoView - API Adapter
 * 
 * 统一的 API 适配层，根据运行环境自动选择：
 * - Tauri 桌面模式：使用原生 IPC
 * - Web 浏览器模式：使用 HTTP API
 */

// API 服务器地址
const API_BASE_URL = 'http://localhost:3457';

// 缓存环境检测结果
let _isTauri: boolean | null = null;

/**
 * 检测是否运行在 Tauri 环境中
 */
export function isRunningInTauri(): boolean {
    if (_isTauri !== null) return _isTauri;
    
    // 检测 window.__TAURI__ 或 window.__TAURI_INTERNALS__
    _isTauri = typeof window !== 'undefined' && 
        (('__TAURI__' in window) || ('__TAURI_INTERNALS__' in window));
    
    return _isTauri;
}

/**
 * invoke 适配器 - 调用后端命令
 * 
 * 与 @tauri-apps/api/core 的 invoke 签名相同
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (isRunningInTauri()) {
        // Tauri 模式：使用原生 IPC
        const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
        return tauriInvoke<T>(cmd, args);
    }
    
    // Web 模式：使用 HTTP API
    const response = await fetch(`${API_BASE_URL}/api/invoke/${cmd}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: args ? JSON.stringify(args) : '{}',
    });
    
    // 检查 HTTP 状态
    if (!response.ok) {
        const text = await response.text();
        console.warn(`[Adapter] HTTP ${response.status} for ${cmd}:`, text);
        throw new Error(`HTTP ${response.status}: ${text || 'Request failed'}`);
    }
    
    const text = await response.text();
    if (!text) {
        // 空响应，返回 null
        return null as T;
    }
    
    const result = JSON.parse(text);
    
    if (!result.success) {
        throw new Error(result.error || 'Unknown error');
    }
    
    return result.data as T;
}

/**
 * convertFileSrc 适配器 - 转换文件路径为可访问的 URL
 * 
 * 与 @tauri-apps/api/core 的 convertFileSrc 签名相同
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function convertFileSrc(path: string, _protocol?: string): string {
    if (isRunningInTauri()) {
        // Tauri 模式：使用原生转换
        // 动态导入会有问题，这里直接构造 asset URL
        return `asset://localhost/${encodeURIComponent(path)}`;
    }
    
    // Web 模式：使用 HTTP API
    return `${API_BASE_URL}/api/asset?path=${encodeURIComponent(path)}`;
}

/**
 * 转换压缩包内文件路径为可访问的 URL
 */
export function convertArchiveFileSrc(archivePath: string, entryPath: string): string {
    if (isRunningInTauri()) {
        // Tauri 模式：使用 asset 协议
        return `asset://localhost/${encodeURIComponent(archivePath)}?entry=${encodeURIComponent(entryPath)}`;
    }
    
    // Web 模式：使用 HTTP API
    return `${API_BASE_URL}/api/asset?path=${encodeURIComponent(archivePath)}&entry=${encodeURIComponent(entryPath)}`;
}

// SSE 连接管理
let sseConnection: EventSource | null = null;
const eventHandlers = new Map<string, Set<(payload: unknown) => void>>();

/**
 * listen 适配器 - 监听后端事件
 * 
 * 与 @tauri-apps/api/event 的 listen 签名相同
 */
export async function listen<T>(
    event: string,
    handler: (event: { payload: T }) => void
): Promise<() => void> {
    if (isRunningInTauri()) {
        // Tauri 模式：使用原生事件系统
        const { listen: tauriListen } = await import('@tauri-apps/api/event');
        return tauriListen<T>(event, handler);
    }
    
    // Web 模式：使用 SSE
    ensureSseConnection();
    
    // 注册事件处理器
    if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set());
    }
    eventHandlers.get(event)!.add(handler as (payload: unknown) => void);
    
    // 返回取消监听函数
    return () => {
        const handlers = eventHandlers.get(event);
        if (handlers) {
            handlers.delete(handler as (payload: unknown) => void);
            if (handlers.size === 0) {
                eventHandlers.delete(event);
            }
        }
    };
}

/**
 * emit 适配器 - 发送事件到后端
 * 
 * 与 @tauri-apps/api/event 的 emit 签名相同
 */
export async function emit(event: string, payload?: unknown): Promise<void> {
    if (isRunningInTauri()) {
        // Tauri 模式：使用原生事件系统
        const { emit: tauriEmit } = await import('@tauri-apps/api/event');
        return tauriEmit(event, payload);
    }
    
    // Web 模式：通过 HTTP 发送事件
    // 注意：SSE 是单向的，如果需要双向通信可以考虑 WebSocket
    console.warn('[Adapter] emit in web mode is not fully supported');
}

/**
 * 确保 SSE 连接已建立
 */
function ensureSseConnection(): void {
    if (sseConnection && sseConnection.readyState !== EventSource.CLOSED) {
        return;
    }
    
    sseConnection = new EventSource(`${API_BASE_URL}/api/events`);
    
    sseConnection.onopen = () => {
        console.log('[Adapter] SSE 连接已建立');
    };
    
    sseConnection.onerror = (error) => {
        console.error('[Adapter] SSE 连接错误:', error);
        // 自动重连（EventSource 会自动重连，但我们可以添加额外逻辑）
        setTimeout(() => {
            if (sseConnection?.readyState === EventSource.CLOSED) {
                console.log('[Adapter] 尝试重新连接 SSE...');
                ensureSseConnection();
            }
        }, 3000);
    };
    
    sseConnection.onmessage = (event) => {
        // 默认消息处理
        console.log('[Adapter] SSE 消息:', event.data);
    };
    
    // 监听所有已注册的事件类型
    // 注意：SSE 的 addEventListener 需要在服务端发送对应的 event 类型
    sseConnection.addEventListener('connected', () => {
        console.log('[Adapter] SSE 连接确认');
    });
}

/**
 * 关闭 SSE 连接
 */
export function closeSseConnection(): void {
    if (sseConnection) {
        sseConnection.close();
        sseConnection = null;
    }
}

/**
 * 获取当前运行模式
 */
export function getRunMode(): 'tauri' | 'web' {
    return isRunningInTauri() ? 'tauri' : 'web';
}

// 导出类型
export type { UnlistenFn } from '@tauri-apps/api/event';


// ===== 窗口 API 适配器 =====

/**
 * 安全获取当前窗口
 * 在浏览器中返回 null
 */
export async function getCurrentWindow(): Promise<unknown | null> {
    if (!isRunningInTauri()) {
        return null;
    }
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    return getCurrentWebviewWindow();
}

/**
 * 窗口操作的空实现（用于浏览器模式）
 */
export const mockWindow = {
    async minimize() { console.log('[Adapter] minimize not available in browser'); },
    async maximize() { console.log('[Adapter] maximize not available in browser'); },
    async close() { window.close(); },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async setFullscreen(_fullscreen: boolean) { console.log('[Adapter] setFullscreen not available in browser'); },
    async isFullscreen() { return false; },
    async startDragging() { console.log('[Adapter] startDragging not available in browser'); },
    async setTitle(title: string) { document.title = title; },
    async toggleMaximize() { console.log('[Adapter] toggleMaximize not available in browser'); },
};

/**
 * 获取窗口对象（Tauri 或 mock）
 */
export async function getAppWindow() {
    if (isRunningInTauri()) {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        return getCurrentWebviewWindow();
    }
    return mockWindow;
}


// ===== Path API 适配器 =====

/**
 * homeDir 适配器 - 获取用户主目录
 * 
 * 与 @tauri-apps/api/path 的 homeDir 签名相同
 */
export async function homeDir(): Promise<string> {
    if (isRunningInTauri()) {
        const { homeDir: tauriHomeDir } = await import('@tauri-apps/api/path');
        return tauriHomeDir();
    }
    
    // Web 模式：返回根目录或通过 API 获取
    // 浏览器无法直接获取用户主目录，返回一个默认值
    return '/';
}

/**
 * appDataDir 适配器 - 获取应用数据目录
 * 
 * 与 @tauri-apps/api/path 的 appDataDir 签名相同
 */
export async function appDataDir(): Promise<string> {
    if (isRunningInTauri()) {
        const { appDataDir: tauriAppDataDir } = await import('@tauri-apps/api/path');
        return tauriAppDataDir();
    }
    
    // Web 模式：返回空字符串
    return '';
}
