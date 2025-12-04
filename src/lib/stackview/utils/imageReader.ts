/**
 * StackView 图片读取模块
 * 负责从文件系统或压缩包读取图片数据
 * 
 * 【纯内存方案】
 * 1. 文件系统图片：使用 asset:// 协议
 * 2. 压缩包图片：使用二进制 IPC
 * 
 * 【延迟追踪】记录加载耗时到 infoPanelStore
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { bookStore } from '$lib/stores/book.svelte';
import { loadImageFromArchiveAsBlob } from '$lib/api/filesystem';
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

  let blob: Blob;
  let loadMs = 0;

  if (currentBook.type === 'archive') {
    // 压缩包：使用二进制 IPC
    const loadStart = performance.now();
    const result = await loadImageFromArchiveAsBlob(currentBook.path, pageInfo.path, {
      pageIndex
    });
    blob = result.blob;
    loadMs = performance.now() - loadStart;
  } else {
    // 文件系统：使用 asset:// 协议
    const loadStart = performance.now();
    const assetUrl = convertFileSrc(pageInfo.path);
    const response = await fetch(assetUrl);
    if (!response.ok) {
      throw new Error(`Asset fetch failed: ${response.status}`);
    }
    blob = await response.blob();
    loadMs = performance.now() - loadStart;
  }

  const totalMs = performance.now() - startTime;

  // 更新延迟追踪
  if (updateLatencyTrace) {
    const latencyTrace: LatencyTrace = {
      dataSource: loadModeStore.isTempfileMode ? 'tempfile' : 'blob',
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
