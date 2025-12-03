/**
 * 排除路径存储
 * 用于存储不需要生成缩略图的路径
 */

import { SvelteSet } from 'svelte/reactivity';

// 排除路径列表
const excludedPaths = new SvelteSet<string>();

// 加载保存的排除路径
function loadExcludedPaths(): void {
  try {
    const saved = localStorage.getItem('neoview-excluded-paths');
    if (saved) {
      const paths = JSON.parse(saved) as string[];
      paths.forEach(p => excludedPaths.add(p));
    }
  } catch (e) {
    console.error('加载排除路径失败:', e);
  }
}

// 保存排除路径
function saveExcludedPaths(): void {
  try {
    const paths = Array.from(excludedPaths);
    localStorage.setItem('neoview-excluded-paths', JSON.stringify(paths));
  } catch (e) {
    console.error('保存排除路径失败:', e);
  }
}

// 初始化
if (typeof window !== 'undefined') {
  loadExcludedPaths();
}

/**
 * 添加排除路径
 */
export function addExcludedPath(path: string): void {
  excludedPaths.add(path);
  saveExcludedPaths();
  console.log('➕ 添加排除路径:', path);
}

/**
 * 移除排除路径
 */
export function removeExcludedPath(path: string): void {
  excludedPaths.delete(path);
  saveExcludedPaths();
  console.log('➖ 移除排除路径:', path);
}

/**
 * 检查路径是否被排除
 */
export function isPathExcluded(path: string): boolean {
  // 精确匹配或前缀匹配（排除整个目录）
  if (excludedPaths.has(path)) return true;
  
  for (const excluded of excludedPaths) {
    if (path.startsWith(excluded + '\\') || path.startsWith(excluded + '/')) {
      return true;
    }
  }
  return false;
}

/**
 * 获取所有排除路径
 */
export function getExcludedPaths(): string[] {
  return Array.from(excludedPaths);
}

/**
 * 清除所有排除路径
 */
export function clearExcludedPaths(): void {
  excludedPaths.clear();
  saveExcludedPaths();
  console.log('🗑️ 清除所有排除路径');
}

/**
 * 检查路径是否被排除（供 store 使用）
 */
export { excludedPaths };
