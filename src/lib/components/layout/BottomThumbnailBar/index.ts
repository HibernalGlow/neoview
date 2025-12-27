/**
 * BottomThumbnailBar 模块导出
 * 
 * 底部缩略图栏 - 自动隐藏，鼠标悬停显示
 */

// 类型导出
export interface ThumbnailBarConfig {
  showPageNumbers: boolean;
  autoHideTiming: {
    showDelaySec: number;
    hideDelaySec: number;
  };
  opacity: number;
  blur: number;
  progressBarGlow: boolean;
}

// 常量导出
export const LOCAL_MIN_THUMBNAILS = 6;
export const ARCHIVE_MIN_THUMBNAILS = 3;
export const THUMBNAIL_DEBOUNCE_MS = 100;
