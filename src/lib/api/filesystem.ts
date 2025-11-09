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
  return await invoke<string>('generate_file_thumbnail', { path });
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
