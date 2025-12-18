/**
 * NeoView - API Adapter
 * 
 * 统一的 API 适配层，全面使用 Python HTTP API
 * 不再依赖 Tauri IPC
 * 
 * 注意：不使用浏览器路由，保持内部状态管理
 */

// Python 后端 API 地址
const PYTHON_API_BASE = import.meta.env.VITE_PYTHON_API_BASE || 'http://localhost:8000/v1';

// 缓存环境检测结果
let _isTauri: boolean | null = null;

/**
 * 检测是否运行在 Tauri 环境中
 * 注意：即使在 Tauri 中，我们也使用 Python HTTP API
 */
export function isRunningInTauri(): boolean {
    if (_isTauri !== null) return _isTauri;
    
    _isTauri = typeof window !== 'undefined' && 
        (('__TAURI__' in window) || ('__TAURI_INTERNALS__' in window));
    
    return _isTauri;
}

/**
 * invoke 适配器 - 调用 Python HTTP API
 * 
 * 保留此函数以兼容旧代码，但实际调用 Python HTTP API
 * @deprecated 请直接使用 http-bridge.ts 中的函数
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    // 将 Tauri 命令映射到 Python API
    const endpoint = mapCommandToEndpoint(cmd, args);
    
    if (!endpoint) {
        console.warn(`[Adapter] 未映射的命令: ${cmd}`, args);
        throw new Error(`Command not mapped: ${cmd}`);
    }
    
    const response = await fetch(`${PYTHON_API_BASE}${endpoint.path}`, {
        method: endpoint.method,
        headers: {
            'Content-Type': 'application/json',
        },
        body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
    });
    
    if (!response.ok) {
        const text = await response.text();
        console.warn(`[Adapter] HTTP ${response.status} for ${cmd}:`, text);
        throw new Error(`HTTP ${response.status}: ${text || 'Request failed'}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
        return response.json();
    }
    
    const text = await response.text();
    if (!text) {
        return null as T;
    }
    
    // 尝试解析为 JSON
    try {
        return JSON.parse(text);
    } catch {
        return text as T;
    }
}

/**
 * 命令到端点的映射
 */
interface EndpointMapping {
    path: string;
    method: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
}

