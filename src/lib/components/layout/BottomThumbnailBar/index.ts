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

// 工具函数导出
export {
  LOCAL_MIN_THUMBNAILS,
  ARCHIVE_MIN_THUMBNAILS,
  PRELOAD_RANGE,
  THUMBNAIL_DEBOUNCE_MS,
  getMinVisibleThumbnails,
  ensureMinimumSpan,
  getWindowBadgeLabel,
  getWindowBadgeClass,
  calculateThumbnailDimensions,
  calculateReadingProgress,
  type PageWindow,
  type ThumbnailDimensions
} from './thumbnailUtils';
