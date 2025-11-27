/**
 * 文件树缓存系统 - 简化版
 * 
 * 核心思想：
 * 1. 简单的路径 -> 子项列表映射
 * 2. 使用 Map 实现 O(1) 路径查找
 * 3. 子目录展开直接从缓存读取，无需后端调用
 */

import type { FsItem } from '$lib/types';

// 文件树缓存
class FileTreeCache {
	// 路径 -> 子项列表缓存
	private childrenCache = new Map<string, FsItem[]>();
	
	/**
	 * 规范化路径
	 */
	private normalizePath(path: string): string {
		return path.replace(/\\/g, '/').replace(/\/+$/, '');
	}
	
	/**
	 * 检查是否已加载某个目录
	 */
	isRootLoaded(path: string): boolean {
		return this.childrenCache.has(this.normalizePath(path));
	}
	
	/**
	 * 初始化/添加目录内容到缓存
	 */
	initTree(path: string, items: FsItem[]): void {
		const normalized = this.normalizePath(path);
		this.childrenCache.set(normalized, items);
	}
	
	/**
	 * 添加子目录内容到缓存
	 */
	addChildren(parentPath: string, children: FsItem[]): void {
		const normalized = this.normalizePath(parentPath);
		this.childrenCache.set(normalized, children);
	}
	
	/**
	 * 获取子目录内容（从缓存）
	 */
	getChildren(parentPath: string): FsItem[] | null {
		const normalized = this.normalizePath(parentPath);
		return this.childrenCache.get(normalized) || null;
	}
	
	/**
	 * 检查路径是否在缓存中
	 */
	hasPath(path: string): boolean {
		return this.childrenCache.has(this.normalizePath(path));
	}
	
	/**
	 * 清除特定目录的缓存
	 */
	clearTree(path: string): void {
		const normalized = this.normalizePath(path);
		// 删除该路径及其所有子路径
		for (const [cachedPath] of this.childrenCache) {
			if (cachedPath === normalized || cachedPath.startsWith(normalized + '/')) {
				this.childrenCache.delete(cachedPath);
			}
		}
	}
	
	/**
	 * 清除所有缓存
	 */
	clearAll(): void {
		this.childrenCache.clear();
	}
	
	/**
	 * 获取缓存统计
	 */
	getStats(): { cachedPaths: number } {
		return {
			cachedPaths: this.childrenCache.size
		};
	}
}

// 单例导出
export const fileTreeCache = new FileTreeCache();
