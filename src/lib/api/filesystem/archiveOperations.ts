/**
 * 压缩包操作模块
 * 包含压缩包的列表、读取、预加载等功能
 */

import { invoke } from '@tauri-apps/api/core';
import type { FsItem } from '$lib/types';
import { createImageTraceId, logImageTrace } from '$lib/utils/imageTrace';
import { decodeBase64 } from '$lib/workers/base64DecoderManager';
import { invokeWithRetry, getMimeTypeFromPath } from './utils';
import type { LoadImageFromArchiveOptions, PreloadResult } from './types';

// ===== 压缩包列表 =====

/**
 * 列出压缩包内容
 */
export async function listArchiveContents(archivePath: string): Promise<FsItem[]> {
  return await invoke<FsItem[]>('list_archive_contents', { archivePath });
}

/**
 * 压缩包文件列表缓存
 */
const archiveListCache = new Map<string, { list: string[]; timestamp: number }>();
const ARCHIVE_LIST_CACHE_TTL = 5 * 60 * 1000; // 5分钟过期

/**
 * 获取压缩包中的所有图片（带缓存）
 */
export async function getImagesFromArchive(archivePath: string): Promise<string[]> {
  const cached = archiveListCache.get(archivePath);
  if (cached && Date.now() - cached.timestamp < ARCHIVE_LIST_CACHE_TTL) {
    console.log(`📦 压缩包列表缓存命中: ${archivePath}`);
    return cached.list;
  }
  
  const list = await invoke<string[]>('get_images_from_archive', { archivePath });
  archiveListCache.set(archivePath, { list, timestamp: Date.now() });
  
  return list;
}

/**
 * 预热压缩包文件列表（不等待结果）
 * 【已禁用】功能已注释掉
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function preheatArchiveList(_archivePath: string): void {
  // 功能已禁用
  return;
}

/**
 * 清理压缩包列表缓存
 */
export function clearArchiveListCache(): void {
  archiveListCache.clear();
}

// ===== 压缩包图片加载 =====

/**
 * 通用图片加载（支持 EPUB 等特殊类型，使用 Base64 传输）
 */
export async function loadImage(
  path: string,
  options: LoadImageFromArchiveOptions = {}
): Promise<ArrayBuffer> {
  const traceId = options.traceId ?? createImageTraceId('ipc', options.pageIndex);
  logImageTrace(traceId, 'invoke load_image_base64', { path, pageIndex: options.pageIndex });

  const base64 = await invokeWithRetry<string>('load_image_base64', {
    path,
    traceId,
    pageIndex: options.pageIndex
  });

  return base64ToArrayBuffer(base64);
}

/**
 * 加载压缩包图片为 Object URL（旧接口，兼容用）
 */
export async function loadImageFromArchive(
  archivePath: string,
  filePath: string,
  options: LoadImageFromArchiveOptions = {}
): Promise<string> {
  const { blob } = await loadImageFromArchiveAsBlob(archivePath, filePath, options);
  return URL.createObjectURL(blob);
}

/**
 * 加载压缩包图片为 Blob（推荐，避免重复转换）
 */
export async function loadImageFromArchiveAsBlob(
  archivePath: string,
  filePath: string,
  options: LoadImageFromArchiveOptions = {}
): Promise<{ blob: Blob; traceId: string }> {
  const traceId = options.traceId ?? createImageTraceId('archive', options.pageIndex);
  logImageTrace(traceId, 'invoke load_image_from_archive_base64', {
    archivePath,
    innerPath: filePath,
    pageIndex: options.pageIndex
  });

  const mimeType = getMimeTypeFromPath(filePath);

  const base64 = await invokeWithRetry<string>('load_image_from_archive_base64', {
    archivePath,
    filePath,
    traceId,
    pageIndex: options.pageIndex
  });

  const arrayBuffer = await decodeBase64(base64, mimeType);
  logImageTrace(traceId, 'archive image base64 decoded', { bytes: arrayBuffer.byteLength });

  const blob = new Blob([arrayBuffer], { type: mimeType });
  logImageTrace(traceId, 'blob created', { size: blob.size, mimeType });

  return { blob, traceId };
}

/**
 * 并行预加载压缩包页面到后端缓存
 */
export async function preloadArchivePages(
  archivePath: string,
  pagePaths: string[]
): Promise<PreloadResult> {
  console.log(`⚡ 并行预加载: ${pagePaths.length} 页 from ${archivePath}`);
  try {
    const result = await invoke<PreloadResult>('preload_archive_pages', {
      archivePath,
      pagePaths
    });
    console.log(`✅ 预加载完成: ${result.success}/${result.total}, ${(result.totalBytes / 1024).toFixed(0)}KB`);
    return result;
  } catch (error) {
    console.error('❌ 预加载失败:', error);
    throw error;
  }
}

/**
 * 检查是否为支持的压缩包
 */
export async function isSupportedArchive(path: string): Promise<boolean> {
  return await invoke<boolean>('is_supported_archive', { path });
}

/**
 * 快速获取压缩包内的第一张图片（旧版本，返回字节数组）
 * @deprecated 请使用 getArchiveFirstImageBlob
 */
export async function getArchiveFirstImageQuick(archivePath: string): Promise<string> {
  console.log('⚡ FileSystemAPI: 快速获取压缩包首张图片 (旧版):', archivePath);
  try {
    const { getArchiveFirstImageBlob: invokeArchiveFirstImageBlob } = await import('../archive');
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
 */
export async function getArchiveFirstImageBlob(archivePath: string): Promise<string> {
  console.log('⚡ FileSystemAPI: 获取压缩包首图 blob:', archivePath);
  try {
    const { getArchiveFirstImageBlob: invokeArchiveFirstImageBlob } = await import('../archive');
    const blobUrl = await invokeArchiveFirstImageBlob(archivePath);
    console.log('✅ FileSystemAPI: 获取成功, blob URL:', blobUrl);
    return blobUrl;
  } catch (error) {
    console.error('❌ FileSystemAPI: 获取失败:', archivePath, error);
    throw error;
  }
}

// ===== Base64 辅助函数 =====

/**
 * 将 Base64 字符串转换为 ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
