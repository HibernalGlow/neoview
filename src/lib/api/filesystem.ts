/**
 * 文件系统 API
 * 提供文件浏览、操作、缩略图生成等功能
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { FsItem } from '$lib/types';

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
  return await invoke<FsItem[]>('browse_directory', { path });
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
 * 生成文件缩略图 - tokio异步极致优化版本
 */
export async function generateFileThumbnail(path: string): Promise<string> {
  console.log('⚡ FileSystemAPI: 异步生成文件缩略图:', path);
  try {
    const result = await invoke<string>('generate_file_thumbnail_async', { filePath: path });
    console.log('✅ FileSystemAPI: 文件缩略图生成成功:', result);
    return result;
  } catch (error) {
    console.error('❌ FileSystemAPI: 文件缩略图生成失败:', path, error);
    // 如果异步失败，降级到同步版本
    console.log('🔄 降级到同步版本');
    return await invoke<string>('generate_file_thumbnail_new', { filePath: path });
  }
}

/**
 * 生成文件夹缩略图
 */
export async function generateFolderThumbnail(path: string): Promise<string> {
  console.log('📁 FileSystemAPI: 生成文件夹缩略图:', path);
  try {
    const result = await invoke<string>('generate_folder_thumbnail', { folderPath: path });
    console.log('✅ FileSystemAPI: 文件夹缩略图生成成功:', result);
    return result;
  } catch (error) {
    console.error('❌ FileSystemAPI: 文件夹缩略图生成失败:', path, error);
    throw error;
  }
}

/**
 * 获取缩略图数据（返回 base64 data URL）
 */
export async function getThumbnailData(path: string): Promise<string> {
  console.log('🖼️ FileSystemAPI: 获取缩略图数据:', path);
  try {
    const result = await invoke<string>('get_thumbnail_data', { filePath: path });
    console.log('✅ FileSystemAPI: 缩略图数据获取成功');
    return result;
  } catch (error) {
    console.error('❌ FileSystemAPI: 缩略图数据获取失败:', path, error);
    throw error;
  }
}

/**
 * 初始化缩略图管理器
 */
export async function init_thumbnail_manager(
  thumbnailPath: string,
  rootPath: string,
  size?: number
): Promise<void> {
  return await invoke<void>('init_thumbnail_manager', { 
    thumbnailPath, 
    rootPath, 
    size 
  });
}

/**
 * 从图片数据生成缩略图（用于压缩包内图片）
 */