function mapCommandToEndpoint(cmd: string, args?: Record<string, unknown>): EndpointMapping | null {
    // 目录相关
    if (cmd === 'load_directory_snapshot') {
        return { path: `/directory/snapshot?path=${encodeURIComponent(args?.path as string)}`, method: 'GET' };
    }
    if (cmd === 'list_subfolders') {
        return { path: `/directory/subfolders?path=${encodeURIComponent(args?.path as string)}`, method: 'GET' };
    }
    if (cmd === 'get_images_in_directory') {
        return { path: `/directory/images?path=${encodeURIComponent(args?.path as string)}&recursive=${args?.recursive ?? false}`, method: 'GET' };
    }
    if (cmd === 'read_directory') {
        return { path: `/directory/list?path=${encodeURIComponent(args?.path as string)}`, method: 'GET' };
    }
    
    // 文件相关
    if (cmd === 'path_exists') {
        return { path: `/file/exists?path=${encodeURIComponent(args?.path as string)}`, method: 'GET' };
    }
    if (cmd === 'get_file_info' || cmd === 'get_file_metadata') {
        return { path: `/file/info?path=${encodeURIComponent(args?.path as string)}`, method: 'GET' };
    }
    if (cmd === 'create_directory') {
        return { path: '/file/mkdir', method: 'POST', body: { path: args?.path } };
    }
    if (cmd === 'delete_path' || cmd === 'delete_file') {
        return { path: `/file?path=${encodeURIComponent(args?.path as string)}`, method: 'DELETE' };
    }
    if (cmd === 'rename_path') {
        return { path: '/file/rename', method: 'POST', body: { from_path: args?.from, to_path: args?.to } };
    }
    if (cmd === 'move_to_trash' || cmd === 'move_to_trash_async') {
        return { path: '/file/trash', method: 'POST', body: { path: args?.path } };
    }
    if (cmd === 'read_text_file') {
        return { path: `/file/text?path=${encodeURIComponent(args?.path as string)}`, method: 'GET' };
    }
    if (cmd === 'write_text_file') {
        return { path: '/file/write', method: 'POST', body: { path: args?.path, content: args?.content } };
    }
    
    // 压缩包相关
    if (cmd === 'list_archive_contents') {
        return { path: `/archive/list?path=${encodeURIComponent(args?.archivePath as string)}`, method: 'GET' };
    }
    
    // 缩略图相关
    if (cmd === 'init_thumbnail_service_v3') {
        return { path: '/thumbnail/init', method: 'POST', body: args };
    }
    if (cmd === 'request_visible_thumbnails_v3') {
        return { path: '/thumbnail/visible', method: 'POST', body: args };
    }
    if (cmd === 'cancel_thumbnail_requests_v3') {
        return { path: '/thumbnail/cancel', method: 'POST', body: { dir: args?.dir } };
    }
    if (cmd === 'reload_thumbnail_v3') {
        return { path: '/thumbnail/reload', method: 'POST', body: args };
    }
    if (cmd === 'clear_thumbnail_cache_v3') {
        return { path: '/thumbnail/cache', method: 'DELETE' };
    }
    if (cmd === 'vacuum_thumbnail_db_v3') {
        return { path: '/thumbnail/vacuum', method: 'POST' };
    }
    if (cmd === 'preload_directory_thumbnails_v3') {
        return { path: '/thumbnail/preload', method: 'POST', body: args };
    }
    
    // 书籍相关
    if (cmd === 'open_book') {
        return { path: `/book/open?path=${encodeURIComponent(args?.path as string)}`, method: 'POST' };
    }
    if (cmd === 'close_book') {
        return { path: '/book/close', method: 'POST' };
    }
    if (cmd === 'get_current_book') {
        return { path: '/book/current', method: 'GET' };
    }
    if (cmd === 'navigate_to_page') {
        return { path: '/book/navigate', method: 'POST', body: { page_index: args?.pageIndex } };
    }
    if (cmd === 'next_page') {
        return { path: '/book/next', method: 'POST' };
    }
    if (cmd === 'previous_page') {
        return { path: '/book/previous', method: 'POST' };
    }
    if (cmd === 'set_book_sort_mode') {
        return { path: '/book/sort', method: 'POST', body: { sort_mode: args?.sortMode } };
    }
    
    // 超分相关
    if (cmd === 'upscale_service_init' || cmd === 'init_pyo3_upscaler') {
        return { path: '/upscale/init', method: 'POST', body: args };
    }
    if (cmd === 'upscale_service_request') {
        return { path: '/upscale/request', method: 'POST', body: args };
    }
    if (cmd === 'upscale_service_cancel_page') {
        return { path: `/upscale/cancel/${args?.taskId || 'current'}`, method: 'POST' };
    }
    if (cmd === 'check_pyo3_upscaler_availability') {
        return { path: '/upscale/available', method: 'GET' };
    }
    if (cmd === 'get_pyo3_available_models') {
        return { path: '/upscale/models', method: 'GET' };
    }
    if (cmd === 'get_pyo3_cache_stats') {
        return { path: '/upscale/cache-stats', method: 'GET' };
    }
    if (cmd === 'upscale_service_set_enabled') {
        return { path: '/upscale/enabled', method: 'POST', body: { enabled: args?.enabled } };
    }
    if (cmd === 'upscale_service_sync_conditions') {
        return { path: '/upscale/conditions', method: 'POST', body: args };
    }
    if (cmd === 'upscale_service_set_current_book') {
        return { path: '/upscale/current-book', method: 'POST', body: { book_path: args?.bookPath } };
    }
    if (cmd === 'upscale_service_set_current_page') {
        return { path: '/upscale/current-page', method: 'POST', body: { page_index: args?.pageIndex } };
    }
    if (cmd === 'upscale_service_request_preload_range') {
        return { path: '/upscale/preload-range', method: 'POST', body: args };
    }
    if (cmd === 'upscale_service_cancel_book') {
        return { path: '/upscale/cancel-book', method: 'POST', body: { book_path: args?.bookPath } };
    }
    if (cmd === 'upscale_service_clear_cache') {
        return { path: '/upscale/clear-cache', method: 'POST', body: { book_path: args?.bookPath } };
    }
    if (cmd === 'pyo3_cancel_job') {
        return { path: '/upscale/cancel-job', method: 'POST', body: { job_key: args?.jobKey } };
    }
    
    // 视频相关
    if (cmd === 'generate_video_thumbnail') {
        return { path: `/video/thumbnail?path=${encodeURIComponent(args?.videoPath as string)}&time_seconds=${args?.timeSeconds ?? 10}`, method: 'GET' };
    }
    if (cmd === 'get_video_duration') {
        return { path: `/video/duration?path=${encodeURIComponent(args?.videoPath as string)}`, method: 'GET' };
    }
    if (cmd === 'is_video_file') {
        return { path: `/video/check?path=${encodeURIComponent(args?.filePath as string)}`, method: 'GET' };
    }
    if (cmd === 'check_ffmpeg_available') {
        return { path: '/system/ffmpeg', method: 'GET' };
    }
    
    // 系统相关
    if (cmd === 'get_startup_config') {
        return { path: '/system/startup-config', method: 'GET' };
    }
    if (cmd === 'save_startup_config') {
        return { path: '/system/startup-config', method: 'POST', body: args?.config };
    }
    if (cmd === 'update_startup_config_field') {
        return { path: '/system/startup-config/field', method: 'POST', body: { field: args?.field, value: args?.value } };
    }
    if (cmd === 'get_home_dir') {
        return { path: '/system/home-dir', method: 'GET' };
    }
    
    // EMM 相关
    if (cmd === 'find_emm_databases') {
        return { path: '/emm/databases', method: 'GET' };
    }
    if (cmd === 'find_emm_setting_file') {
        return { path: '/emm/setting-file', method: 'GET' };
    }
    if (cmd === 'load_emm_metadata') {
        return { path: '/emm/metadata', method: 'GET' };
    }
    if (cmd === 'save_emm_json') {
        return { path: '/emm/save', method: 'POST', body: args };
    }
    if (cmd === 'get_emm_json') {
        return { path: `/emm/json?path=${encodeURIComponent(args?.path as string)}`, method: 'GET' };
    }
    if (cmd === 'update_rating_data') {
        return { path: '/emm/rating', method: 'POST', body: args };
    }
    if (cmd === 'update_manual_tags') {
        return { path: '/emm/manual-tags', method: 'POST', body: args };
    }
    if (cmd === 'save_ai_translation') {
        return { path: '/emm/ai-translation', method: 'POST', body: args };
    }
    
    // 页面帧相关
    if (cmd === 'pf_update_context') {
        return { path: '/page-frame/context', method: 'POST', body: args };
    }
    
    // 图片尺寸相关
    if (cmd === 'get_image_dimensions') {
        return { path: `/dimensions?path=${encodeURIComponent(args?.path as string)}`, method: 'GET' };
    }
    
    return null;
}

