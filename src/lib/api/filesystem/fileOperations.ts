/**
 * 文件操作模块
 * 包含文件读写、目录浏览、文件信息获取等基础操作
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { FsItem } from '$lib/types';
import { isPathExcluded } from '$lib/stores/excludedPaths.svelte';
import { invokeWithRetry } from './utils';
import type { 
  DirectorySnapshot, 
  BatchDirectorySnapshotResult, 
  SubfolderItem,
  TrashItem 
} from './types';

// ===== 文件夹选择 =====

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

// ===== 目录浏览 =====

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
  const snapshot = await invoke<DirectorySnapshot>('load_directory_snapshot', { path });
  snapshot.items = snapshot.items.filter(item => !isPathExcluded(item.path));
  return snapshot;
}

/**
 * 批量并发加载多个目录快照
 */
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
  const results = await invoke<BatchDirectorySnapshotResult[]>(
    'batch_load_directory_snapshots', 
    { paths }
  );
  for (const result of results) {
    if (result.snapshot) {
      result.snapshot.items = result.snapshot.items.filter(
        item => !isPathExcluded(item.path)
      );
    }
  }
  return results;
}

/**
 * 快速列出目录下的子文件夹（专用于 FolderTree）
 */
export async function listSubfolders(path: string): Promise<SubfolderItem[]> {
  const items = await invoke<SubfolderItem[]>('list_subfolders', { path });
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
 * 读取目录（旧 API）
 */
export async function readDirectory(
  path: string, 
  excludedPaths?: string[]
): Promise<FsItem[]> {
  return await invoke<FsItem[]>('read_directory', { path, excludedPaths });
}

// ===== 文件元数据 =====

/**
 * 获取文件元数据
 */
export async function getFileMetadata(path: string): Promise<FsItem> {
  return await invoke<FsItem>('get_file_metadata', { path });
}

/**
 * 获取目录总大小（优先系统 API）
 */
export async function getDirectoryTotalSizeSystem(path: string): Promise<number> {
  return await invoke<number>('get_directory_total_size_system', { path });
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
 * 检查路径是否存在
 */
export async function pathExists(path: string): Promise<boolean> {
  return await invoke<boolean>('path_exists', { path });
}

// ===== 目录创建 =====

/**
 * 创建目录
 */
export async function createDirectory(path: string): Promise<void> {
  await invoke('create_directory', { path });
}

// ===== 文件删除与重命名 =====

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

// ===== 文件复制与移动 =====

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

// ===== 系统集成 =====

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
