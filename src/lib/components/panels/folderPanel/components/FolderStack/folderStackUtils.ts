/**
 * FolderStack 路径处理和导航工具函数
 */

/**
 * 规范化路径（统一分隔符和大小写）
 * 用于路径比较
 */
export function normalizePathForCompare(path: string): string {
	return path.replace(/\\/g, '/').toLowerCase();
}

/**
 * 检查路径是否是另一个路径的子目录
 */
export function isChildPath(childPath: string, parentPath: string): boolean {
	const normalizedChild = childPath.replace(/\\/g, '/').toLowerCase();
	const normalizedParent = parentPath.replace(/\\/g, '/').toLowerCase();
	return normalizedChild.startsWith(normalizedParent + '/');
}

/**
 * 获取父目录路径 - 统一使用 Windows 反斜杠格式
 */
export function getParentPath(path: string): string | null {
	const normalized = path.replace(/\//g, '\\');
	const parts = normalized.split('\\').filter(Boolean);
	if (parts.length <= 1) return null; // 已经是根目录
	parts.pop();
	// Windows 盘符格式
	let parentPath = parts.join('\\');
	// 确保盘符后有反斜杠
	if (/^[a-zA-Z]:$/.test(parentPath)) {
		parentPath += '\\';
	}
	return parentPath;
}

/**
 * 获取多层父目录路径
 * @param path 起始路径
 * @param count 要获取的层数
 * @returns 父目录路径数组（从近到远）
 */
export function getParentPaths(path: string, count: number): string[] {
	const parents: string[] = [];
	let currentPath = path;
	for (let i = 0; i < count; i++) {
		const parent = getParentPath(currentPath);
		if (!parent) break;
		parents.push(parent);
		currentPath = parent;
	}
	return parents;
}

/**
 * 将路径转换为相对 key（用于缩略图存储）
 */
export function toRelativeKey(path: string): string {
	return path.replace(/\\/g, '/');
}

/**
 * 预加载父目录层数常量
 */
export const PRELOAD_PARENT_COUNT = 3;

/**
 * 支持的图片扩展名
 */
export const IMAGE_EXTENSIONS = [
	'.jpg',
	'.jpeg',
	'.png',
	'.gif',
	'.bmp',
	'.webp',
	'.avif',
	'.jxl',
	'.tiff',
	'.tif'
];

/**
 * 支持的压缩包扩展名
 */
export const ARCHIVE_EXTENSIONS = ['.zip', '.rar', '.7z', '.cbz', '.cbr', '.cb7'];

/**
 * 支持的视频扩展名
 */
export const VIDEO_EXTENSIONS = [
	'.mp4',
	'.mkv',
	'.avi',
	'.mov',
	'.nov',
	'.flv',
	'.webm',
	'.wmv',
	'.m4v',
	'.mpg',
	'.mpeg'
];

/**
 * 检查文件是否是压缩包
 */
export function isArchiveFile(name: string): boolean {
	const nameLower = name.toLowerCase();
	return ARCHIVE_EXTENSIONS.some(ext => nameLower.endsWith(ext));
}

/**
 * 检查文件是否需要缩略图
 */
export function needsThumbnail(name: string, isDir: boolean): boolean {
	if (isDir) return true;
	
	const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
	return (
		IMAGE_EXTENSIONS.includes(ext) ||
		ARCHIVE_EXTENSIONS.includes(ext) ||
		VIDEO_EXTENSIONS.includes(ext)
	);
}

import type { FsItem } from '$lib/types';

/**
 * 层叠数据结构
 */
export interface FolderLayer {
	id: string;
	path: string;
	items: FsItem[];
	loading: boolean;
	error: string | null;
	selectedIndex: number;
	scrollTop: number;
}
