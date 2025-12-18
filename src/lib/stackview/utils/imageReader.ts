/**
 * StackView 图片读取模块
 * 负责从文件系统或压缩包读取图片数据
 * 
 * 【HTTP 方案】
 * 1. 文件系统图片：通过 Python HTTP API 获取
 * 2. 压缩包图片：通过 Python HTTP API 提取
 * 
 * 【延迟追踪】记录加载耗时到 infoPanelStore
 */

import { getFileUrl as convertFileSrc, getArchiveFileUrl as convertArchiveFileSrc } from '$lib/api/http-bridge';
import { bookStore } from '$lib/stores/book.svelte';
import { infoPanelStore, type LatencyTrace } from '$lib/stores/infoPanel.svelte';
import { loadModeStore } from '$lib/stores/loadModeStore.svelte';

export interface ReadResult {
  blob: Blob;
  pageIndex: number;
}

export interface ReadPageOptions {
  /** 是否更新延迟追踪显示 */
  updateLatencyTrace?: boolean;
}

/**
 * 读取页面图片为 Blob
 * 直接通过 HTTP API 获取，绕过 Tauri IPC
 */
export async function readPageBlob(pageIndex: number, options: ReadPageOptions = {}): Promise<ReadResult> {
  const { updateLatencyTrace = true } = options;
  const startTime = performance.now();
  const currentBook = bookStore.currentBook;
  
  if (!currentBook) {
    throw new Error(`页面 ${pageIndex} 不存在: 没有打开的书籍`);
  }
  if (pageIndex < 0 || pageIndex >= currentBook.pages.length) {
    throw new Error(`页面 ${pageIndex} 不存在: 索引越界 (总页数: ${currentBook.pages.length})`);
  }
  const pageInfo = currentBook.pages[pageIndex];
  if (!pageInfo) {
    throw new Error(`页面 ${pageIndex} 不存在: 页面信息为空`);
  }

  const loadStart = performance.now();
  let blob: Blob;
  let url: string;

  if (currentBook.type === 'archive') {
    // 压缩包：通过 HTTP API 提取
    url = convertArchiveFileSrc(currentBook.path, pageInfo.path);
  } else {
    // 文件系统：通过 HTTP API 获取
    url = convertFileSrc(pageInfo.path);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`图片加载失败: ${response.status} - ${url}`);
  }
  blob = await response.blob();
  
  const loadMs = performance.now() - loadStart;
  const totalMs = performance.now() - startTime;

  // 更新延迟追踪
  if (updateLatencyTrace) {
    const latencyTrace: LatencyTrace = {
      dataSource: 'http',
      renderMode: loadModeStore.isImgMode ? 'img' : 'canvas',
      loadMs,
      totalMs,
      cacheHit: false,
      dataSize: blob.size,
      traceId: `stackview-${pageIndex}`
    };
    infoPanelStore.setLatencyTrace(latencyTrace);
  }

  return { blob, pageIndex };
}

/**
 * 获取图片尺寸
 */
export function getImageDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const result = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(result);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
