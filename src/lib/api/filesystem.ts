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
 * 生成文件缩略图
 */
export async function generateFileThumbnail(path: string): Promise<string> {
  console.log('🖼️ FileSystemAPI: 生成文件缩略图:', path);
  try {
    const result = await invoke<string>('generate_file_thumbnail_new', { filePath: path });
    console.log('✅ FileSystemAPI: 文件缩略图生成成功:', result);
    return result;
  } catch (error) {
    console.error('❌ FileSystemAPI: 文件缩略图生成失败:', path, error);
    throw error;
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
  return await invoke<string>('load_image_from_archive', { archivePath, filePath });
}

/**
 * 获取压缩包中的所有图片
 */
export async function getImagesFromArchive(archivePath: string): Promise<string[]> {
  return await invoke<string[]>('get_images_from_archive', { archivePath });
}

/**
 * 从压缩包中提取图片到临时目录（返回本地绝对路径数组，不带 file://）
 */
export async function extractArchiveImages(archivePath: string, start: number = 0, count: number = 1): Promise<string[]> {
  return await invoke<string[]>('extract_archive_images', { archivePath: archivePath, start, count });
}

/**
 * 为已提取的本地图片生成缩略图（返回缩略图本地路径，不带 file://）
 */
export async function generateThumbForExtracted(localPath: string, maxSize: number = 256): Promise<string> {
  return await invoke<string>('generate_thumb_for_extracted', { localPath: localPath, maxSize });
}

/**
 * 按 innerPath 提取单个压缩包内部文件并返回本地路径（不带 file://）
 */
export async function extractArchiveInner(archivePath: string, innerPath: string): Promise<string> {
  // The backend command expects a single `args` parameter (Json) containing archivePath/innerPath.
  return await invoke<string>('extract_archive_inner', { args: { archivePath, innerPath } });
}

/**
 * 生成压缩包内图片的缩略图
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