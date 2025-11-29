/**
 * 层相关类型定义
 */
import type { Component } from 'svelte';

/** 层 ID */
export type LayerId = 
  | 'background'
  | 'preload'
  | 'prevFrame'
  | 'nextFrame'
  | 'currentFrame'
  | 'upscale'
  | 'comparison'
  | 'info'
  | 'control'
  | 'gesture';

/** 层配置 */
export interface LayerConfig {
  /** 层 ID */
  id: LayerId | string;
  /** z-index */
  zIndex: number;
  /** 组件 */
  component?: Component;
  /** 组件属性 */
  props?: Record<string, unknown>;
  /** 是否可见 */
  visible?: boolean;
  /** 指针事件模式 */
  pointerEvents?: 'auto' | 'none';
}

/** 层状态 */
export interface LayerState {
  /** 层 ID */
  id: LayerId | string;
  /** 是否可见 */
  visible: boolean;
  /** 是否已加载 */
  loaded: boolean;
  /** 错误信息 */
  error?: string | null;
}

/** 默认层 z-index 映射 */
export const DEFAULT_LAYER_Z_INDEX: Record<LayerId, number> = {
  background: 0,
  preload: 10,
  prevFrame: 20,
  nextFrame: 30,
  currentFrame: 40,
  upscale: 50,
  comparison: 60,
  info: 70,
  control: 80,
  gesture: 90,
};
