import type { ReadingDirection } from '$lib/settings/settingsManager';

export type HorizontalSplitHalf = 'leading' | 'trailing';
export type PhysicalHalf = 'left' | 'right';

export interface SizeLike {
  width: number;
  height: number;
}

/**
 * 判断给定尺寸是否可以视为横向页面（宽高比大于等于阈值）。
 */
export function isHorizontalSize(dims: SizeLike | null | undefined, threshold = 1.2): boolean {
  if (!dims) return false;
  const w = dims.width;
  const h = dims.height;
  if (!w || !h) return false;
  return w / h >= threshold;
}

/**
 * 根据阅读方向，返回“逻辑上的前半页（leading）”对应物理上的哪一半。
 * - 左到右：前半页 = 左半
 * - 右到左：前半页 = 右半
 */
export function getLeadingPhysicalHalf(reading: ReadingDirection): PhysicalHalf {
  return reading === 'right-to-left' ? 'right' : 'left';
}

/**
 * 将逻辑前/后半页映射为物理左右半页。
 */
export function mapLogicalHalfToPhysical(
  logical: HorizontalSplitHalf,
  reading: ReadingDirection
): PhysicalHalf {
  const leadingPhysical = getLeadingPhysicalHalf(reading);
  if (logical === 'leading') return leadingPhysical;
  return leadingPhysical === 'left' ? 'right' : 'left';
}
