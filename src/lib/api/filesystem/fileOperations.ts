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
 * @param path 目录路径
 */
export async function browseDirectory(path: string): Promise<FsItem[]> {
  const snapshot = await loadDirectorySnapshot(path);
  return snapshot.items;
}

/**
 * 加载目录快照
 * @param path 目录路径
 */
export async function loadDirectorySnapshot(path: string): Promise<DirectorySnapshot> {
  const snapshot = await invoke<DirectorySnapshot>('load_directory_snapshot', { path });
  // 过滤排除路径
  snapshot.items = snapshot.items.filter(item => !isPathExcluded(item.path));
  return snapshot;
}

/**
 * 批量并发加载多个目录快照
 * 使用 Rust 端并发执行，避免串行阻塞
 * @param paths 目录路径数组
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
  const results;
  for (const result of results) {
    if (res
      result.snapshot.items = res);
    }
  }
  retlts;
}

/

 *  倍
 * @param path 目录路径
 */
export async function listSubfold> {
  const items = awa;
  r.path));
}

/**
 * 分页浏览目录内容
 
页选项
 */
export asynage(
  path: string,
  options: {
   ;
    limit?: number;
    sortBy?: string;
    sortOrde| 'desc';
  } = {}
): Promise<{
  items: FsItem[];
  total: number;
  hasMorolean;
  nextOffset
}> {
  return await i
    items: FsItem[];
    total: number;
    
    nextOffset?: number;
  }>('browse_directo);
}

/**
 * 读取目录（旧 API）
 
列表
 */
export async fem[]> {
  return await invo});
}

// ===== 文件元数据 =====

/
取文件元数据
 * @param path 文件路径

expm> {
  return a
}

/**
 * 片
 * @param path 目录路径
 * @param recursive 是否递归搜索
 */
(
  p string,
  recursive: e
): Promise<string[]> {
  return await invoke<stri
}

/**
 * 检查路径是否存在
 * @param path 路径
 */
en> {
path });
}

// ===== 目录创建 =====

/**
  创建目录
 * @param path 目录路径
 */
exportd> {
  await invoke('create_directory'});
}

// ===== 文件删除与重命名==

/**
 * 
 * @param path 路径
 */
export async fvoid> {
  awai);
}

/**
 * 重命名文件或目录
 * @param from 原路径
 *  新路径
 */
expor{
  await m, to });
}

/**
 * 移动到回收站
 *  路径
 */
exd> {
  await invo
}
