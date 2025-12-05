/**
 * FrameSlot - 层叠渲染帧槽类型定义
 * 
 * 用于 StackViewer 的三层渲染栈：前页/当前页/后页
 */

/** 帧槽位置 */
export type SlotPosition = 'prev' | 'current' | 'next';

/** 单页图片数据 */
export interface SlotImage {
  /** 图片 URL */
  url: string;
  /** 图片 Blob（用于 Canvas 预渲染） */
  blob: Blob | null;
  /** 图片尺寸 */
  dimensions: { width: number; height: number } | null;
  /** 页面索引 */
  pageIndex: number;
}

/** 帧槽数据 */
export interface FrameSlot {
  /** 槽位置 */
  position: SlotPosition;
  /** 起始页面索引（-1 表示空槽） */
  pageIndex: number;
  /** 图片列表（单页模式 1 张，双页模式 1-2 张） */
  images: SlotImage[];
  /** 是否正在加载 */
  loading: boolean;
  /** 预加载的背景色（第一张图） */
  backgroundColor: string | null;
  /** 预计算的缩放比例（基于当前视口和缩放模式） */
  precomputedScale: number | null;
}

/** 创建空帧槽 */
export function createEmptySlot(position: SlotPosition): FrameSlot {
  return {
    position,
    pageIndex: -1,
    images: [],
    loading: false,
    backgroundColor: null,
    precomputedScale: null,
  };
}

/** 帧槽轮转方向 */
export type RotateDirection = 'forward' | 'backward';

/**
 * 轮转帧槽数组
 * forward: [prev, current, next] → [current, next, newNext]
 * backward: [prev, current, next] → [newPrev, prev, current]
 */
export function rotateSlots(
  slots: [FrameSlot, FrameSlot, FrameSlot],
  direction: RotateDirection
): [FrameSlot, FrameSlot, FrameSlot] {
  if (direction === 'forward') {
    // 向前翻页：prev 被丢弃，current 变 prev，next 变 current，新 next 待加载
    return [
      { ...slots[1], position: 'prev' },
      { ...slots[2], position: 'current' },
      createEmptySlot('next'),
    ];
  } else {
    // 向后翻页：next 被丢弃，current 变 next，prev 变 current，新 prev 待加载
    return [
      createEmptySlot('prev'),
      { ...slots[0], position: 'current' },
      { ...slots[1], position: 'next' },
    ];
  }
}

/** 层级 z-index 常量 */
export const SlotZIndex = {
  PREV: 10,
  CURRENT: 20,
  NEXT: 15,
  UPSCALE: 25,
} as const;
