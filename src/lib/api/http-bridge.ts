/**
 * NeoView - HTTP Bridge
 * 
 * Python 后端 HTTP API 桥接层
 * 提供文件 URL 生成、API 调用封装等功能
 * 
 * 注意：不使用浏览器路由，保持内部状态管理
 */

import { PYTHON_API_BASE, getWsBaseUrl } from './config';

// 重新导出 PYTHON_API_BASE 供其他模块使用
export { PYTHON_API_BASE };

/**
 * 获取 API 基础 URL
 */
export function getApiBase(): string {
    return PYTHON_API_BASE;
}

/**
 * 生成文件访问 URL
 * @param path 本地文件路径
 */
export function getFileUrl(path: string): string {
    return `${PYTHON_API_BASE}/file?path=${encodeURIComponent(path)}`;
}

/**
 * 生成压缩包内文件访问 URL
 * @param archivePath 压缩包路径
 * @param innerPath 压缩包内文件路径
 */
export function getArchiveFileUrl(archivePath: string, innerPath: string): string {
    return `${PYTHON_API_BASE}/archive/extract?archive_path=${encodeURIComponent(archivePath)}&inner_path=${encodeURIComponent(innerPath)}`;
}

/**
 * 生成缩略图 URL
 * @param path 文件路径
 * @param innerPath 压缩包内路径（可选）
 * @param maxSize 最大尺寸（可选）
 */
export function getThumbnailUrl(path: string, innerPath?: string, maxSize?: number): string {
    let url = `${PYTHON_API_BASE}/thumbnail?path=${encodeURIComponent(path)}`;
    if (innerPath) {
        url += `&inner_path=${encodeURIComponent(innerPath)}`;
    }
    if (maxSize) {
        url += `&max_size=${maxSize}`;
    }
    return url;
}

/**
 * 生成视频文件 URL
 * @param path 视频文件路径
 */
export function getVideoUrl(path: string): string {
    return `${PYTHON_API_BASE}/file?path=${encodeURIComponent(path)}`;
}

/**
 * 生成 EPUB 图片 URL
 * @param epubPath EPUB 文件路径
 * @param innerPath EPUB 内图片路径
 */
export function getEpubImageUrl(epubPath: string, innerPath: string): string {
    return `${PYTHON_API_BASE}/epub/image?path=${encodeURIComponent(epubPath)}&inner_path=${encodeURIComponent(innerPath)}`;
}

/**
 * 通用 API 调用封装
 * @param endpoint API 端点（不含基础 URL）
 * @param options fetch 选项
 */
export async function apiCall<T>(
    endpoint: string,
    options?: RequestInit
): Promise<T> {
    const url = `${PYTHON_API_BASE}${endpoint}`;
    
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });
    
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`API error ${response.status}: ${text}`);
    }
    
    // 检查是否有内容
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
        return response.json();
    }
    
    // 非 JSON 响应
    return response.text() as unknown as T;
}

/**
 * GET 请求封装
 */
export async function apiGet<T>(endpoint: string, params?: Record<string, string | number | boolean>): Promise<T> {
    let url = endpoint;
    if (params) {
        const searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                searchParams.append(key, String(value));
            }
        }
        const queryString = searchParams.toString();
        if (queryString) {
            url += (url.includes('?') ? '&' : '?') + queryString;
        }
    }
    return apiCall<T>(url, { method: 'GET' });
}

/**
 * POST 请求封装
 */
export async function apiPost<T>(endpoint: string, body?: unknown): Promise<T> {
    return apiCall<T>(endpoint, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
    });
}

/**
 * DELETE 请求封装
 */
export async function apiDelete<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    let url = endpoint;
    if (params) {
        const searchParams = new URLSearchParams(params);
        url += '?' + searchParams.toString();
    }
    return apiCall<T>(url, { method: 'DELETE' });
}

// ===== 目录 API =====

export interface FileEntry {
    name: string;
    path: string;
    size: number;
    modified: number;
    created?: number;
    is_dir: boolean;
    is_image: boolean;
    is_archive: boolean;
    is_video: boolean;
    is_epub?: boolean;
}

export interface DirectorySnapshot {
    items: FileEntry[];
    mtime?: number;
    cached: boolean;
}

/**
 * 列出目录内容
 */
export async function listDirectory(
    path: string,
    filterSupported: boolean = true
): Promise<FileEntry[]> {
    return apiGet<FileEntry[]>('/directory/list', {
        path,
        filter_supported: filterSupported,
    });
}

/**
 * 加载目录快照
 */
export async function loadDirectorySnapshot(
    path: string,
    useCache: boolean = true
): Promise<DirectorySnapshot> {
    return apiGet<DirectorySnapshot>('/directory/snapshot', {
        path,
        use_cache: useCache,
    });
}

/**
 * 获取目录中的图片
 */
export async function getImagesInDirectory(
    path: string,
    recursive: boolean = false
): Promise<string[]> {
    return apiGet<string[]>('/directory/images', { path, recursive });
}

// ===== 压缩包 API =====

export interface ArchiveEntry {
    name: string;
    path: string;
    size: number;
    is_dir: boolean;
    is_image: boolean;
    entry_index: number;
    modified?: number;
}

/**
 * 列出压缩包内容
 */
export async function listArchive(path: string): Promise<ArchiveEntry[]> {
    return apiGet<ArchiveEntry[]>('/archive/list', { path });
}

