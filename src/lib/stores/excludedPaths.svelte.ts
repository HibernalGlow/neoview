/**
 * 排除路径存储
 * 用于存储不需要生成缩略图的路径
 */

import { SvelteSet } from 'svelte/reactivity';

// 默认排除路径（系统目录、开发目录等）
const DEFAULT_EXCLUDED_PATHS = [
	'E:\\WindowsApps',
	'D:\\Dev',
	'D:\\WindowsApps',
	'C:\\Windows',
	'C:\\Program Files',
	'C:\\Program Files (x86)',
	'C:\\ProgramData',
	// 回收站在每个盘符都有，使用大写（Windows 实际路径）
	'C:\\$RECYCLE.BIN',
	'D:\\$RECYCLE.BIN',
	'E:\\$RECYCLE.BIN',
	'F:\\$RECYCLE.BIN',
	'G:\\$RECYCLE.BIN',
	// System Volume Information
	'C:\\System Volume Information',
	'D:\\System Volume Information',
	'E:\\System Volume Information',
	'F:\\System Volume Information',
	'G:\\System Volume Information'
];

// 排除路径列表
const excludedPaths = new SvelteSet<string>();

// 加载保存的排除路径
function loadExcludedPaths(): void {
	try {
		const saved = localStorage.getItem('neoview-excluded-paths');
		if (saved) {
			const paths = JSON.parse(saved) as string[];
			paths.forEach((p) => excludedPaths.add(p));
		} else {
			// 首次使用，添加默认排除路径
			DEFAULT_EXCLUDED_PATHS.forEach((p) => excludedPaths.add(p));
			saveExcludedPaths();
		}
	} catch (e) {
		console.error('加载排除路径失败:', e);
	}
}

// 保存排除路径
function saveExcludedPaths(): void {
	try {
		const paths = Array.from(excludedPaths);
		localStorage.setItem('neoview-excluded-paths', JSON.stringify(paths));
	} catch (e) {
		console.error('保存排除路径失败:', e);
	}
}

// 初始化
if (typeof window !== 'undefined') {
	loadExcludedPaths();
}

/**
 * 添加排除路径
 */
export function addExcludedPath(path: string): void {
	excludedPaths.add(path);
	saveExcludedPaths();
	console.log('➕ 添加排除路径:', path);
}

/**
 * 移除排除路径
 */
export function removeExcludedPath(path: string): void {
	excludedPaths.delete(path);
	saveExcludedPaths();
	console.log('➖ 移除排除路径:', path);
}

/**
 * 检查路径是否被排除
 * Windows 路径大小写不敏感
 */
export function isPathExcluded(path: string): boolean {
	// 规范化为小写进行比较（Windows 路径不区分大小写）
	const normalizedPath = path.toLowerCase().replace(/\//g, '\\');

	for (const excluded of excludedPaths) {
		const normalizedExcluded = excluded.toLowerCase().replace(/\//g, '\\');
		if (
			normalizedPath === normalizedExcluded ||
			normalizedPath.startsWith(normalizedExcluded + '\\')
		) {
			return true;
		}
	}
	return false;
}

/**
 * 获取所有排除路径
 */
export function getExcludedPaths(): string[] {
	return Array.from(excludedPaths);
}

/**
 * 清除所有排除路径
 */
export function clearExcludedPaths(): void {
	excludedPaths.clear();
	saveExcludedPaths();
	console.log('🗑️ 清除所有排除路径');
}

/**
 * 检查路径是否被排除（供 store 使用）
 */
export { excludedPaths };
