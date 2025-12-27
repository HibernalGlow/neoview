/**
 * FileItemCard 工具函数
 * 从 FileItemCard.svelte 提取的可重用函数
 */

// 媒体文件扩展名
const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'jxl', 'bmp', 'tiff', 'svg', 'ico'];
const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'nov', 'flv', 'webm', 'wmv', 'm4v', 'mpg', 'mpeg'];
const textExts = ['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts', 'log'];

/**
 * 判断文件是否为媒体文件（图片/视频/文本）
 */
export function isMediaFile(name: string): boolean {
	const ext = name.split('.').pop()?.toLowerCase() || '';
	return imageExts.includes(ext) || videoExts.includes(ext) || textExts.includes(ext);
}

/**
 * 判断文件是否为压缩包
 */
export function isArchiveFile(name: string): boolean {
	return /\.(zip|cbz|rar|cbr|7z|cb7)$/i.test(name);
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
 * 格式化文件大小
 */
export function formatFileSize(bytes: number, isDir: boolean): string {
	if (isDir) {
		return bytes === 0 ? '空文件夹' : `${bytes} 项`;
	}
	if (bytes < 1024) return bytes + ' B';
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
	if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

/**
 * 性别类别（用于混合匹配）
 */
export const genderCategories = ['female', 'male', 'mixed'];

/**
 * 规范化标签键名
 */
export function normalizeTagKey(s: string): string {
	return s.trim().toLowerCase();
}
