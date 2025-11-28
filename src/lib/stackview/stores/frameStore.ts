/**
 * 帧状态管理
 * 
 * 从 bookStore2 获取数据并转换为 StackView 的帧格式
 */

import { derived, writable, type Readable } from 'svelte/store';
import { bookStore2 } from '$lib/stores/bookStore2';
import type { Frame, FrameImage } from '../types/frame';
import { emptyFrame } from '../types/frame';

/**
 * 图片 URL 缓存
 */
const imageUrlCache = writable<Map<number, string>>(new Map());

/**
 * 更新图片 URL 缓存
 */
export function updateImageUrl(physicalIndex: number, url: string): void {
  imageUrlCache.update(cache => {
    cache.set(physicalIndex, url);
    return cache;
  });
}

/**
 * 批量更新图片 URL 缓存
 */
export function updateImageUrls(urls: Map<number, string>): void {
  imageUrlCache.update(cache => {
    urls.forEach((url, index) => {
      cache.set(index, url);
    });
    return cache;
  });
}

/**
 * 清除图片 URL 缓存
 */
export function clearImageUrls(): void {
  imageUrlCache.set(new Map());
}

interface VirtualPageElement {
  virtualPage: {
    physicalPage: { index: number; size?: { width?: number; height?: number } };
    virtualIndex: number;
    isDivided: boolean;
    part: number;
    rotation?: number;
  };
}

/**
 * 从 bookStore2 的 PageFrame 转换为 StackView 的 Frame
 */
function convertPageFrameToFrame(
  pageFrame: { elements: VirtualPageElement[] } | null,
  urlCache: Map<number, string>
): Frame {
  if (!pageFrame || !pageFrame.elements.length) {
    return emptyFrame;
  }
  
  const images: FrameImage[] = pageFrame.elements.map(element => {
    const vp = element.virtualPage;
    return {
      url: urlCache.get(vp.physicalPage.index) || '',
      physicalIndex: vp.physicalPage.index,
      virtualIndex: vp.virtualIndex,
      splitHalf: vp.isDivided ? (vp.part === 0 ? 'left' : 'right') : null,
      rotation: vp.rotation || 0,
      width: vp.physicalPage.size?.width,
      height: vp.physicalPage.size?.height,
    };
  });
  
  return {
    id: `frame-${Date.now()}`,
    images,
    layout: images.length > 1 ? 'double' : 'single',
  };
}

/**
 * 当前帧 store
 */
export const currentFrame: Readable<Frame> = derived(
  [bookStore2, imageUrlCache],
  ([$state, $urlCache]) => {
    return convertPageFrameToFrame($state.currentFrame, $urlCache);
  }
);

/**
 * 前一帧 store（预加载）
 */
export const prevFrame: Readable<Frame> = derived(
  [bookStore2, imageUrlCache],
  ([$state, $urlCache]) => {
    if ($state.currentIndex <= 0) return emptyFrame;
    
    const prevVp = bookStore2.getVirtualPage($state.currentIndex - 1);
    if (!prevVp) return emptyFrame;
    
    const images: FrameImage[] = [{
      url: $urlCache.get(prevVp.physicalPage.index) || '',
      physicalIndex: prevVp.physicalPage.index,
      virtualIndex: prevVp.virtualIndex,
      splitHalf: prevVp.isDivided ? (prevVp.part === 0 ? 'left' : 'right') : null,
      rotation: prevVp.rotation || 0,
    }];
    
    return {
      id: `prev-frame-${$state.currentIndex - 1}`,
      images,
      layout: 'single' as const,
    };
  }
);

/**
 * 后一帧 store（预加载）
 */
export const nextFrame: Readable<Frame> = derived(
  [bookStore2, imageUrlCache],
  ([$state, $urlCache]) => {
    if ($state.currentIndex >= $state.virtualPageCount - 1) return emptyFrame;
    
    const nextVp = bookStore2.getVirtualPage($state.currentIndex + 1);
    if (!nextVp) return emptyFrame;
    
    const images: FrameImage[] = [{
      url: $urlCache.get(nextVp.physicalPage.index) || '',
      physicalIndex: nextVp.physicalPage.index,
      virtualIndex: nextVp.virtualIndex,
      splitHalf: nextVp.isDivided ? (nextVp.part === 0 ? 'left' : 'right') : null,
      rotation: nextVp.rotation || 0,
    }];
    
    return {
      id: `next-frame-${$state.currentIndex + 1}`,
      images,
      layout: 'single' as const,
    };
  }
);

/**
 * 超分帧 store
 */
export const upscaledFrame = writable<Frame>(emptyFrame);

/**
 * 设置超分帧
 */
export function setUpscaledFrame(frame: Frame): void {
  upscaledFrame.set(frame);
}

/**
 * 清除超分帧
 */
export function clearUpscaledFrame(): void {
  upscaledFrame.set(emptyFrame);
}
