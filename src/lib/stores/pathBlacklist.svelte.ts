/**
 * 路径黑名单存储
 * 用于自动记录访问失败的路径（如系统保护文件夹），避免重复请求
 * 同时支持用户手动配置的排除路径
 */

import { settingsManager } from '$lib/settings/settingsManager';

// 运行时自动黑名单（访问失败的路径，不持久化）
const runtimeBlacklist = new Set<string>();

// 常见的 Windows 系统保护文件夹（预设黑名单）
const SYSTEM_PROTECTED_FOLDERS = [
	'System Volume Information',
	'$Recycle.Bin',
	'$RECYCLE.BIN',
	'Recovery',
	'Config.Msi',
	'MSOCache',
	'PerfLogs',
	'Documents and Settings'
];

/**
 * 规范化路径用于比较
 */
function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').toLowerCase();
}

/**
 * 检查路径是否在黑名单中
 * @param path 要检查的路径
 * @returns 是否被黑名单
 */
export function isPathBlacklisted(path: string): boolean {
	const normalizedPath = normalizePath(path);

	// 检查运行时黑名单
	if (runtimeBlacklist.has(normalizedPath)) {
		return true;
	}

	// 检查用户配置的排除路径
	const settings = settingsManager.getSettings();
	const excludedPaths = settings.system.excludedPaths ?? [];
	for (const excluded of excludedPaths) {
		const normalizedExcluded = normalizePath(excluded);
		if (normalizedPath === normalizedExcluded || normalizedPath.startsWith(normalizedExcluded + '/')) {
			return true;
		}
	}

	// 检查系统保护文件夹（路径中包含这些文件夹名）
	const pathParts = normalizedPath.split('/');
	for (const part of pathParts) {
		if (SYSTEM_PROTECTED_FOLDERS.some(folder => part.toLowerCase() === folder.toLowerCase())) {
			return true;
		}
	}

	return false;
}

/**
 * 将路径添加到运行时黑名单
 * @param path 访问失败的路径
 */
export function addToRuntimeBlacklist(path: string): void {
	const normalizedPath = normalizePath(path);
	runtimeBlacklist.add(normalizedPath);
	console.debug('[PathBlacklist] 已添加到运行时黑名单:', path);
}

/**
 * 从运行时黑名单移除路径
 * @param path 要移除的路径
 */
export function removeFromRuntimeBlacklist(path: string): void {
	const normalizedPath = normalizePath(path);
	runtimeBlacklist.delete(normalizedPath);
}

/**
 * 清空运行时黑名单
 */
export function clearRuntimeBlacklist(): void {
	runtimeBlacklist.clear();
	console.debug('[PathBlacklist] 运行时黑名单已清空');
}

/**
 * 获取运行时黑名单列表（用于调试）
 */
export function getRuntimeBlacklist(): string[] {
	return Array.from(runtimeBlacklist);
}

/**
 * 获取用户配置的排除路径
 */
export function getExcludedPaths(): string[] {
	const settings = settingsManager.getSettings();
	return settings.system.excludedPaths ?? [];
}

/**
 * 添加用户配置的排除路径
 * @param path 要排除的路径
 */
export function addExcludedPath(path: string): void {
	const settings = settingsManager.getSettings();
	const excludedPaths = settings.system.excludedPaths ?? [];
	const normalizedPath = normalizePath(path);
	
	// 避免重复添加
	if (!excludedPaths.some(p => normalizePath(p) === normalizedPath)) {
		settingsManager.updateNestedSettings('system', {
			excludedPaths: [...excludedPaths, path]
		});
	}
}

/**
 * 移除用户配置的排除路径
 * @param path 要移除的路径
 */
export function removeExcludedPath(path: string): void {
	const settings = settingsManager.getSettings();
	const excludedPaths = settings.system.excludedPaths ?? [];
	const normalizedPath = normalizePath(path);
	
	settingsManager.updateNestedSettings('system', {
		excludedPaths: excludedPaths.filter(p => normalizePath(p) !== normalizedPath)
	});
}

/**
 * 获取预设的系统保护文件夹列表
 */
export function getSystemProtectedFolders(): string[] {
	return [...SYSTEM_PROTECTED_FOLDERS];
}
