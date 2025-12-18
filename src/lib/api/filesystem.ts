/**
 * 文件系统 API
 * 全面使用 Python HTTP API，不再依赖 Tauri IPC
 */

import type { FsItem } from '$lib/types';
import { createImageTraceId, logImageTrace } from '$lib/utils/imageTrace';
import { isPathExcluded } from '$lib/stores/excludedPaths.svelte';

import { PYTHON_API_BASE, getWsBaseUrl } from './config';

export interface DirectorySnapshot {
  items: FsItem[];
  mtime?: number;
  cached: boolean;
}

// ===== HTTP API 辅助函数 =====

async function apiGet<T>(endpoint: string, params?: Record<string, string | number | boolean>): Promise<T> {
  let url = `${PYTHON_API_BASE}${endpoint}`;
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
  
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }
  return response.json();
}

async function apiPost<T>(endpoint: string, body?: unknown): Promise<T> {
  const response = await fetch(`${PYTHON_API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }
  
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return response.json();
  }
  return null as T;
}

async function apiDelete<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  let url = `${PYTHON_API_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += '?' + searchParams.toString();
  }
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }
  
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return response.json();
  }
  return null as T;
}

// ===== 目录浏览 API =====

/**
 * 打开文件夹选择对话框
 * 注意：Web 模式下使用 HTML5 File API
 */
