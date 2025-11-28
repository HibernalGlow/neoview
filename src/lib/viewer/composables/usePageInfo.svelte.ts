/**
 * usePageInfo - 页面信息管理
 * 
 * 从 bookStore2 获取当前页面的虚拟页面信息
 */

import { bookStore2 } from '$lib/stores/bookStore2';
import { get } from 'svelte/store';
import type { PageInfo, Rotation, SplitHalf } from '../core/types';

export function usePageInfo() {
  // 从 bookStore2 获取状态
  let bookState = $state(get(bookStore2));
  
  // 订阅 store 变化
  $effect(() => {
    const unsub = bookStore2.subscribe(v => {
      bookState = v;
    });
    return unsub;
  });
  
  // 当前虚拟页面信息
  const virtualPage = $derived.by(() => {
    const frame = bookState.currentFrame;
    if (!frame || !frame.elements.length) return null;
    return frame.elements[0].virtualPage;
  });
  
  // 是否分割
  const isDivided = $derived(virtualPage?.isDivided ?? false);
  
  // 分割半边
  const splitHalf = $derived.by((): SplitHalf => {
    if (!virtualPage?.isDivided) return null;
    return virtualPage.part === 0 ? 'left' : 'right';
  });
  
  // 旋转角度
  const rotation = $derived.by((): Rotation => {
    const r = virtualPage?.rotation ?? 0;
    if (r === 90 || r === 180 || r === 270) return r;
    return 0;
  });
  
  // 当前页面信息
  const currentPage = $derived.by((): PageInfo | null => {
    if (!bookState.isOpen) return null;
    return {
      index: bookState.currentIndex,
      src: null, // 由外部提供
      rotation,
      splitHalf,
      isDivided,
    };
  });
  
  return {
    // 状态
    get bookState() { return bookState; },
    get virtualPage() { return virtualPage; },
    get isDivided() { return isDivided; },
    get splitHalf() { return splitHalf; },
    get rotation() { return rotation; },
    get currentPage() { return currentPage; },
    
    // 书籍信息
    get isOpen() { return bookState.isOpen; },
    get currentIndex() { return bookState.currentIndex; },
    get totalPages() { return bookState.virtualPageCount; },
    get divideLandscape() { return bookState.divideLandscape; },
    get autoRotate() { return bookState.autoRotate; },
  };
}
