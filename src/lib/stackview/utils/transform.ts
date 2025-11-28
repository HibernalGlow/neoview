/**
 * 变换计算工具函数
 */

import type { FrameImage } from '../types/frame';

/**
 * 计算裁剪路径
 */
export function getClipPath(splitHalf: 'left' | 'right' | null | undefined): string {
  if (splitHalf === 'left') {
    return 'inset(0 50% 0 0)';  // 裁掉右半
  } else if (splitHalf === 'right') {
    return 'inset(0 0 0 50%)';  // 裁掉左半
  }
  return 'none';
}

/**
 * 计算分割位移补偿
 */
export function getSplitTransform(splitHalf: 'left' | 'right' | null | undefined): string {
  if (splitHalf === 'left') {
    return 'translateX(25%)';  // 向右移动 25%
  } else if (splitHalf === 'right') {
    return 'translateX(-25%)'; // 向左移动 25%
  }
  return '';
}

/**
 * 计算旋转变换
 */
export function getRotationTransform(rotation: number | undefined): string {
  if (!rotation) return '';
  return `rotate(${rotation}deg)`;
}

/**
 * 计算图片变换（组合分割和旋转）
 */
export function getImageTransform(img: FrameImage): string {
  const parts: string[] = [];
  
  // 分割位移
  const splitTransform = getSplitTransform(img.splitHalf);
  if (splitTransform) parts.push(splitTransform);
  
  // 旋转
  const rotationTransform = getRotationTransform(img.rotation);
  if (rotationTransform) parts.push(rotationTransform);
  
  return parts.length > 0 ? parts.join(' ') : 'none';
}

/**
 * 计算基础变换（缩放、旋转、平移）
 */
export function getBaseTransform(
  scale: number,
  rotation: number,
  panX: number,
  panY: number
): string {
  const parts: string[] = [];
  
  if (scale !== 1) {
    parts.push(`scale(${scale})`);
  }
  
  if (rotation !== 0) {
    parts.push(`rotate(${rotation}deg)`);
  }
  
  if (panX !== 0 || panY !== 0) {
    parts.push(`translate(${panX}px, ${panY}px)`);
  }
  
  return parts.length > 0 ? parts.join(' ') : 'none';
}