export async function generateThumbnailFromData(imageData: string, maxSize: number = 256): Promise<string> {
  return await invoke<string>('generate_thumbnail_from_data', { imageData, maxSize });
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
 * 获取缩略图缓存大小
 */
export async function getThumbnailCacheSize(): Promise<number> {
  return await invoke<number>('get_thumbnail_cache_size');
}

/**
 * 清空缩略图缓存
 */
export async function clearThumbnailCache(): Promise<number> {
  return await invoke<number>('clear_thumbnail_cache');
}

/**
 * 清理过期缓存
 */
export async function cleanupThumbnailCache(maxAgeDays: number): Promise<number> {
  return await invoke<number>('cleanup_thumbnail_cache', { maxAgeDays });
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
export async function loadImageFromArchive(
  archivePath: string,
  filePath: string
): Promise<string> {
  const binaryData = await invoke<number[]>('load_image', { path: filePath });
  const blob = new Blob([new Uint8Array(binaryData)]);
  return URL.createObjectURL(blob);
}

/**
 * 获取压缩包中的所有图片
 */
export async function getImagesFromArchive(archivePath: string): Promise<string[]> {
  return await invoke<string[]>('get_images_from_archive', { archivePath });
}

/**
 * 生成压缩包根缩略图（优化版本）
 */
export async function generateArchiveThumbnailRoot(archivePath: string): Promise<string> {
  console.log('📦 FileSystemAPI: 生成压缩包根缩略图:', archivePath);
  try {
    const result = await invoke<string>('generate_archive_thumbnail_root', { archivePath });
    console.log('✅ FileSystemAPI: 压缩包根缩略图生成成功:', result);
    return result;
  } catch (error) {
    console.error('❌ FileSystemAPI: 压缩包根缩略图生成失败:', archivePath, error);
    throw error;
  }
}

/**
 * 生成压缩包内特定页缩略图
 */
export async function generateArchiveThumbnailInner(
  archivePath: string,
  innerPath: string
): Promise<string> {
  console.log('📦 FileSystemAPI: 生成压缩包内页缩略图:', archivePath, '::', innerPath);
  try {
    const result = await invoke<string>('generate_archive_thumbnail_inner', { 
      archivePath, 
      innerPath 
    });
    console.log('✅ FileSystemAPI: 压缩包内页缩略图生成成功:', result);
    return result;
  } catch (error) {
    console.error('❌ FileSystemAPI: 压缩包内页缩略图生成失败:', archivePath, innerPath, error);
    throw error;
  }
}

/**
 * 生成压缩包内图片的缩略图（旧版本，保留兼容性）
 */
export async function generateArchiveThumbnail(
  archivePath: string,
  filePath: string,
  maxSize: number = 256
): Promise<string> {
  return await invoke<string>('generate_archive_thumbnail', { 
    archivePath, 
    filePath, 
    maxSize 
  });
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

// ===== 缩略图相关 API =====

/**
 * 获取缩略图URL（不生成新的）
 */
export async function getThumbnailUrl(path: string): Promise<string | null> {
  return await invoke<string | null>('get_thumbnail_url', { path });
}

/**
 * 获取缩略图信息（包括尺寸等）
 */
export async function getThumbnailInfo(path: string): Promise<any | null> {
  return await invoke<any | null>('get_thumbnail_info', { path });
}

/**
 * 清理过期缩略图
 */
export async function cleanupThumbnails(days?: number): Promise<number> {
  return await invoke<number>('cleanup_thumbnails', { days });
}

/**
 * 获取缩略图统计信息
 */
export async function getThumbnailStats(): Promise<any> {
  return await invoke<any>('get_thumbnail_stats');
}

/**
 * 取消指定路径的缩略图生成任务
 */
export async function cancelThumbnailTask(path: string): Promise<boolean> {
  return await invoke<boolean>('cancel_thumbnail_task', { path });
}

/**
 * 取消指定目录下的所有缩略图生成任务
 */
export async function cancelFolderTasks(dirPath: string): Promise<number> {
  return await invoke<number>('cancel_folder_tasks', { dirPath });
}

/**
 * 获取错误统计信息
 */
export async function getThumbnailErrorStats(): Promise<Record<string, number>> {
  return await invoke<Record<string, number>>('get_thumbnail_error_stats');
}

/**
 * 清空所有缩略图
 */
export async function clearAllThumbnails(): Promise<number> {
  return await invoke<number>('clear_all_thumbnails');
}

/**
 * 预加载缩略图
 */
export async function preloadThumbnails(paths: string[]): Promise<string[]> {
  return await invoke<string[]>('preload_thumbnails', { paths });
}

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
 * 批量入队当前目录的所有文件为最高优先级
 * 用于快速加载当前浏览目录的缩略图
 */
export async function enqueueDirFilesHighestPriority(dirPath: string): Promise<number> {
  return await invoke<number>('enqueue_dir_files_highest_priority', { dirPath });
}

/**
 * 快速获取压缩包内的第一张图片原始字节
 * 用于首次加载时立即显示原图，不进行任何处理
 * 返回 blob URL（通过 URL.createObjectURL）
 */
export async function getArchiveFirstImageQuick(archivePath: string): Promise<string> {
  console.log('⚡ FileSystemAPI: 快速获取压缩包首张图片:', archivePath);
  try {
    const imageBytes = await invoke<number[]>('get_archive_first_image_quick', { archivePath });
    // 转换为 Blob 然后创建 blob URL
    const blob = new Blob([new Uint8Array(imageBytes)]);
    const blobUrl = URL.createObjectURL(blob);
    console.log('✅ FileSystemAPI: 快速获取成功:', blob.size, 'bytes, URL:', blobUrl);
    return blobUrl;
  } catch (error) {
    console.error('❌ FileSystemAPI: 快速获取失败:', archivePath, error);
    throw error;
  }
}

/**
 * 后台异步生成压缩包缩略图（不等待完成）
 * 立即返回，缩略图生成在后台进行
 */
export async function generateArchiveThumbnailAsync(archivePath: string): Promise<string> {
  console.log('🔄 FileSystemAPI: 后台异步生成压缩包缩略图:', archivePath);
  try {
    const result = await invoke<string>('generate_archive_thumbnail_async', { archivePath });
    console.log('✅ FileSystemAPI: 异步生成已入队:', result);
    return result;
  } catch (error) {
    console.error('❌ FileSystemAPI: 异步生成失败:', archivePath, error);
    throw error;
  }
}

/**
 * 优先加载当前文件夹（使用 tokio 优化）
 * 立即返回，后台异步处理当前文件夹的所有文件
 * 让当前文件夹的文件最优先生成缩略图
 */
export async function prioritizeCurrentFolder(dirPath: string): Promise<string> {
  console.log('📥 FileSystemAPI: 优先加载当前文件夹:', dirPath);
  try {
    const result = await invoke<string>('prioritize_current_folder', { dir_path: dirPath });
    console.log('✅ FileSystemAPI: 当前文件夹优先加载已启动:', result);
    return result;
  } catch (error) {
    console.error('❌ FileSystemAPI: 优先加载失败:', dirPath, error);
    throw error;
  }
}

/**
 * 获取缩略图处理器性能指标
 * 用于监控缩略图生成系统的运行状态
 */
export async function getThumbnailMetrics(): Promise<any> {
  try {
    const metrics = await invoke<any>('get_thumbnail_metrics');
    return metrics;
  } catch (error) {
    console.error('❌ FileSystemAPI: 获取处理器指标失败:', error);
    throw error;
  }
}

/**
 * 设置前台源目录
 * 用于优先处理当前可见目录的缩略图任务
 */
export async function setForegroundSource(sourceId: string): Promise<void> {
  console.log('🎯 FileSystemAPI: 设置前台源:', sourceId);
  try {
    await invoke<void>('set_foreground_source', { sourceId });
    console.log('✅ FileSystemAPI: 前台源设置成功');
  } catch (error) {
    console.error('❌ FileSystemAPI: 前台源设置失败:', error);
    throw error;
  }
}