/**
 * convertFileSrc 适配器 - 转换文件路径为可访问的 URL
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
    if (innerPath) {
        url += `&inner_path=${encodeURIComponent(innerPath)}`;
    }
    if (maxSize) {
        url += `&max_size=${maxSize}`;
    }
    return url;
}

// 事件监听器存储
const eventListeners = new Map<string, Set<(event: { payload: unknown }) => void>>();

/**
 * listen 适配器 - 监听后端事件
 * 
 * 注意：Python 后端使用 WebSocket 推送事件
 */
export async function listen<T>(
    event: string,
    handler: (event: { payload: T }) => void
): Promise<() => void> {
    // 注册事件处理器
    if (!eventListeners.has(event)) {
        eventListeners.set(event, new Set());
    }
    eventListeners.get(event)!.add(handler as (event: { payload: unknown }) => void);
    
    // 返回取消监听函数
    return () => {
        const handlers = eventListeners.get(event);
        if (handlers) {
            handlers.delete(handler as (event: { payload: unknown }) => void);
            if (handlers.size === 0) {
                eventListeners.delete(event);
            }
        }
    };
}

/**
 * emit 适配器 - 发送事件
 */
export async function emit(event: string, payload?: unknown): Promise<void> {
    // 触发本地监听器
    const handlers = eventListeners.get(event);
    if (handlers) {
        for (const handler of handlers) {
            handler({ payload });
        }
    }
}

/**
 * 获取当前运行模式
 */
export function getRunMode(): 'tauri' | 'web' {
    return isRunningInTauri() ? 'tauri' : 'web';
}

// 导出类型（兼容旧代码）
export type UnlistenFn = () => void;

// ===== 窗口 API 适配器 =====

export async function getCurrentWindow(): Promise<unknown | null> {
    return null;
}

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

export async function getAppWindow() {
    return mockWindow;
}

// ===== Path API 适配器 =====

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
