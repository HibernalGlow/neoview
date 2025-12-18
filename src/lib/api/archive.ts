/**
 * NeoView - Archive API
 * 压缩包相关的前端 API 封装
 * 全面使用 Python HTTP API
 */

import { apiGet, apiPost, apiDelete, getArchiveFileUrl } from './http-bridge';

/**
 * 获取压缩包首图 Blob URL
 */
export async function getArchiveFirstImageBlob(archivePath: string): Promise<string> {
  // 获取压缩包内容列表
  const entries = await apiGet<Array<{ path: string; isImage: boolean }>>('/archive/list', { path: archivePath });
  const firstImage = entries.find(e => e.isImage);
  if (!firstImage) {
    throw new Error('No image found in archive');
  }
  // 返回图片 URL
  return getArchiveFileUrl(archivePath, firstImage.path);
}

/**
 * 获取 Blob 内容（Web 模式不支持）
 */
export async function getBlobContent(blobKey: string): Promise<Uint8Array> {
  console.warn('[getBlobContent] Web 模式不支持此功能', blobKey);
  return new Uint8Array(0);
}

/**
 * 释放 Blob（Web 模式不支持）
 */
export async function releaseBlob(blobKey: string): Promise<boolean> {
  console.warn('[releaseBlob] Web 模式不支持此功能', blobKey);
  return true;
}

/**
 * 清理过期 Blob（Web 模式不支持）
 */
export async function cleanupExpiredBlobs(): Promise<number> {
  console.warn('[cleanupExpiredBlobs] Web 模式不支持此功能');
  return 0;
}

/**
 * 获取 Blob 统计（Web 模式不支持）
 */
export async function getBlobStats(): Promise<{
  totalEntries: number;
  totalBytes: number;
  expiredCount: number;
  maxEntries: number;
}> {
  console.warn('[getBlobStats] Web 模式不支持此功能');
  return {
    totalEntries: 0,
    totalBytes: 0,
    expiredCount: 0,
    maxEntries: 0
  };
}

/**
 * 删除压缩包条目
 */
export async function deleteArchiveEntry(archivePath: string, innerPath: string): Promise<void> {
  await apiDelete('/archive/entry', { archive_path: archivePath, inner_path: innerPath });
}
