/**
 * 文件系统 API
 * 提供文件浏览、操作等功能
 */

import { invoke } from '@tauri-apps/api/core';
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
 */
export async function getFileMetadata(path: string): Promise<FsItem> {
  return await invoke<FsItem>('get_file_info', { path });
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
 * 删除文件或目录
 */
export async function deletePath(path: string): Promise<void> {
  await invoke('delete_path', { path });
}

/**
 * 重命名文件或目录
 */
export async function renamePath(from: string, to: string): Promise<void> {
  await invoke('rename_path', { from, to });
}

/**
 * 移动到回收站
 */
export async function moveToTrash(path: string): Promise<void> {
  await invoke('move_to_trash', { path });
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
 * 通用图片加载（支持 EPUB 等特殊类型）
 */
export async function loadImage(
  path: string,
  options: LoadImageFromArchiveOptions = {}
): Promise<ArrayBuffer> {
  const traceId = options.traceId ?? createImageTraceId('ipc', options.pageIndex);
  logImageTrace(traceId, 'invoke load_image', { path, pageIndex: options.pageIndex });

  const result = await invoke<ArrayBuffer>('load_image', {
    path,
    traceId,
    pageIndex: options.pageIndex
  });

  // 处理返回类型
  if (result instanceof ArrayBuffer) {
    return result;
  } else if (ArrayBuffer.isView(result)) {
    const view = result as Uint8Array;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  } else if (Array.isArray(result)) {
    return new Uint8Array(result).buffer;
  } else {
    throw new Error(`Unexpected result type: ${typeof result}`);
  }
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

export async function loadImageFromArchiveAsBlob(
  archivePath: string,
  filePath: string,
  options: LoadImageFromArchiveOptions = {}
): Promise<{ blob: Blob; traceId: string }> {
  const traceId = options.traceId ?? createImageTraceId('archive', options.pageIndex);
  logImageTrace(traceId, 'invoke load_image_from_archive_binary', {
    archivePath,
    innerPath: filePath,
    pageIndex: options.pageIndex
  });

  // 获取正确的 MIME type
  const mimeType = getMimeTypeFromPath(filePath);

  try {
    // 【优化】使用二进制传输命令，返回 ArrayBuffer
    const result = await invoke<ArrayBuffer>('load_image_from_archive_binary', {
      archivePath,
      filePath,
      traceId,
      pageIndex: options.pageIndex
    });

    // 【关键修复】Tauri 2.x 在 Release 模式下可能返回错误类型
    // 需要确保我们有一个有效的 ArrayBuffer
    let arrayBuffer: ArrayBuffer;
    
    if (result instanceof ArrayBuffer) {
      arrayBuffer = result;
    } else if (ArrayBuffer.isView(result)) {
      // 如果是 TypedArray，获取其 buffer 并创建新的 ArrayBuffer
      const view = result as Uint8Array;
      arrayBuffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
    } else if (Array.isArray(result)) {
      // 如果是普通数组（JSON 回退），转换为 Uint8Array
      arrayBuffer = new Uint8Array(result as number[]).buffer;
    } else if (typeof result === 'object' && result !== null) {
      // 可能是类数组对象
      const values = Object.values(result) as number[];
      arrayBuffer = new Uint8Array(values).buffer;
    } else {
      throw new Error(`Unexpected response type: ${typeof result}`);
    }

    logImageTrace(traceId, 'archive image binary ready', { bytes: arrayBuffer.byteLength });

    // 验证数据有效性（检查图片魔数）
    const header = new Uint8Array(arrayBuffer.slice(0, 12));
    const isValidImage = validateImageHeader(header);
    
    if (!isValidImage && arrayBuffer.byteLength > 0) {
      logImageTrace(traceId, 'binary data invalid, fallback to JSON', { 
        headerBytes: Array.from(header.slice(0, 8))
      });
      throw new Error('Invalid image header, fallback to JSON mode');
    }

    // 创建 Blob 时指定正确的 MIME type
    const blob = new Blob([arrayBuffer], { type: mimeType });
    logImageTrace(traceId, 'blob created', { size: blob.size, mimeType });

    return { blob, traceId };
  } catch (error) {
    // 回退到旧命令（JSON 数组方式，更稳定但效率较低）
    logImageTrace(traceId, 'binary command failed, fallback to JSON', { error: String(error) });
    
    const binaryData = await invoke<number[]>('load_image_from_archive', {
      archivePath,
      filePath,
      traceId,
      pageIndex: options.pageIndex
    });

    const blob = new Blob([new Uint8Array(binaryData)], { type: mimeType });
    logImageTrace(traceId, 'blob created via JSON fallback', { size: blob.size, mimeType });
    return { blob, traceId };
  }
}

/**
 * 验证图片头部魔数
 */
function validateImageHeader(header: Uint8Array): boolean {
  if (header.length < 4) return false;
  
  // JPEG: FF D8 FF
  if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) return true;
  
  // PNG: 89 50 4E 47
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) return true;
  
  // GIF: 47 49 46 38
  if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38) return true;
  
  // WebP: 52 49 46 46 ... 57 45 42 50 (RIFF...WEBP)
  if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
      header.length >= 12 && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50) {
    return true;
  }
  
  // AVIF: 通常以 ftyp 开头（偏移 4-7 字节为 "ftyp"）
  if (header.length >= 8 && header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70) {
    return true;
  }
  
  // BMP: 42 4D
  if (header[0] === 0x42 && header[1] === 0x4D) return true;
  
  // 如果都不匹配但有数据，也可能是有效的（某些格式）
  return header.some(b => b !== 0);
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
 */
export function preheatArchiveList(archivePath: string): void {
  // 检查是否已缓存
  const cached = archiveListCache.get(archivePath);
  if (cached && Date.now() - cached.timestamp < ARCHIVE_LIST_CACHE_TTL) {
    return; // 已缓存，无需预热
  }
  
  // 异步预热
  invoke<string[]>('get_images_from_archive', { archivePath })
    .then(list => {
      archiveListCache.set(archivePath, { list, timestamp: Date.now() });
      console.log(`📦 压缩包列表预热完成: ${archivePath} (${list.length} 项)`);
    })
    .catch(() => {}); // 忽略错误
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
