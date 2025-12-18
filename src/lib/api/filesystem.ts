/**
 * 文件系统 API
 * 提供文件浏览、操作等功能
 */

import { invoke } from '$lib/api/adapter';
import { open } from '@tauri-apps/plugin-dialog';
import type { FsItem } from '$lib/types';
import { createImageTraceId, logImageTrace } from '$lib/utils/imageTrace';
import { isPathExcluded } from '$lib/stores/excludedPaths.svelte';

export interface DirectorySnapshot {
  items: FsItem[];
  mtime?: number;
  cached: boolean;
}

/**
 * 打开文件夹选择对话框
 */
export async function selectFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
  });
  
  return selected as string | null;
}

/**
 * 浏览目录内容
 */
export async function browseDirectory(path: string): Promise<FsItem[]> {
  const snapshot = await loadDirectorySnapshot(path);
  return snapshot.items;
}

export async function loadDirectorySnapshot(path: string): Promise<DirectorySnapshot> {
  const snapshot = await invoke<DirectorySnapshot>('load_directory_snapshot', { path });
  // 过滤排除路径
  snapshot.items = snapshot.items.filter(item => !isPathExcluded(item.path));
  return snapshot;
}

/**
 * 批量并发加载多个目录快照
 * 使用 Rust 端并发执行，避免串行阻塞
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
    // 单个路径直接用单个命令
    try {
      const snapshot = await loadDirectorySnapshot(paths[0]);
      return [{ path: paths[0], snapshot, error: null }];
    } catch (e) {
      return [{ path: paths[0], snapshot: null, error: String(e) }];
    }
  }
  const results = await invoke<BatchDirectorySnapshotResult[]>('batch_load_directory_snapshots', { paths });
  // 过滤排除路径
  for (const result of results) {
    if (result.snapshot) {
      result.snapshot.items = result.snapshot.items.filter(item => !isPathExcluded(item.path));
    }
  }
  return results;
}

/**
 * 子文件夹项（轻量级，专用于 FolderTree）
 */
export interface SubfolderItem {
  path: string;
  name: string;
  /** 是否有子目录（用于显示展开箭头） */
  hasChildren: boolean;
}

/**
 * 快速列出目录下的子文件夹（专用于 FolderTree）
 * 使用 jwalk 并行遍历，比标准 API 快 5-10 倍
 * 不返回文件，只返回目录，且包含 hasChildren 信息
 */
export async function listSubfolders(path: string): Promise<SubfolderItem[]> {
  const items = await invoke<SubfolderItem[]>('list_subfolders', { path });
  // 过滤排除路径
  return items.filter(item => !isPathExcluded(item.path));
}

/**
 * 分页浏览目录内容
 */
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
  return await invoke<{
    items: FsItem[];
    total: number;
    hasMore: boolean;
    nextOffset?: number;
  }>('browse_directory_page', { path, options });
}

/**
 * 流式浏览目录内容（返回游标）
 */
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
  return await invoke<{
    streamId: string;
    initialBatch: FsItem[];
    total: number;
    hasMore: boolean;
  }>('start_directory_stream', { path, options });
}

/**
 * 获取流的下一批数据
 */
export async function getNextStreamBatch(
  streamId: string
): Promise<{
  items: FsItem[];
  hasMore: boolean;
}> {
  return await invoke<{
    items: FsItem[];
    hasMore: boolean;
  }>('get_next_stream_batch', { streamId });
}

/**
 * 取消目录流
 */
export async function cancelDirectoryStream(streamId: string): Promise<void> {
  return await invoke<void>('cancel_directory_stream', { streamId });
}

/**
 * 获取文件元数据
 * 注意：使用 get_file_metadata 命令，返回完整的 FsItem 类型（包含 isDir 字段）
 * 而不是 get_file_info 命令（返回 FileInfo 类型，使用 isDirectory 字段）
 */
export async function getFileMetadata(path: string): Promise<FsItem> {
  return await invoke<FsItem>('get_file_metadata', { path });
}

/**
 * 获取目录中的所有图片
 */
export async function getImagesInDirectory(
  path: string,
  recursive: boolean = false
): Promise<string[]> {
  return await invoke<string[]>('get_images_in_directory', { path, recursive });
}


/**
 * 创建目录
 */
export async function createDirectory(path: string): Promise<void> {
  await invoke('create_directory', { path });
}

/**
 * 带重试的 invoke 包装（解决 IPC 协议偶发失败问题）
 */
