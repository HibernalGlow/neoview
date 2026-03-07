/**
 * 资源释放模块
 * 在删除文件/文件夹前释放后端持有的资源（文件句柄等）
 * 
 * 解决问题：穿透模式下查看文件夹内容时，后端 PageManager 持有文件句柄，
 * 导致删除文件夹失败（Error: Some operations were aborted）
 */

import { invoke } from '@tauri-apps/api/core';
import { bookStore } from '$lib/stores/book.svelte';

/**
 * 规范化路径用于比较（统一斜杠方向、小写化）
 */
function normalizePath(path: string): string {
  return path.replace(/\//g, '\\').toLowerCase();
}

/**
 * 检查 childPath 是否是 parentPath 的子路径或相同路径
 */
function isPathContained(childPath: string, parentPath: string): boolean {
  const childNorm = normalizePath(childPath);
  const parentNorm = normalizePath(parentPath);
  
  if (childNorm === parentNorm) return true;
  return childNorm.startsWith(parentNorm + '\\');
}

function compactTargetPaths(paths: string[]): string[] {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  uniquePaths.sort((a, b) => a.length - b.length);

  const compacted: string[] = [];
  for (const path of uniquePaths) {
    const coveredByParent = compacted.some(parent => isPathContained(path, parent));
    if (!coveredByParent) {
      compacted.push(path);
    }
  }

  return compacted;
}

async function closeBookIfNeeded(targetPaths: string[]): Promise<void> {
  const requiresBookClose = targetPaths.some(isBookRelatedToPath);

  if (!requiresBookClose) {
    return;
  }

  console.log(`🔓 [ResourceRelease] 检测到书籍与目标路径相关，开始释放资源: ${targetPaths.join(', ')}`);
  console.log(`🔓 [ResourceRelease] 当前书籍路径: ${bookStore.currentBook?.path}`);

  await bookStore.closeBook();

  try {
    await invoke('pm_close_book');
  } catch (e) {
    console.warn('[ResourceRelease] pm_close_book 失败:', e);
  }

  try {
    await invoke('close_book');
  } catch (e) {
    console.warn('[ResourceRelease] close_book 失败:', e);
  }

  try {
    await invoke('pm_clear_cache');
  } catch (e) {
    console.warn('[ResourceRelease] pm_clear_cache 失败:', e);
  }
}

async function releasePathCaches(targetPaths: string[]): Promise<void> {
  for (const path of compactTargetPaths(targetPaths)) {
    try {
      await invoke('release_path_resources', { path });
    } catch (e) {
      console.warn('[ResourceRelease] release_path_resources 失败:', e);
    }
  }
}

/**
 * 检查当前打开的书籍是否与指定路径相关
 * 
 * @param targetPath 要删除的路径
 * @returns 是否相关（需要释放资源）
 */
export function isBookRelatedToPath(targetPath: string): boolean {
  const currentBook = bookStore.currentBook;
  if (!currentBook) return false;
  
  const bookPath = currentBook.path;
  
  // 情况1：要删除的路径就是当前书籍路径
  if (isPathContained(bookPath, targetPath)) {
    return true;
  }
  
  // 情况2：当前书籍路径是要删除路径的子路径（穿透模式）
  if (isPathContained(targetPath, bookPath)) {
    return true;
  }
  
  // 情况3：检查当前页面路径
  const currentPage = bookStore.currentPage;
  if (currentPage?.path && isPathContained(currentPage.path, targetPath)) {
    return true;
  }
  
  return false;
}

/**
 * 释放与指定路径相关的资源
 * 
 * 在删除文件/文件夹前调用，确保后端释放文件句柄
 * 
 * @param targetPath 要删除的路径
 * @returns 是否成功释放（或无需释放）
 */
export async function releaseResourcesForPath(targetPath: string): Promise<boolean> {
  try {
    await closeBookIfNeeded([targetPath]);
    await releasePathCaches([targetPath]);
    
    // 等待一小段时间确保文件句柄完全释放
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log(`✅ [ResourceRelease] 资源已释放: ${targetPath}`);
    return true;
  } catch (err) {
    console.error(`❌ [ResourceRelease] 释放资源失败:`, err);
    return false;
  }
}

/**
 * 批量释放资源
 * 
 * @param paths 要删除的路径列表
 * @returns 是否成功释放
 */
export async function releaseResourcesForPaths(paths: string[]): Promise<boolean> {
  if (paths.length === 0) {
    return true;
  }

  try {
    const targetPaths = compactTargetPaths(paths);
    await closeBookIfNeeded(targetPaths);
    await releasePathCaches(targetPaths);
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log(`✅ [ResourceRelease] 批量资源已释放: ${targetPaths.join(', ')}`);
    return true;
  } catch (err) {
    console.error(`❌ [ResourceRelease] 批量释放资源失败:`, err);
    return false;
  }
}
