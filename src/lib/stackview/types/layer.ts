/**
 * 层相关类型定义
 */

import type { Component } from 'svelte';

/**
 * 层 z-index 常量
 */
export const LayerZIndex = {
  BACKGROUND: 0,
  EXTENDED_PRELOAD: 10,
  PREV_FRAME: 20,
  NEXT_FRAME: 30,
  CURRENT_FRAME: 40,
  UPSCALE: 50,
  PROGRESS_BAR: 60,
  INFO: 70,
  IMAGE_INFO: 75,
  CONTROL: 80,
  GESTURE: 90,
  SIDEBAR_CONTROL: 100, // 边栏控制器在手势层之上
} as const;

/**
 * 层 ID 类型
 */
export type LayerId = 
  | 'background'
  | 'extendedPreload'
  | 'prevFrame'
  | 'nextFrame'
  | 'currentFrame'
  | 'upscale'
  | 'progressBar'
  | 'info'
  | 'imageInfo'
  | 'control'
  | 'sidebarControl'
  | 'gesture'
  | string; // 允许自定义层

/**
 * 层配置
 */
export interface LayerConfig {
  /** 层 ID */
  id: LayerId;
  /** z-index */
  zIndex: number;
  /** 组件 */
  component?: Component;
  /** 组件 props */
  props?: Record<string, unknown>;
  /** 是否可见 */
  visible?: boolean;
  /** 是否接收指针事件 */
  pointerEvents?: 'auto' | 'none';
}

/**
 * 层管理器接口
 */
export interface LayerManager {
  /** 注册层 */
  registerLayer(config: LayerConfig): void;
  /** 移除层 */
  unregisterLayer(id: LayerId): void;
  /** 获取层 */
  getLayer(id: LayerId): LayerConfig | null;
  /** 更新层 */
  updateLayer(id: LayerId, props: Partial<LayerConfig>): void;
  /** 显示层 */
  showLayer(id: LayerId): void;
  /** 隐藏层 */
  hideLayer(id: LayerId): void;
  /** 切换层可见性 */
  toggleLayer(id: LayerId): void;
  /** 获取所有层 */
  getAllLayers(): LayerConfig[];
}
