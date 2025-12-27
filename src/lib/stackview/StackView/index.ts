/**
 * StackView 模块导出
 * 
 * 层叠式图片查看器（独立模式）
 * 使用 imageStore 管理图片加载，复用现有手势和缩放
 */

// 类型导出
export interface ViewportSize {
  width: number;
  height: number;
}

export interface DisplaySize {
  width: number;
  height: number;
}

// 对齐模式
export type AlignMode = 'center' | 'left' | 'right';
