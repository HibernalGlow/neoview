/**
 * Path Hash Utils
 * 统一的路径哈希工具模块
 * 用于所有图片相关模块的ID生成
 */

import { invoke } from '@tauri-apps/api/core';

// 用于前端所有地方的统一输入
export interface ImagePathContext {
  bookPath?: string;                   // 书本物理路径（文件夹 / 压缩包）
  bookType?: 'file' | 'folder' | 'archive';
  pagePath: string;                    // 页的 path（对 archive 来说是 innerPath 或 page.path）
  innerPath?: string;                  // archive 的 innerPath，优先使用
}

// 简单缓存，避免重复 RPC
const hashCache = new Map<string, string>();

/**
 * 获取缓存的哈希值
 */
export function getCachedHash(pathKey: string): string | undefined {
  return hashCache.get(pathKey);
}

/**
 * 统一构造路径键
 * 规则：
 * - 压缩包：archivePath::innerPath
 * - 普通文件/文件夹：pagePath（完整路径）
 */
export function buildImagePathKey(ctx: ImagePathContext): string {
  // 优先使用 innerPath（压缩包内的路径）
  const pagePath = ctx.innerPath ?? ctx.pagePath;
  
  if (ctx.bookType === 'archive' || ctx.innerPath) {
    // 压缩包：archivePath::innerPath
    const bookPath = ctx.bookPath ?? '';
    return `${bookPath}::${pagePath}`;
  } else {
    // 普通文件/文件夹：直接使用完整路径
    return pagePath;
  }
}

/**
 * 统一获取稳定哈希
 * 注意：对于 bookStore 相关的场景，请使用 bookStore.getPageHash() 或 bookStore.getCurrentPageHash()
 * 对于缩略图等独立场景，可以使用此函数
 */
export async function getStableImageHash(
  ctxOrKey: ImagePathContext | string
): Promise<string> {
  const pathKey = typeof ctxOrKey === 'string' ? ctxOrKey : buildImagePathKey(ctxOrKey);

  // 检查缓存
  const cached = hashCache.get(pathKey);
  if (cached) {
    return cached;
  }

  // 前端实现：SHA-256
  const encoder = new TextEncoder();
  const bytes = encoder.encode(pathKey);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  const arr = Array.from(new Uint8Array(buf));
  const hash = arr.map(b => b.toString(16).padStart(2, '0')).join('');
  
  hashCache.set(pathKey, hash);
  return hash;
}

/**
 * 规范化路径（可选）
 * 统一路径分隔符，移除尾部斜杠
 */
export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')           // 统一使用正斜杠
    .replace(/\/+$/, '');          // 移除尾部斜杠
}

/**
 * 构建完整的 ImagePathContext
 * 从现有数据构建上下文对象
 */
export function buildImageContext(
  bookPath: string,
  pagePath: string, 
  bookType: 'file' | 'folder' | 'archive',
  innerPath?: string
): ImagePathContext {
  return {
    bookPath: normalizePath(bookPath),
    bookType,
    pagePath: normalizePath(pagePath),
    innerPath: innerPath ? normalizePath(innerPath) : undefined
  };
}

/**
 * 批量生成路径哈希
 * 用于预加载场景
 */
export async function batchGenerateHashes(
  contexts: ImagePathContext[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  // 并行处理，提高性能
  await Promise.all(
    contexts.map(async (ctx) => {
      const pathKey = buildImagePathKey(ctx);
      const hash = await getStableImageHash(pathKey);
      results.set(pathKey, hash);
    })
  );
  
  return results;
}

/**
 * 清空缓存（用于测试或重置）
 */
export function clearHashCache(): void {
  hashCache.clear();
}