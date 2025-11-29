/**
 * 缩略图模块导出
 */

export { FolderThumbnailLoader, folderThumbnailLoader } from './FolderThumbnailLoader';
export type { FolderThumbnailConfig, WarmupProgress } from './FolderThumbnailLoader';

// IPC 超时工具
export { 
	invokeWithTimeout, 
	IpcTimeoutError, 
	isTimeoutError, 
	isIpcError,
	DEFAULT_IPC_TIMEOUT 
} from './ipcTimeout';

// 占位图支持
export {
	getPlaceholder,
	getPlaceholderForPath,
	getPlaceholderForReason,
	inferFailureReason,
	shouldRetry
} from './placeholders';
export type { FailureReason, FailedThumbnailInfo } from './placeholders';
