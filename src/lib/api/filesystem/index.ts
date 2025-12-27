/**
 * 文件系统 API
 * 提供文件浏览、操作等功能
 * 
 * 模块结构：
 * - types.ts: 类型定义
 * - utils.ts: 工具函数
 * - fileOperations.ts: 文件操作
 * - archiveOperations.ts: 压缩包操作
 * - streamOperations.ts: 流式操作
 * - videoOperations.ts: 视频操作
 * - systemIntegration.ts: 系统集成
 */

// ===== 类型导出 =====
export type {
  DirectorySnapshot,
  BatchDirectorySnapshotResult,
  SubfolderItem,
  TrashItem,
  LoadImageFromArchiveOptions,
  PreloadResult,
  DirectoryBatch,
  StreamProgress,
  StreamError,
  StreamComplete,
  DirectoryStreamOutput,
  SearchStreamOutput,
  StreamOptions,
  StreamHandle,
  StreamCallbacks
} from './types';

// ===== 工具函数导出 =====
export { invokeWithRetry, getMimeTypeFromPath } from './utils';

// ===== 文件操作导出 =====
export {
  selectFolder,
  browseDirectory,
  loadDirectorySnapshot,
  batchLoadDirectorySnapshots,
  listSubfolders,
  browseDirectoryPage,
  readDirectory,
  getFileMetadata,
  getImagesInDirectory,
  pathExists,
  createDirectory,
  deletePath,
  renamePath,
  moveToTrash,
  copyPath,
  movePath,
  openWithSystem,
  showInFileManager,
  searchFiles
} from './fileOperations';

// ===== 回收站操作导出 =====
export {
  moveToTrashAsync,
  getLastDeletedItem,
  undoLastDelete,
  restoreFromTrash
} from './trashOperations';

// ===== 压缩包操作导出 =====
export {
  listArchiveContents,
  getImagesFromArchive,
  preheatArchiveList,
  clearArchiveListCache,
  loadImage,
  loadImageFromArchive,
  loadImageFromArchiveAsBlob,
  preloadArchivePages,
  isSupportedArchive,
  getArchiveFirstImageQuick,
  getArchiveFirstImageBlob
} from './archiveOperations';

// ===== 流式操作导出 =====
export {
  streamDirectory,
  streamDirectoryAsync,
  startDirectoryStream,
  getNextStreamBatch,
  cancelDirectoryStream,
  cancelStreamsForPath,
  getActiveStreamCount,
  streamSearch,
  streamSearchAsync
} from './streamOperations';

// ===== 视频操作导出 =====
export {
  generateVideoThumbnail,
  getVideoDuration,
  isVideoFile,
  checkFFmpegAvailable
} from './videoOperations';

// ===== 系统集成导出 =====
export {
  getExplorerContextMenuEnabled,
  setExplorerContextMenuEnabled,
  generateExplorerContextMenuReg
} from './systemIntegration';
