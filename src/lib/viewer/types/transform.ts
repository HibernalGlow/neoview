/**
 * 变换相关类型定义
 */
import type { Rotation } from './frame';

/** 变换状态 */
export interface Transform {
  /** 缩放 */
  scale: number;
  /** X 轴偏移 */
  offsetX: number;
  /** Y 轴偏移 */
  offsetY: number;
  /** 旋转角度 */
  rotation: Rotation;
}

/** 默认变换 */
export const defaultTransform: Transform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
};

/** 重置变换 */
export function resetTransform(): Transform {
  return { ...defaultTransform };
}

/** 计算变换 CSS */
export function computeTransformCSS(transform: Transform): string {
  const parts: string[] = [];
  
  if (transform.offsetX !== 0 || transform.offsetY !== 0) {
    parts.push(`translate(${transform.offsetX}px, ${transform.offsetY}px)`);
  }
  
  if (transform.scale !== 1) {
    parts.push(`scale(${transform.scale})`);
  }
  
  if (transform.rotation !== 0) {
    parts.push(`rotate(${transform.rotation}deg)`);
  }
  
  return parts.length > 0 ? parts.join(' ') : 'none';
}

/** 计算分割裁剪路径 */
export function computeClipPath(splitHalf: 'left' | 'right' | null): string {
  if (splitHalf === 'left') {
    return 'inset(0 50% 0 0)';
  } else if (splitHalf === 'right') {
    return 'inset(0 0 0 50%)';
  }
  return 'none';
}

/** 计算分割位移补偿 */
export function computeSplitTranslate(splitHalf: 'left' | 'right' | null): string {
  if (splitHalf === 'left') {
    return 'translateX(25%)';
  } else if (splitHalf === 'right') {
    return 'translateX(-25%)';
  }
  return '';
}