export async function selectFolder(): Promise<string | null> {
  // Web 模式：使用 HTML5 目录选择
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.onchange = () => {
      const files = input.files;
      if (files && files.length > 0) {
        // 获取第一个文件的路径（去掉文件名部分）
        const path = files[0].webkitRelativePath.split('/')[0];
        resolve(path);
      } else {
        resolve(null);
      }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * 浏览目录内容
 */
export async function browseDirectory(path: string): Promise<FsItem[]> {
  const snapshot = await loadDirectorySnapshot(path);
  return snapshot.items;
}

/**
 * 加载目录快照
 */
export async function loadDirectorySnapshot(path: string): Promise<DirectorySnapshot> {
  try {
    const snapshot = await apiGet<DirectorySnapshot>('/directory/snapshot', { path });
    
    if (!snapshot || !snapshot.items) {
      console.warn('[loadDirectorySnapshot] 收到无效响应，返回空快照:', snapshot);
      return { items: [], cached: false };
    }
    
    // 过滤排除路径
    snapshot.items = snapshot.items.filter(item => !isPathExcluded(item.path));
    return snapshot;
  } catch (error) {
    console.error('[loadDirectorySnapshot] 加载失败:', error);
    return { items: [], cached: false };
  }
}

/**
 * 批量并发加载多个目录快照
 */
export interface BatchDirectorySnapshotResult {
  path: string;
  snapshot: DirectorySnapshot | null;
  error: string | null;
}

export async function batchLoadDirectorySnapshots(
  paths: string[]
): Promise<BatchDirectorySnapshotResult[]> {
  if (paths.length === 0) return [];
  
  if (paths.length === 1) {
    try {
      const snapshot = await loadDirectorySnapshot(paths[0]);
      return [{ path: paths[0], snapshot, error: null }];
    } catch (e) {
      return [{ path: paths[0], snapshot: null, error: String(e) }];
    }
  }
  
  try {
    const results = await apiPost<BatchDirectorySnapshotResult[]>('/directory/batch-snapshot', { paths });
    // 过滤排除路径
    for (const result of results) {
      if (result.snapshot) {
        result.snapshot.items = result.snapshot.items.filter(item => !isPathExcluded(item.path));
      }
    }
    return results;
  } catch {
    // 回退到串行加载
    const results: BatchDirectorySnapshotResult[] = [];
    for (const path of paths) {
      try {
        const snapshot = await loadDirectorySnapshot(path);
        results.push({ path, snapshot, error: null });
      } catch (e) {
        results.push({ path, snapshot: null, error: String(e) });
      }
    }
    return results;
  }
}

/**
 * 子文件夹项（轻量级，专用于 FolderTree）
 */
export interface SubfolderItem {
  path: string;
  name: string;
  hasChildren: boolean;
}

/**
 * 快速列出目录下的子文件夹
 */
export async function listSubfolders(path: string): Promise<SubfolderItem[]> {
  try {
    const items = await apiGet<SubfolderItem[]>('/directory/subfolders', { path });
    
    if (!items || !Array.isArray(items)) {
      console.warn('[listSubfolders] 收到无效响应，返回空数组:', items);
      return [];
    }
    
    return items.filter(item => !isPathExcluded(item.path));
  } catch (error) {
    console.error('[listSubfolders] 加载失败:', error);
    return [];
  }
}

/**
 * 获取文件元数据
 */
export async function getFileMetadata(path: string): Promise<FsItem> {
  return await apiGet<FsItem>('/file/info', { path });
}

/**
 * 获取目录中的所有图片
 */
export async function getImagesInDirectory(
  path: string,
  recursive: boolean = false
): Promise<string[]> {
  return await apiGet<string[]>('/directory/images', { path, recursive });
}

/**
 * 创建目录
 */
export async function createDirectory(path: string): Promise<void> {
  await apiPost('/file/mkdir', { path });
}

/**
 * 删除文件或目录
 */
export async function deletePath(path: string): Promise<void> {
  await apiDelete('/file', { path });
}

/**
 * 重命名文件或目录
 */
export async function renamePath(from: string, to: string): Promise<void> {
  await apiPost('/file/rename', { from_path: from, to_path: to });
}

/**
 * 移动到回收站
 */
export async function moveToTrash(path: string): Promise<void> {
  await apiPost('/file/trash', { path });
}

/**
 * 异步移动到回收站（兼容旧接口）
 */
export async function moveToTrashAsync(path: string): Promise<void> {
  await moveToTrash(path);
}

/**
 * 检查路径是否存在
 */
export async function pathExists(path: string): Promise<boolean> {
  return await apiGet<boolean>('/file/exists', { path });
}

/**
 * 读取目录（旧 API，兼容用）
 */
export async function readDirectory(path: string, excludedPaths?: string[]): Promise<FsItem[]> {
  const items = await apiGet<FsItem[]>('/directory/list', { path });
  if (excludedPaths && excludedPaths.length > 0) {
    return items.filter(item => !excludedPaths.includes(item.path));
  }
  return items;
}

// ===== 回收站撤回删除 API =====

export interface TrashItem {
  name: string;
  originalPath: string;
  deletedAt: number;
  isDir: boolean;
}

export async function getLastDeletedItem(): Promise<TrashItem | null> {
  // Python 后端暂不支持此功能
  console.warn('[getLastDeletedItem] Python 后端暂不支持此功能');
  return null;
}

export async function undoLastDelete(): Promise<string | null> {
  console.warn('[undoLastDelete] Python 后端暂不支持此功能');
  return null;
}

export async function restoreFromTrash(originalPath: string): Promise<void> {
  console.warn('[restoreFromTrash] Python 后端暂不支持此功能', originalPath);
}

// ===== 压缩包相关 API =====

/**
 * 列出压缩包内容
 */
export async function listArchiveContents(archivePath: string): Promise<FsItem[]> {
  return await apiGet<FsItem[]>('/archive/list', { path: archivePath });
}

/**
 * 从压缩包加载图片
 */
export interface LoadImageFromArchiveOptions {
  traceId?: string;
  pageIndex?: number;
}

/**
 * 根据文件扩展名获取 MIME type
 */
function getMimeTypeFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'avif': 'image/avif',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',
    'tiff': 'image/tiff',
    'tif': 'image/tiff',
    'svg': 'image/svg+xml',
    'jxl': 'image/png',
  };
  return mimeTypes[ext] || 'image/jpeg';
}

/**
 * 通用图片加载
 */
