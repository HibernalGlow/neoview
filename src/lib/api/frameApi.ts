/**
 * Frame API - 后端主导帧架构的前端接口
 *
 * 前端只负责：
 * - 请求后端 frame snapshot
 * - 渲染后端给出的帧
 * - 上报 viewport
 * - 处理用户输入
 */

import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// 类型定义（与后端 FrameSnapshot 对齐）
// ============================================================================

/** 裁剪区域（归一化坐标 0-1） */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 分割半边 */
export type SplitHalf = 'left' | 'right';

/** 帧布局类型 */
export type FrameLayoutType = 'single' | 'double' | 'panorama' | 'video';

/** 帧中的图片信息 */
export interface FrameImageInfo {
  /** 物理页面索引 */
  pageIndex: number;
  /** 图片 URL（neoview:// 协议） */
  url: string;
  /** 图片宽度（原始） */
  width: number;
  /** 图片高度（原始） */
  height: number;
  /** 裁剪区域（分割页面时使用） */
  cropRect?: CropRect;
  /** 分割半边（兼容旧前端） */
  splitHalf?: SplitHalf;
  /** 内容缩放比例（双页对齐时使用） */
  scale: number;
  /** 是否为占位元素 */
  isDummy: boolean;
  /** 旋转角度（度） */
  rotation: number;
}

/** 帧快照 - 后端输出给前端的完整帧描述 */
export interface FrameSnapshot {
  /** 书籍路径 */
  bookPath: string;
  /** 当前页索引（物理页） */
  pageIndex: number;
  /** 帧 ID */
  frameId: string;
  /** 布局类型 */
  layout: FrameLayoutType;
  /** 帧中的图片列表（已按显示顺序排列） */
  images: FrameImageInfo[];
  /** 翻页步长 */
  step: number;
  /** 是否可以前进 */
  canNext: boolean;
  /** 是否可以后退 */
  canPrev: boolean;
  /** 帧是否就绪 */
  ready: boolean;
  /** 阅读方向 */
  direction: 'ltr' | 'rtl';
}

/** 请求帧快照的参数 */
export interface GetFrameSnapshotParams {
  pageMode: 'single' | 'double';
  readOrder: 'ltr' | 'rtl';
  splitHorizontal: boolean;
  widePage: boolean;
  singleFirst: boolean;
  singleLast: boolean;
  divideRate: number;
  splitHalf?: SplitHalf;
}

// ============================================================================
// API 函数
// ============================================================================

/**
 * 获取当前帧快照
 *
 * 这是新的阅读热路径入口，后端主导 frame 组合
 */
export async function getFrameSnapshot(params: GetFrameSnapshotParams): Promise<FrameSnapshot> {
  return invoke<FrameSnapshot>('pm_get_frame_snapshot', {
    pageMode: params.pageMode,
    readOrder: params.readOrder,
    splitHorizontal: params.splitHorizontal,
    widePage: params.widePage,
    singleFirst: params.singleFirst,
    singleLast: params.singleLast,
    divideRate: params.divideRate,
    splitHalf: params.splitHalf ?? null,
  });
}

/**
 * 上报视口尺寸
 *
 * 前端上报视口信息，后端据此决定图片尺寸和缓存策略
 */
export async function reportViewport(
  width: number,
  height: number,
  dpr: number,
  viewMode: 'single' | 'double' | 'panorama'
): Promise<void> {
  return invoke('pm_report_viewport', { width, height, dpr, viewMode });
}
