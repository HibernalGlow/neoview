/**
 * NeoView - API Exports
 * 统一导出所有 API 接口
 */

export * from './book';
export * from './image';
export * from './fs';
export * from './performance';
export * as FileSystemAPI from './filesystem';
export * as IndexAPI from './file_index';

// Thumbnail API exports
export { 
  generateFileThumbnail, 
  generateFolderThumbnail, 
  init_thumbnail_manager as initThumbnailManager,
  init_thumbnail_manager,
  getThumbnailUrl,
  getThumbnailInfo,
  cleanupThumbnails,
  getThumbnailStats,
  clearAllThumbnails,
  preloadThumbnails
} from './filesystem';