export async function loadImage(
  path: string,
  options: LoadImageFromArchiveOptions = {}
): Promise<ArrayBuffer> {
  const traceId = options.traceId ?? createImageTraceId('http', options.pageIndex);
  logImageTrace(traceId, 'loading image via HTTP API', { path, pageIndex: options.pageIndex });
  
  const url = `${PYTHON_API_BASE}/file?path=${encodeURIComponent(path)}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Image loading failed: ${response.status}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  logImageTrace(traceId, 'image fetched', { bytes: arrayBuffer.byteLength });
  
  return arrayBuffer;
}

/**
 * 加载压缩包图片为 Object URL
 */
export async function loadImageFromArchive(
  archivePath: string,
  filePath: string,
  options: LoadImageFromArchiveOptions = {}
): Promise<string> {
  const { blob } = await loadImageFromArchiveAsBlob(archivePath, filePath, options);
  return URL.createObjectURL(blob);
}

/**
 * 加载压缩包图片为 Blob
 */
export async function loadImageFromArchiveAsBlob(
  archivePath: string,
  filePath: string,
  options: LoadImageFromArchiveOptions = {}
): Promise<{ blob: Blob; traceId: string }> {
  const traceId = options.traceId ?? createImageTraceId('archive', options.pageIndex);
  
  logImageTrace(traceId, 'loading archive image via HTTP API', {
    archivePath,
    innerPath: filePath,
    pageIndex: options.pageIndex
  });
  
  const url = `${PYTHON_API_BASE}/archive/extract?archive_path=${encodeURIComponent(archivePath)}&inner_path=${encodeURIComponent(filePath)}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Archive extraction failed: ${response.status}`);
  }
  
  const blob = await response.blob();
  logImageTrace(traceId, 'blob fetched', { size: blob.size });
  
  // 如果 blob 没有正确的 MIME type，重新创建
  if (blob.type === '' || blob.type === 'application/octet-stream') {
    const mimeType = getMimeTypeFromPath(filePath);
    const arrayBuffer = await blob.arrayBuffer();
    return { blob: new Blob([arrayBuffer], { type: mimeType }), traceId };
  }
  
  return { blob, traceId };
}

// 压缩包文件列表缓存
const archiveListCache = new Map<string, { list: string[]; timestamp: number }>();
const ARCHIVE_LIST_CACHE_TTL = 5 * 60 * 1000;

/**
 * 获取压缩包中的所有图片（带缓存）
 */
export async function getImagesFromArchive(archivePath: string): Promise<string[]> {
  const cached = archiveListCache.get(archivePath);
  if (cached && Date.now() - cached.timestamp < ARCHIVE_LIST_CACHE_TTL) {
    return cached.list;
  }
  
  const entries = await listArchiveContents(archivePath);
  const list = entries.filter(e => e.isImage).map(e => e.path);
  
  archiveListCache.set(archivePath, { list, timestamp: Date.now() });
  return list;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function preheatArchiveList(_archivePath: string): void {
  // 功能已禁用
}

export function clearArchiveListCache(): void {
  archiveListCache.clear();
}

export interface PreloadResult {
  total: number;
  success: number;
  failed: number;
  totalBytes: number;
  errors: string[] | null;
}

export async function preloadArchivePages(
  archivePath: string,
  pagePaths: string[]
): Promise<PreloadResult> {
  // Python 后端暂不支持预加载，返回模拟结果
  console.log(`⚡ 预加载请求: ${pagePaths.length} 页 from ${archivePath}`);
  return {
    total: pagePaths.length,
    success: pagePaths.length,
    failed: 0,
    totalBytes: 0,
    errors: null
  };
}

export async function isSupportedArchive(path: string): Promise<boolean> {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return ['zip', 'rar', '7z', 'cbz', 'cbr', 'cb7'].includes(ext);
}

// ===== 文件操作 API =====

export async function copyPath(from: string, to: string): Promise<void> {
  await apiPost('/file/copy', { from_path: from, to_path: to });
}

export async function movePath(from: string, to: string): Promise<void> {
  await apiPost('/file/move', { from_path: from, to_path: to });
}

export async function openWithSystem(path: string): Promise<void> {
  await apiPost('/system/open', { path });
}

export async function showInFileManager(path: string): Promise<void> {
  await apiPost('/system/show-in-explorer', { path });
}

export async function searchFiles(
  path: string,
  query: string,
  options: {
    includeSubfolders?: boolean;
    maxResults?: number;
  } = {}
): Promise<FsItem[]> {
  return await apiGet<FsItem[]>('/directory/search', {
    path,
    query,
    recursive: options.includeSubfolders ?? false,
    max_results: options.maxResults ?? 100
  });
}

// ===== 视频相关 API =====

export async function generateVideoThumbnail(videoPath: string, timeSeconds?: number): Promise<string> {
  return await apiGet<string>('/video/thumbnail', {
    path: videoPath,
    time_seconds: timeSeconds ?? 10
  });
}

export async function getVideoDuration(videoPath: string): Promise<number> {
  return await apiGet<number>('/video/duration', { path: videoPath });
}

export async function isVideoFile(filePath: string): Promise<boolean> {
  return await apiGet<boolean>('/video/check', { path: filePath });
}

export async function checkFFmpegAvailable(): Promise<boolean> {
  return await apiGet<boolean>('/system/ffmpeg');
}

// ===== 资源管理器右键菜单 API（Web 模式不支持）=====

export async function getExplorerContextMenuEnabled(): Promise<boolean> {
  console.warn('[getExplorerContextMenuEnabled] Web 模式不支持此功能');
  return false;
}

export async function setExplorerContextMenuEnabled(enabled: boolean): Promise<boolean> {
  console.warn('[setExplorerContextMenuEnabled] Web 模式不支持此功能', enabled);
  return false;
}

export async function generateExplorerContextMenuReg(): Promise<string> {
  console.warn('[generateExplorerContextMenuReg] Web 模式不支持此功能');
  return '';
}

// ===== 压缩包首图 API =====

export async function getArchiveFirstImageQuick(archivePath: string): Promise<string> {
  const entries = await listArchiveContents(archivePath);
  const firstImage = entries.find(e => e.isImage);
  if (!firstImage) {
    throw new Error('No image found in archive');
  }
  return loadImageFromArchive(archivePath, firstImage.path);
}

export async function getArchiveFirstImageBlob(archivePath: string): Promise<string> {
  return getArchiveFirstImageQuick(archivePath);
}

// ===== 流式目录加载 API =====

export interface DirectoryBatch {
  items: FsItem[];
  batchIndex: number;
}

export interface StreamProgress {
  loaded: number;
  estimatedTotal?: number;
  elapsedMs: number;
}

export interface StreamError {
  message: string;
  path?: string;
  skippedCount: number;
}

export interface StreamComplete {
  totalItems: number;
  skippedItems: number;
  elapsedMs: number;
  fromCache: boolean;
}

export type DirectoryStreamOutput =
  | { type: 'Batch'; data: DirectoryBatch }
  | { type: 'Progress'; data: StreamProgress }
  | { type: 'Error'; data: StreamError }
  | { type: 'Complete'; data: StreamComplete };

export interface StreamOptions {
  batchSize?: number;
  skipHidden?: boolean;
  sortBy?: string;
  sortOrder?: string;
}

export interface StreamHandle {
  streamId: string;
  cancel: () => Promise<void>;
}

export interface StreamCallbacks {
  onBatch?: (batch: DirectoryBatch) => void;
  onProgress?: (progress: StreamProgress) => void;
  onError?: (error: StreamError) => void;
  onComplete?: (complete: StreamComplete) => void;
}

/**
 * 流式浏览目录（使用 WebSocket）
 */
export async function streamDirectory(
  path: string,
  callbacks: StreamCallbacks,
  options?: StreamOptions
): Promise<StreamHandle> {
  const wsBase = getWsBaseUrl();
  const batchSize = options?.batchSize ?? 15;
  const url = `${wsBase}/stream/directory?path=${encodeURIComponent(path)}&batch_size=${batchSize}`;
  
  const ws = new WebSocket(url);
  const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  ws.onmessage = (event) => {
    try {
      const output = JSON.parse(event.data) as DirectoryStreamOutput;
      switch (output.type) {
        case 'Batch':
          output.data.items = output.data.items.filter(item => !isPathExcluded(item.path));
          callbacks.onBatch?.(output.data);
          break;
        case 'Progress':
          callbacks.onProgress?.(output.data);
          break;
        case 'Error':
          callbacks.onError?.(output.data);
          break;
        case 'Complete':
          callbacks.onComplete?.(output.data);
          break;
      }
    } catch (e) {
      console.error('Failed to parse stream message:', e);
    }
  };
  
  ws.onerror = (event) => {
    callbacks.onError?.({ message: 'WebSocket error', skippedCount: 0 });
    console.error('Stream WebSocket error:', event);
  };
  
  return {
    streamId,
    cancel: async () => {
      ws.close();
    }
  };
}

export async function cancelStreamsForPath(path: string): Promise<number> {
  console.log('[cancelStreamsForPath]', path);
  return 0;
}

export async function getActiveStreamCount(): Promise<number> {
  return 0;
}

export function streamDirectoryAsync(
  path: string,
  onBatch: (items: FsItem[], batchIndex: number) => void,
  options?: StreamOptions
): Promise<StreamComplete> {
  return new Promise((resolve, reject) => {
    streamDirectory(
      path,
      {
        onBatch: (batch) => {
          onBatch(batch.items, batch.batchIndex);
        },
        onComplete: (complete) => {
          resolve(complete);
        },
        onError: (error) => {
          console.warn('Stream error:', error.message);
        }
      },
      options
    ).catch(reject);
  });
}

// ===== 流式搜索 API =====

export type SearchStreamOutput = DirectoryStreamOutput;

export async function streamSearch(
  path: string,
  query: string,
  callbacks: StreamCallbacks,
  options?: StreamOptions
): Promise<StreamHandle> {
  const wsBase = getWsBaseUrl();
  const batchSize = options?.batchSize ?? 15;
  const url = `${wsBase}/stream/search?path=${encodeURIComponent(path)}&query=${encodeURIComponent(query)}&batch_size=${batchSize}`;
  
  const ws = new WebSocket(url);
  const streamId = `search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  ws.onmessage = (event) => {
    try {
      const output = JSON.parse(event.data) as SearchStreamOutput;
      switch (output.type) {
        case 'Batch':
          output.data.items = output.data.items.filter(item => !isPathExcluded(item.path));
          callbacks.onBatch?.(output.data);
          break;
        case 'Progress':
          callbacks.onProgress?.(output.data);
          break;
        case 'Error':
          callbacks.onError?.(output.data);
          break;
        case 'Complete':
          callbacks.onComplete?.(output.data);
          break;
      }
    } catch (e) {
      console.error('Failed to parse search message:', e);
    }
  };
  
  ws.onerror = (event) => {
    callbacks.onError?.({ message: 'WebSocket error', skippedCount: 0 });
    console.error('Search WebSocket error:', event);
  };
  
  return {
    streamId,
    cancel: async () => {
      ws.close();
    }
  };
}