async function invokeWithRetry<T>(
  cmd: string,
  args: Record<string, unknown>,
  maxRetries = 2
): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await invoke<T>(cmd, args);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      // 如果是 IPC 连接错误，等待后重试
      if (i < maxRetries && lastError.message.includes('Failed to fetch')) {
        await new Promise(r => setTimeout(r, 50 * (i + 1)));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError;
}

/**
 * 删除文件或目录
 */
export async function deletePath(path: string): Promise<void> {
  await invokeWithRetry('delete_path', { path });
}

/**
 * 重命名文件或目录
 */
export async function renamePath(from: string, to: string): Promise<void> {
  await invokeWithRetry('rename_path', { from, to });
}

/**
 * 移动到回收站
 */
export async function moveToTrash(path: string): Promise<void> {
  await invokeWithRetry('move_to_trash', { path });
}

// 异步删除的回调映射
const trashCallbacks = new Map<string, { resolve: () => void; reject: (err: Error) => void }>();
let trashListenerSetup = false;

/**
 * 设置异步删除的事件监听器
 */
async function setupTrashListener(): Promise<void> {
  if (trashListenerSetup) return;
  trashListenerSetup = true;
  
  const { listen } = await import('@tauri-apps/api/event');
  listen<{ requestId: string; path: string; success: boolean; error?: string }>('trash-result', (event) => {
    const { requestId, success, error } = event.payload;
    const callback = trashCallbacks.get(requestId);
    if (callback) {
      trashCallbacks.delete(requestId);
      if (success) {
        callback.resolve();
      } else {
        callback.reject(new Error(error || '删除失败'));
      }
    }
  });
}

/**
 * 异步移动到回收站（绕开 IPC 协议问题）
 * 使用事件机制接收结果，避免 IPC 返回值问题
 */
