/**
 * Thumbnail Placeholders
 * 缩略图占位图支持
 */

export type FailureReason = 
	| 'format_not_supported'  // 格式不支持
	| 'decode_error'          // 解码失败
	| 'timeout'               // 超时
	| 'ipc_error'             // IPC 通信错误
	| 'permission_denied'     // 权限被拒绝
	| 'file_not_found'        // 文件不存在
	| 'unknown';              // 未知错误

export interface FailedThumbnailInfo {
	path: string;
	reason: FailureReason;
	retryCount: number;
	lastAttempt: number;
	errorMessage?: string;
}

// 占位图 SVG 数据（内联以避免网络请求）
const PLACEHOLDER_SVGS: Record<string, string> = {
	image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
		<rect width="64" height="64" fill="#2a2a2a"/>
		<rect x="12" y="16" width="40" height="32" rx="2" stroke="#666" stroke-width="2" fill="none"/>
		<circle cx="22" cy="26" r="4" fill="#666"/>
		<path d="M12 40 L26 30 L34 36 L52 24 L52 46 L12 46 Z" fill="#444"/>
	</svg>`,
	
	folder: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
		<rect width="64" height="64" fill="#2a2a2a"/>
		<path d="M8 20 L8 48 L56 48 L56 24 L32 24 L28 20 Z" fill="#4a4a4a" stroke="#666" stroke-width="2"/>
	</svg>`,
	
	archive: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
		<rect width="64" height="64" fill="#2a2a2a"/>
		<rect x="16" y="12" width="32" height="40" rx="2" stroke="#666" stroke-width="2" fill="none"/>
		<rect x="24" y="12" width="16" height="6" fill="#555"/>
		<rect x="28" y="22" width="8" height="4" fill="#555"/>
		<rect x="28" y="30" width="8" height="4" fill="#555"/>
		<rect x="28" y="38" width="8" height="4" fill="#555"/>
	</svg>`,
	
	video: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
		<rect width="64" height="64" fill="#2a2a2a"/>
		<rect x="8" y="16" width="48" height="32" rx="2" stroke="#666" stroke-width="2" fill="none"/>
		<path d="M26 24 L26 40 L42 32 Z" fill="#666"/>
	</svg>`,
	
	error: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
		<rect width="64" height="64" fill="#2a2a2a"/>
		<circle cx="32" cy="32" r="20" stroke="#ff6b6b" stroke-width="2" fill="none"/>
		<path d="M24 24 L40 40 M40 24 L24 40" stroke="#ff6b6b" stroke-width="2"/>
	</svg>`,
	
	loading: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
		<rect width="64" height="64" fill="#2a2a2a"/>
		<circle cx="32" cy="32" r="16" stroke="#555" stroke-width="3" fill="none"/>
		<path d="M32 16 A16 16 0 0 1 48 32" stroke="#888" stroke-width="3" fill="none"/>
	</svg>`
};

// 缓存已生成的 data URL
const placeholderCache = new Map<string, string>();

/**
 * 获取占位图 data URL
 */
export function getPlaceholder(type: keyof typeof PLACEHOLDER_SVGS): string {
	const cached = placeholderCache.get(type);
	if (cached) return cached;

	const svg = PLACEHOLDER_SVGS[type] || PLACEHOLDER_SVGS.image;
	const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
	placeholderCache.set(type, dataUrl);
	return dataUrl;
}

/**
 * 根据文件路径获取对应类型的占位图
 */
export function getPlaceholderForPath(path: string): string {
	const ext = path.split('.').pop()?.toLowerCase() || '';
	
	// 压缩包
	if (['zip', 'cbz', 'rar', 'cbr', '7z', 'tar', 'gz'].includes(ext)) {
		return getPlaceholder('archive');
	}
	
	// 视频
	if (['mp4', 'mkv', 'avi', 'mov', 'flv', 'webm', 'wmv', 'm4v', 'mpg', 'mpeg'].includes(ext)) {
		return getPlaceholder('video');
	}
	
	// 图片
	if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'avif', 'jxl', 'tiff', 'tif', 'svg'].includes(ext)) {
		return getPlaceholder('image');
	}
	
	// 没有扩展名，可能是文件夹
	if (!ext || !path.includes('.')) {
		return getPlaceholder('folder');
	}
	
	// 默认图片占位
	return getPlaceholder('image');
}

/**
 * 获取失败原因对应的占位图
 */
export function getPlaceholderForReason(reason: FailureReason): string {
	switch (reason) {
		case 'format_not_supported':
		case 'decode_error':
			return getPlaceholder('error');
		case 'timeout':
		case 'ipc_error':
			return getPlaceholder('loading'); // 可重试，显示加载中
		case 'permission_denied':
		case 'file_not_found':
			return getPlaceholder('error');
		default:
			return getPlaceholder('error');
	}
}

/**
 * 根据错误消息推断失败原因
 */
export function inferFailureReason(error: unknown): FailureReason {
	if (!error) return 'unknown';
	
	const msg = String(error).toLowerCase();
	
	if (msg.includes('timeout')) {
		return 'timeout';
	}
	if (msg.includes('ipc') || msg.includes('channel') || msg.includes('connection')) {
		return 'ipc_error';
	}
	if (msg.includes('permission') || msg.includes('access denied') || msg.includes('权限')) {
		return 'permission_denied';
	}
	if (msg.includes('not found') || msg.includes('no such file') || msg.includes('找不到')) {
		return 'file_not_found';
	}
	if (msg.includes('format') || msg.includes('unsupported') || msg.includes('不支持')) {
		return 'format_not_supported';
	}
	if (msg.includes('decode') || msg.includes('corrupt') || msg.includes('invalid')) {
		return 'decode_error';
	}
	
	return 'unknown';
}

/**
 * 判断是否应该重试
 */
export function shouldRetry(reason: FailureReason, retryCount: number, maxRetry: number = 2): boolean {
	// 格式不支持、权限问题、文件不存在 - 不重试
	if (['format_not_supported', 'permission_denied', 'file_not_found'].includes(reason)) {
		return false;
	}
	// 超时和 IPC 错误 - 允许重试
	if (['timeout', 'ipc_error', 'unknown'].includes(reason)) {
		return retryCount < maxRetry;
	}
	// 解码错误 - 最多重试1次
	if (reason === 'decode_error') {
		return retryCount < 1;
	}
	return false;
}
