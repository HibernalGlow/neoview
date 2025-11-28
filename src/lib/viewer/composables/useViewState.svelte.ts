/**
 * useViewState - 视图状态管理
 * 
 * 管理缩放、旋转、平移等视图状态
 */

import { zoomLevel, rotationAngle, resetZoom, zoomIn, zoomOut } from '$lib/stores';
import { get } from 'svelte/store';
import type { Point, Rotation, ViewState } from '../core/types';

export interface ViewStateOptions {
  minScale?: number;
  maxScale?: number;
  initialScale?: number;
}

export function useViewState(options: ViewStateOptions = {}) {
  const { minScale = 0.1, maxScale = 10, initialScale = 1 } = options;
  
  // 本地平移状态
  let localOffset = $state<Point>({ x: 0, y: 0 });
  
  // 从 stores 获取状态
  let scale = $derived(get(zoomLevel));
  let rotation = $derived((get(rotationAngle) % 360) as Rotation);
  
  // 订阅 stores
  $effect(() => {
    const unsubZoom = zoomLevel.subscribe(v => {
      // 响应外部缩放变化
    });
    const unsubRotation = rotationAngle.subscribe(v => {
      // 响应外部旋转变化
    });
    
    return () => {
      unsubZoom();
      unsubRotation();
    };
  });
  
  function setScale(value: number) {
    const clamped = Math.max(minScale, Math.min(maxScale, value));
    zoomLevel.set(clamped);
  }
  
  function setOffset(point: Point) {
    localOffset = point;
  }
  
  function addOffset(delta: Point) {
    localOffset = {
      x: localOffset.x + delta.x,
      y: localOffset.y + delta.y,
    };
  }
  
  function reset() {
    resetZoom();
    localOffset = { x: 0, y: 0 };
  }
  
  function zoomBy(factor: number) {
    if (factor > 1) {
      zoomIn();
    } else if (factor < 1) {
      zoomOut();
    }
  }
  
  return {
    // 状态
    get scale() { return scale; },
    get rotation() { return rotation; },
    get offset() { return localOffset; },
    
    // 方法
    setScale,
    setOffset,
    addOffset,
    reset,
    zoomBy,
  };
}