export function streamSearchAsync(
  path: string,
  query: string,
  onResult: (items: FsItem[], batchIndex: number) => void,
  options?: StreamOptions
): Promise<StreamComplete> {
  return new Promise((resolve, reject) => {
    streamSearch(
      path,
      query,
      {
        onBatch: (batch) => {
          onResult(batch.items, batch.batchIndex);
        },
        onComplete: (complete) => {
          resolve(complete);
        },
        onError: (error) => {
          console.warn('Search error:', error.message);
        }
      },
      options
    ).catch(reject);
  });
}

// ===== 分页浏览 API（兼容旧接口）=====

export async function browseDirectoryPage(
  path: string,
  options: {
    offset?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{
  items: FsItem[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
}> {
  const items = await browseDirectory(path);
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 100;
  const sliced = items.slice(offset, offset + limit);
  
  return {
    items: sliced,
    total: items.length,
    hasMore: offset + limit < items.length,
    nextOffset: offset + limit < items.length ? offset + limit : undefined
  };
}

export async function startDirectoryStream(
  path: string,
  options: {
    batchSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{
  streamId: string;
  initialBatch: FsItem[];
  total: number;
  hasMore: boolean;
}> {
  const items = await browseDirectory(path);
  const batchSize = options.batchSize ?? 50;
  
  return {
    streamId: `legacy-${Date.now()}`,
    initialBatch: items.slice(0, batchSize),
    total: items.length,
    hasMore: items.length > batchSize
  };
}

export async function getNextStreamBatch(
  streamId: string
): Promise<{
  items: FsItem[];
  hasMore: boolean;
}> {
  console.warn('[getNextStreamBatch] Legacy API, returning empty', streamId);
  return { items: [], hasMore: false };
}

export async function cancelDirectoryStream(streamId: string): Promise<void> {
  console.log('[cancelDirectoryStream]', streamId);
}
