/**
 * 共享格式化工具函数
 */

/**
 * 格式化视频时长（秒转为 时:分:秒 格式）
 */
export function formatDuration(seconds?: number): string {
	if (seconds === undefined || seconds === null || !isFinite(seconds) || seconds < 0) return '';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	if (h > 0) {
		return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	}
	return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * 格式化相对时间
 */
export function formatRelativeTime(ts?: number): string {
	if (!ts) return '';
	const now = Date.now();
	const diff = now - ts;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);
	if (minutes < 1) return '刚刚';
	if (minutes < 60) return `${minutes}分钟前`;
	if (hours < 24) return `${hours}小时前`;
	if (days < 7) return `${days}天前`;
	return new Date(ts).toLocaleDateString();
}

/**
 * 格式化文件大小（字节）
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return bytes + ' B';
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
	if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

/**
 * 格式化文件大小（兼容文件夹项目数）
 */
export function formatSize(bytes: number, isDir: boolean): string {
	if (isDir) return bytes === 0 ? '空文件夹' : `${bytes} 项`;
	return formatBytes(bytes);
}

/**
 * 获取文件夹显示大小
 */
export function getFolderSizeDisplay(
	folderSizeLoading: boolean,
	folderTotalSize: number | null | undefined,
	itemSize: number
): string {
	if (folderSizeLoading) return '计算中...';
	if (folderTotalSize !== null && folderTotalSize !== undefined) {
		return formatBytes(folderTotalSize);
	}
	// 回退到项目数
	return itemSize === 0 ? '空文件夹' : `${itemSize} 项`;
}