// ===== 缩略图 API =====

/**
 * 批量预加载缩略图
 */
export async function batchPreloadThumbnails(
    paths: string[],
    maxSize: number = 256
): Promise<Record<string, boolean>> {
    return apiPost<Record<string, boolean>>('/thumbnail/batch', {
        paths,
        max_size: maxSize,
    });
}

/**
 * 获取缩略图缓存统计
 */
export async function getThumbnailStats(): Promise<Record<string, { count: number; size: number }>> {
    return apiGet('/thumbnail/stats');
}

// ===== 书籍 API =====

export interface BookInfo {
    path: string;
    name: string;
    book_type: string;
    pages: PageInfo[];
    current_page: number;
    total_pages: number;
}

export interface PageInfo {
    path: string;
    name: string;
    index: number;
    width?: number;
    height?: number;
}

/**
 * 打开书籍
 */
export async function openBook(path: string): Promise<BookInfo> {
    return apiPost<BookInfo>(`/book/open?path=${encodeURIComponent(path)}`);
}

/**
 * 关闭书籍
 */
export async function closeBook(): Promise<void> {
    await apiPost('/book/close');
}

/**
 * 获取当前书籍
 */
export async function getCurrentBook(): Promise<BookInfo | null> {
    return apiGet<BookInfo | null>('/book/current');
}

/**
 * 导航到指定页
 */
export async function navigateToPage(pageIndex: number): Promise<number> {
    return apiPost<number>('/book/navigate', { page_index: pageIndex });
}

// ===== 元数据 API =====

export interface ImageMetadata {
    path: string;
    inner_path?: string;
    name: string;
    size?: number;
    created_at?: string;
    modified_at?: string;
    width?: number;
    height?: number;
    format?: string;
    color_depth?: string;
}

/**
 * 获取图像元数据
 */
export async function getImageMetadata(
    path: string,
    innerPath?: string
): Promise<ImageMetadata> {
    const params: Record<string, string> = { path };
    if (innerPath) {
        params.inner_path = innerPath;
    }
    return apiGet<ImageMetadata>('/metadata/image', params);
}

// ===== 文件操作 API =====

/**
 * 检查路径是否存在
 */
export async function pathExists(path: string): Promise<boolean> {
    return apiGet<boolean>('/file/exists', { path });
}

/**
 * 获取图片尺寸
 */
export async function getImageDimensions(path: string): Promise<{ width: number; height: number }> {
    return apiGet('/dimensions', { path });
}

// ===== 健康检查 =====

/**
 * 检查 Python 后端是否可用
 */
export async function checkHealth(): Promise<boolean> {
    try {
        const response = await fetch(`${PYTHON_API_BASE.replace('/v1', '')}/health`);
        if (response.ok) {
            const data = await response.json();
            return data.status === 'ok';
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * 等待 Python 后端启动
 * @param maxWaitMs 最大等待时间（毫秒）
 * @param intervalMs 检查间隔（毫秒）
 */
export async function waitForBackend(
    maxWaitMs: number = 30000,
    intervalMs: number = 500
): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
        if (await checkHealth()) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    return false;
}

// ===== WebSocket 流式 API =====

export interface StreamBatch {
    items: FileEntry[];
    batch_index: number;
}

export interface StreamProgress {
    loaded: number;
    estimated_total?: number;
    elapsed_ms: number;
}

export interface StreamComplete {
    total_items: number;
    skipped_items: number;
    elapsed_ms: number;
    from_cache: boolean;
}

export type StreamMessage = 
    | { type: 'batch'; data: StreamBatch }
    | { type: 'progress'; data: StreamProgress }
    | { type: 'complete'; data: StreamComplete };

/**
 * 创建目录流式加载 WebSocket 连接
 */
export function createDirectoryStream(
    path: string,
    batchSize: number = 15,
    onMessage: (msg: StreamMessage) => void,
    onError?: (error: Event) => void,
    onClose?: () => void
): WebSocket {
    const wsBase = getWsBaseUrl();
    const url = `${wsBase}/stream/directory?path=${encodeURIComponent(path)}&batch_size=${batchSize}`;
    
    const ws = new WebSocket(url);
    
    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data) as StreamMessage;
            onMessage(msg);
        } catch (e) {
            console.error('Failed to parse stream message:', e);
        }
    };
    
    ws.onerror = (event) => {
        onError?.(event);
    };
    
    ws.onclose = () => {
        onClose?.();
    };
    
    return ws;
}

/**
 * 创建搜索流式 WebSocket 连接
 */
export function createSearchStream(
    path: string,
    query: string,
    batchSize: number = 15,
    onMessage: (msg: StreamMessage) => void,
    onError?: (error: Event) => void,
    onClose?: () => void
): WebSocket {
    const wsBase = getWsBaseUrl();
    const url = `${wsBase}/stream/search?path=${encodeURIComponent(path)}&query=${encodeURIComponent(query)}&batch_size=${batchSize}`;
    
    const ws = new WebSocket(url);
    
    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data) as StreamMessage;
            onMessage(msg);
        } catch (e) {
            console.error('Failed to parse stream message:', e);
        }
    };
    
    ws.onerror = (event) => {
        onError?.(event);
    };
    
    ws.onclose = () => {
        onClose?.();
    };
    
    return ws;
}
