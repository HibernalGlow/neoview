/**
 * FolderStack 导航相关函数
 * 处理历史导航、父目录预加载等逻辑
 */

import {
	normalizePathForCompare,
	getParentPath,
	getParentPaths,
	PRELOAD_PARENT_COUNT,
	type FolderLayer
} from './folderStackUtils';

// 使用 normalizePathForCompare 作为 normalizePath
const normalizePath = normalizePathForCompare;

/**
 * 查找目标路径在 layers 中的父层索引
 * 如果目标路径是某个现有层的子目录，返回该层的索引
 */
export function findParentLayerIndex(layers: FolderLayer[], targetPath: string): number {
	const normalizedTarget = normalizePath(targetPath);

	// 从后往前遍历，找到最近的父层
	for (let i = layers.length - 1; i >= 0; i--) {
		const layerPath = normalizePath(layers[i].path);
		// 检查目标路径是否以该层路径开头（即该层是目标的父目录）
		if (normalizedTarget.startsWith(layerPath + '/')) {
			return i;
		}
	}

	return -1;
}

/**
 * 查找第一个子层索引
 * 如果某个 layer 的路径是目标路径的子目录，返回该层索引
 */
export function findChildLayerIndex(layers: FolderLayer[], targetPath: string): number {
	const normalizedTarget = normalizePath(targetPath);
	
	for (let i = 0; i < layers.length; i++) {
		const layerPath = normalizePath(layers[i].path);
		if (layerPath.startsWith(normalizedTarget + '/')) {
			return i;
		}
	}
	
	return -1;
}

/**
 * 查找目标路径在 layers 中的精确匹配索引
 */
export function findExactLayerIndex(layers: FolderLayer[], targetPath: string): number {
	return layers.findIndex(l => normalizePath(l.path) === normalizePath(targetPath));
}

/**
 * 获取需要预加载的父目录路径
 * 过滤掉已经存在于 layers 中的路径
 */
export function getPathsToPreload(layers: FolderLayer[], topLayerPath: string): string[] {
	const parentPath = getParentPath(topLayerPath);
	if (!parentPath) return []; // 已经是根目录

	// 检查父目录是否已经在 layers 中
	const normalizedParent = normalizePath(parentPath);
	const alreadyLoaded = layers.some(l => normalizePath(l.path) === normalizedParent);
	if (alreadyLoaded) return [];

	// 获取父目录路径列表
	const parentPaths = getParentPaths(topLayerPath, PRELOAD_PARENT_COUNT);

	// 过滤掉已经加载的路径
	return parentPaths.filter(p => !layers.some(l => normalizePath(l.path) === normalizePath(p)));
}

/**
 * 历史导航决策结果
 */
export type HistoryNavAction =
	| { type: 'switchToLayer'; layerIndex: number }
	| { type: 'appendToParent'; parentIndex: number; targetPath: string }
	| { type: 'insertBeforeChild'; childIndex: number; targetPath: string; parentPaths: string[] }
	| { type: 'reinitialize'; targetPath: string };

/**
 * 分析历史导航应该执行的操作
 * 不包含实际的层创建逻辑，只返回决策结果
 */
export function analyzeHistoryNavigation(layers: FolderLayer[], targetPath: string): HistoryNavAction {
	// 1. 在现有 layers 中查找目标路径（精确匹配）
	const targetIndex = findExactLayerIndex(layers, targetPath);
	if (targetIndex !== -1) {
		return { type: 'switchToLayer', layerIndex: targetIndex };
	}

	// 2. 检查目标路径是否是某个现有层的子目录
	const parentLayerIndex = findParentLayerIndex(layers, targetPath);
	if (parentLayerIndex !== -1) {
		return { type: 'appendToParent', parentIndex: parentLayerIndex, targetPath };
	}

	// 3. 检查是否有层是目标路径的子目录
	const childLayerIndex = findChildLayerIndex(layers, targetPath);
	if (childLayerIndex !== -1) {
		// 获取多层父目录路径
		const parentPaths = getParentPaths(targetPath, PRELOAD_PARENT_COUNT - 1);
		return { type: 'insertBeforeChild', childIndex: childLayerIndex, targetPath, parentPaths };
	}

	// 4. 目标路径与现有层完全无关，需要完全重建
	return { type: 'reinitialize', targetPath };
}