export async function moveToTrashAsync(path: string): Promise<void> {
  await setupTrashListener();
  
  const requestId = `trash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  return new Promise((resolve, reject) => {
    // 设置超时
    const timeout = setTimeout(() => {
      trashCallbacks.delete(requestId);
      reject(new Error('删除操作超时'));
    }, 30000);
    
    trashCallbacks.set(requestId, {
      resolve: () => {
        clearTimeout(timeout);
        resolve();
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    });
    
    // 发送异步删除请求
    invoke('move_to_trash_async', { path, requestId }).catch(err => {
      clearTimeout(timeout);
      trashCallbacks.delete(requestId);
      reject(err);
    });
  });
}

// ===== 回收站撤回删除 API =====

/**
 * 回收站项目信息
 */
export interface TrashItem {
  /** 原始文件名 */
  name: string;
  /** 原始路径 */
  originalPath: string;
  /** 删除时间（Unix 时间戳，秒） */
  deletedAt: number;
  /** 是否为目录 */
  isDir: boolean;
}

/**
 * 获取最近删除的项目（用于撤回功能）
 * 返回最近删除的一个项目，如果回收站为空则返回 null
 */
export async function getLastDeletedItem(): Promise<TrashItem | null> {
  return await invoke<TrashItem | null>('get_last_deleted_item');
}

/**
 * 撤回上一次删除（恢复最近删除的项目）
 * 返回恢复的文件原始路径，如果回收站为空则返回 null
 */
export async function undoLastDelete(): Promise<string | null> {
  return await invoke<string | null>('undo_last_delete');
}

/**
 * 恢复指定路径的已删除项目
 */
export async function restoreFromTrash(originalPath: string): Promise<void> {
  await invoke('restore_from_trash', { originalPath });
}


/**
 * 检查路径是否存在
 */
export async function pathExists(path: string): Promise<boolean> {
  return await invoke<boolean>('path_exists', { path });
}

/**
 * 读取目录（旧 API）
 * @param path 目录路径
 * @param excludedPaths 排除的路径列表（可选）
 */
export async function readDirectory(path: string, excludedPaths?: string[]): Promise<FsItem[]> {
  return await invoke<FsItem[]>('read_directory', { path, excludedPaths });
}

// ===== 压缩包相关 API =====

/**
 * 列出压缩包内容
 */
export async function listArchiveContents(archivePath: string): Promise<FsItem[]> {
  return await invoke<FsItem[]>('list_archive_contents', { archivePath });
}

/**
 * 从压缩包加载图片
 */
export interface LoadImageFromArchiveOptions {
  traceId?: string;
  pageIndex?: number;
}

/**
 * 通用图片加载（支持 EPUB 等特殊类型，使用 Base64 传输）
 */
export async function loadImage(
  path: string,
  options: LoadImageFromArchiveOptions = {}
): Promise<ArrayBuffer> {
  const traceId = options.traceId ?? createImageTraceId('ipc', options.pageIndex);
  logImageTrace(traceId, 'invoke load_image_base64', { path, pageIndex: options.pageIndex });

  // 使用 Base64 传输，避免 IPC 协议问题
  const base64 = await invokeWithRetry<string>('load_image_base64', {
    path,
    traceId,
    pageIndex: options.pageIndex
  });

  return base64ToArrayBuffer(base64);
}

/**
 * 加载压缩包图片为 Object URL（旧接口，兼容用）
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
 * 加载压缩包图片为 Blob（推荐，避免重复转换）
 * 【优化】使用 Response 类型直接传输二进制数据，避免 JSON 序列化开销
 */
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
    'jxl': 'image/png', // JXL 在后端已转换为 PNG
  };
  return mimeTypes[ext] || 'image/jpeg'; // 默认 JPEG
}

/**
 * 将 base64 字符串解码为 ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function loadImageFromArchiveAsBlob(
  archivePath: string,
  filePath: string,
  options: LoadImageFromArchiveOptions = {}
): Promise<{ blob: Blob; traceId: string }> {
  const traceId = options.traceId ?? createImageTraceId('archive', options.pageIndex);
  logImageTrace(traceId, 'invoke load_image_from_archive_base64', {
    archivePath,
    innerPath: filePath,
    pageIndex: options.pageIndex
  });

  // 获取正确的 MIME type
  const mimeType = getMimeTypeFromPath(filePath);

  // 使用 Base64 传输，避免 IPC 协议问题
  const base64 = await invokeWithRetry<string>('load_image_from_archive_base64', {
    archivePath,
    filePath,
    traceId,
    pageIndex: options.pageIndex
  });

  const arrayBuffer = base64ToArrayBuffer(base64);
  logImageTrace(traceId, 'archive image base64 decoded', { bytes: arrayBuffer.byteLength });

  // 创建 Blob 时指定正确的 MIME type
  const blob = new Blob([arrayBuffer], { type: mimeType });
  logImageTrace(traceId, 'blob created', { size: blob.size, mimeType });

  return { blob, traceId };
}

/**
 * 压缩包文件列表缓存
 * 【优化】预热文件列表，加速切书
 */
const archiveListCache = new Map<string, { list: string[]; timestamp: number }>();
const ARCHIVE_LIST_CACHE_TTL = 5 * 60 * 1000; // 5分钟过期

/**
 * 获取压缩包中的所有图片（带缓存）
 */
export async function getImagesFromArchive(archivePath: string): Promise<string[]> {
  // 检查缓存
  const cached = archiveListCache.get(archivePath);
  if (cached && Date.now() - cached.timestamp < ARCHIVE_LIST_CACHE_TTL) {
    console.log(`📦 压缩包列表缓存命中: ${archivePath}`);
    return cached.list;
  }
  
  const list = await invoke<string[]>('get_images_from_archive', { archivePath });
  
  // 更新缓存
  archiveListCache.set(archivePath, { list, timestamp: Date.now() });
  
  return list;
}

/**
 * 预热压缩包文件列表（不等待结果）
 * 【已禁用】功能已注释掉
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function preheatArchiveList(_archivePath: string): void {
  // 功能已禁用
  return;
  
  // // 检查是否已缓存
  // const cached = archiveListCache.get(archivePath);
  // if (cached && Date.now() - cached.timestamp < ARCHIVE_LIST_CACHE_TTL) {
  //   return; // 已缓存，无需预热
  // }
  // 
  // // 异步预热
  // invoke<string[]>('get_images_from_archive', { archivePath })
  //   .then(list => {
  //     archiveListCache.set(archivePath, { list, timestamp: Date.now() });
  //     console.log(`📦 压缩包列表预热完成: ${archivePath} (${list.length} 项)`);
  //   })
  //   .catch(() => {}); // 忽略错误
}

/**
 * 清理压缩包列表缓存
 */
export function clearArchiveListCache(): void {
  archiveListCache.clear();
}

/**
 * 【优化】并行预加载压缩包页面到后端缓存
 * 使用 rayon 并行解压，加速首次翻页
 */
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
  console.log(`⚡ 并行预加载: ${pagePaths.length} 页 from ${archivePath}`);
  try {
    const result = await invoke<PreloadResult>('preload_archive_pages', {
      archivePath,
      pagePaths
    });
    console.log(`✅ 预加载完成: ${result.success}/${result.total}, ${(result.totalBytes / 1024).toFixed(0)}KB`);
    return result;
  } catch (error) {
    console.error('❌ 预加载失败:', error);
    throw error;
  }
}


/**
 * 检查是否为支持的压缩包
 */
export async function isSupportedArchive(path: string): Promise<boolean> {
  return await invoke<boolean>('is_supported_archive', { path });
}

// ===== 文件操作 API =====

/**
 * 复制文件或文件夹
 */
export async function copyPath(from: string, to: string): Promise<void> {
  await invoke('copy_path', { from, to });
}

/**
 * 移动文件或文件夹
 */
export async function movePath(from: string, to: string): Promise<void> {
  await invoke('move_path', { from, to });
}

/**
 * 在系统默认程序中打开文件
 */
export async function openWithSystem(path: string): Promise<void> {
  await invoke('open_with_system', { path });
}

/**
 * 在文件管理器中显示文件
 */
export async function showInFileManager(path: string): Promise<void> {
  await invoke('show_in_file_manager', { path });
}

/**
 * 搜索文件
 */
export async function searchFiles(
  path: string,
  query: string,
  options: {
    includeSubfolders?: boolean;
    maxResults?: number;
  } = {}
): Promise<FsItem[]> {
  return await invoke<FsItem[]>('search_files', { path, query, options });
}

// ===== 视频相关 API =====

/**
 * 生成视频缩略图
 */
export async function generateVideoThumbnail(videoPath: string, timeSeconds?: number): Promise<string> {
  return await invoke<string>('generate_video_thumbnail', { videoPath, timeSeconds });
}

/**
 * 获取视频时长
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  return await invoke<number>('get_video_duration', { videoPath });
}

/**
 * 检查是否为视频文件
 */
export async function isVideoFile(filePath: string): Promise<boolean> {
  return await invoke<boolean>('is_video_file', { filePath });
}

/**
 * 检查 FFmpeg 是否可用
 */
export async function checkFFmpegAvailable(): Promise<boolean> {
  return await invoke<boolean>('check_ffmpeg_available');
}

/**
 * 查询是否已在资源管理器右键菜单中注册 "Open in NeoView"
 */
export async function getExplorerContextMenuEnabled(): Promise<boolean> {
  return await invoke<boolean>('get_explorer_context_menu_enabled');
}

/**
 * 设置资源管理器右键菜单中的 "Open in NeoView" 开关
 * Windows 下通过写入 HKCU\Software\Classes，便携版也可使用
 */
export async function setExplorerContextMenuEnabled(enabled: boolean): Promise<boolean> {
  return await invoke<boolean>('set_explorer_context_menu_enabled', { enabled });
}

/**
 * 生成 Explorer 右键菜单注册表文件内容 (.reg)
 * 基于当前 exe 路径，返回完整文本，前端可触发下载
 */
export async function generateExplorerContextMenuReg(): Promise<string> {
  return await invoke<string>('generate_explorer_context_menu_reg');
}


/**
 * 快速获取压缩包内的第一张图片（旧版本，返回字节数组）
 * @deprecated 请使用 getArchiveFirstImageBlob
 */
export async function getArchiveFirstImageQuick(archivePath: string): Promise<string> {
  console.log('⚡ FileSystemAPI: 快速获取压缩包首张图片 (旧版):', archivePath);
  try {
    // 使用新的 blob API
    const { getArchiveFirstImageBlob: invokeArchiveFirstImageBlob } = await import('./archive');
    const blobUrl = await invokeArchiveFirstImageBlob(archivePath);
    console.log('✅ FileSystemAPI: 快速获取成功, blob URL:', blobUrl);
    return blobUrl;
  } catch (error) {
    console.error('❌ FileSystemAPI: 快速获取失败:', archivePath, error);
    throw error;
  }
}

/**
 * 快速获取压缩包内的第一张图片（使用 BlobRegistry）
 * 直接返回后端的 blob:{hash} URL
 */
export async function getArchiveFirstImageBlob(archivePath: string): Promise<string> {
  console.log('⚡ FileSystemAPI: 获取压缩包首图 blob:', archivePath);
  try {
    const { getArchiveFirstImageBlob: invokeArchiveFirstImageBlob } = await import('./archive');
    const blobUrl = await invokeArchiveFirstImageBlob(archivePath);
    console.log('✅ FileSystemAPI: 获取成功, blob URL:', blobUrl);
    return blobUrl;
  } catch (error) {
    console.error('❌ FileSystemAPI: 获取失败:', archivePath, error);
    throw error;
  }
}


// ============================================================================
// 流式目录加载 API（参考 Spacedrive 架构）
// ============================================================================

import { Channel } from '@tauri-apps/api/core';

/**
 * 目录批次数据
 */
export interface DirectoryBatch {
  items: FsItem[];
  batchIndex: number;
}

/**
 * 流进度信息
 */
export interface StreamProgress {
  loaded: number;
  estimatedTotal?: number;
  elapsedMs: number;
}

/**
 * 流错误信息（非致命）
 */
export interface StreamError {
  message: string;
  path?: string;
  skippedCount: number;
}

/**
 * 流完成信号
 */
export interface StreamComplete {
  totalItems: number;
  skippedItems: number;
  elapsedMs: number;
  fromCache: boolean;
}

/**
 * 流式输出类型
 */
export type DirectoryStreamOutput =
  | { type: 'Batch'; data: DirectoryBatch }
  | { type: 'Progress'; data: StreamProgress }
  | { type: 'Error'; data: StreamError }
  | { type: 'Complete'; data: StreamComplete };

/**
 * 流配置选项
 */
export interface StreamOptions {
  batchSize?: number;
  skipHidden?: boolean;
  sortBy?: string;
  sortOrder?: string;
}

/**
 * 流句柄
 */
export interface StreamHandle {
  streamId: string;
  cancel: () => Promise<void>;
}

/**
 * 流式目录加载回调
 */
export interface StreamCallbacks {
  onBatch?: (batch: DirectoryBatch) => void;
  onProgress?: (progress: StreamProgress) => void;
  onError?: (error: StreamError) => void;
  onComplete?: (complete: StreamComplete) => void;
}

/**
 * 流式浏览目录（Spacedrive 风格）
 * 
 * 使用 Tauri Channel 实现真正的流式数据推送
 * 边扫描边返回，首批数据 100ms 内显示
 * 
 * @param path 目录路径
 * @param callbacks 回调函数
 * @param options 流配置选项
 * @returns StreamHandle 用于取消流
 */
export async function streamDirectory(
  path: string,
  callbacks: StreamCallbacks,
  options?: StreamOptions
): Promise<StreamHandle> {
  // 创建 Tauri Channel 接收流数据
  const channel = new Channel<DirectoryStreamOutput>();

  // 设置消息处理
  channel.onmessage = (output: DirectoryStreamOutput) => {
    switch (output.type) {
      case 'Batch':
        // 过滤排除路径
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
  };

  // 调用后端命令（V2 版本，Spacedrive 风格）
  const streamId = await invoke<string>('stream_directory_v2', {
    path,
    options,
    channel
  });

  return {
    streamId,
    cancel: async () => {
      await invoke('cancel_directory_stream_v2', { streamId });
    }
  };
}

/**
 * 取消指定路径的所有流
 */
export async function cancelStreamsForPath(path: string): Promise<number> {
  return await invoke<number>('cancel_streams_for_path', { path });
}

/**
 * 获取活动流数量
 */
export async function getActiveStreamCount(): Promise<number> {
  return await invoke<number>('get_active_stream_count');
}

/**
 * 流式加载目录的便捷函数
 * 返回 Promise，在流完成时 resolve
 * 
 * @param path 目录路径
 * @param onBatch 每批数据的回调
 * @param options 流配置选项
 * @returns 完成信息
 */
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


// ============================================================================
// 流式搜索 API
// ============================================================================

/**
 * 搜索流输出类型
 */
export type SearchStreamOutput =
  | { type: 'Batch'; data: DirectoryBatch }
  | { type: 'Progress'; data: StreamProgress }
  | { type: 'Error'; data: StreamError }
  | { type: 'Complete'; data: StreamComplete };

/**
 * 流式搜索目录
 * 
 * 边搜索边返回结果，首批结果 200ms 内显示
 * 
 * @param path 搜索路径
 * @param query 搜索关键词
 * @param callbacks 回调函数
 * @param options 流配置选项
 * @returns StreamHandle 用于取消搜索
 */
export async function streamSearch(
  path: string,
  query: string,
  callbacks: StreamCallbacks,
  options?: StreamOptions
): Promise<StreamHandle> {
  // 创建 Tauri Channel 接收搜索结果
  const channel = new Channel<SearchStreamOutput>();

  // 设置消息处理
  channel.onmessage = (output: SearchStreamOutput) => {
    switch (output.type) {
      case 'Batch':
        // 过滤排除路径
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
  };

  // 调用后端命令
  const streamId = await invoke<string>('stream_search_v2', {
    path,
    query,
    options,
    channel
  });

  return {
    streamId,
    cancel: async () => {
      await invoke('cancel_directory_stream_v2', { streamId });
    }
  };
}

/**
 * 流式搜索的便捷函数
 * 返回 Promise，在搜索完成时 resolve
 * 
 * @param path 搜索路径
 * @param query 搜索关键词
 * @param onResult 每批结果的回调
 * @param options 流配置选项
 * @returns 完成信息
 */
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
