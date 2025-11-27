/**
 * 文件系统 API
 * 提供文件浏览、操作等功能
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { FsItem } from '$lib/types';
import { createImageTraceId, logImageTrace } from '$lib/utils/imageTrace';

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
  return await invoke<DirectorySnapshot>('load_directory_snapshot', { path });
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
 */
export async function readDirectory(path: string): Promise<any[]> {
  return await invoke<any[]>('read_directory', { path });
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

export async function loadImageFromArchive(
  archivePath: string,
  filePath: string,
  options: LoadImageFromArchiveOptions = {}
): Promise<string> {
  const traceId = options.traceId ?? createImageTraceId('archive', options.pageIndex);
  logImageTrace(traceId, 'invoke load_image_from_archive', {
    archivePath,
    innerPath: filePath,
    pageIndex: options.pageIndex
  });

  const binaryData = await invoke<number[]>('load_image_from_archive', {
    archivePath,
    filePath,
    traceId,
    pageIndex: options.pageIndex
  });

  logImageTrace(traceId, 'archive image bytes ready', { bytes: binaryData.length });

  const blob = new Blob([new Uint8Array(binaryData)]);
  const url = URL.createObjectURL(blob);

  logImageTrace(traceId, 'blob url created', { size: blob.size });

  return url;
}

/**
 * 获取压缩包中的所有图片
 */
export async function getImagesFromArchive(archivePath: string): Promise<string[]> {
  return await invoke<string[]>('get_images_from_archive', { archivePath });
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

/**
 * 极限优化：批量加载缩略图原始字节
 * 返回 [path, Uint8Array][] 数组，前端直接创建 Blob URL
 */
export async function batchLoadThumbnailsRaw(paths: string[]): Promise<Array<[string, Uint8Array]>> {
  const results = await invoke<Array<[string, number[]]>>('batch_load_thumbnails_raw', { paths });
  // 将 number[] 转换为 Uint8Array
  return results.map(([path, data]) => [path, new Uint8Array(data)]);
}

/**
 * 获取目录下所有缓存的缩略图（用于启动预加载）
 */
export async function getThumbnailsByDirectory(directory: string): Promise<Array<{ path: string; data: Uint8Array }>> {
  const results = await invoke<Array<{ path: string; data: number[] }>>('get_thumbnails_by_directory', { directory });
  return results.map(({ path, data }) => ({ path, data: new Uint8Array(data) }));
}

/**
 * 批量删除缩略图条目
 */
export async function deleteThumbnailsByPaths(paths: string[]): Promise<number> {
  return await invoke<number>('delete_thumbnails_by_paths', { paths });
}
