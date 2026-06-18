/**
 * NavigationHistory - 文件浏览导航历史管理
 * 支持前进、后退、主页功能和目录缓存
 */

import type { FsItem } from '$lib/types';
import { FileSystemAPI } from '$lib/api';

interface DirectoryCache {
	path: string;
	items: FsItem[];
	thumbnails: Map<string, string>;
	timestamp: number;
	mtime?: number; // 目录修改时间，用于验证缓存是否过期
}

export class NavigationHistory {
	private history: string[] = [];
	private currentIndex: number = -1;
	private homepage: string = '';
	private maxHistorySize: number = 50;
	private cache = new Map<string, DirectoryCache>();
	private maxCacheSize: number = 20;
	private cacheTimeout: number = 5 * 60 * 1000; // 5分钟缓存超时
	// 记录每个父目录最近一次进入的子目录路径，用于返回上一级时可选地高亮/定位
	private lastActiveChild: Map<string, string> = new Map();

	constructor(homepage: string = '') {
		this.homepage = homepage;
	}

	/**
	 * 设置主页路径
	 */
	setHomepage(path: string) {
		this.homepage = path;
	}

	/**
	 * 获取主页路径
	 */
	getHomepage(): string {
		return this.homepage;
	}

	/**
	 * 记录从某个父目录进入的最后一个子目录
	 */
	setLastActiveChild(parentPath: string | null | undefined, childPath: string | null | undefined) {
		if (!parentPath || !childPath) return;
		this.lastActiveChild.set(parentPath, childPath);
	}

	/**
	 * 获取某个父目录最近一次进入的子目录路径
	 */
	getLastActiveChild(parentPath: string | null | undefined): string | null {
		if (!parentPath) return null;
		return this.lastActiveChild.get(parentPath) ?? null;
	}

	/**
	 * 添加新路径到历史记录
	 */
	push(path: string) {
		// 如果当前不在历史记录末尾，删除后面的记录
		if (this.currentIndex < this.history.length - 1) {
			this.history = this.history.slice(0, this.currentIndex + 1);
		}

		// 如果新路径与当前路径相同，不添加
		if (this.history[this.currentIndex] === path) {
			return;
		}

		this.history.push(path);
		this.currentIndex = this.history.length - 1;

		// 限制历史记录大小
		if (this.history.length > this.maxHistorySize) {
			this.history = this.history.slice(-this.maxHistorySize);
			this.currentIndex = this.history.length - 1;
		}
	}

	/**
	 * 后退
	 */
	back(): string | null {
		if (this.canGoBack()) {
			this.currentIndex--;
			return this.history[this.currentIndex];
		}
		return null;
	}

	/**
	 * 前进
	 */
	forward(): string | null {
		if (this.canGoForward()) {
			this.currentIndex++;
			return this.history[this.currentIndex];
		}
		return null;
	}

	/**
	 * 能否后退
	 */
	canGoBack(): boolean {
		return this.currentIndex > 0;
	}

	/**
	 * 能否前进
	 */
	canGoForward(): boolean {
		return this.currentIndex < this.history.length - 1;
	}

	/**
	 * 获取当前路径
	 */
	getCurrentPath(): string | null {
		return this.history[this.currentIndex] || null;
	}

	/**
	 * 清空历史记录
	 */
	clear() {
		this.history = [];
		this.currentIndex = -1;
	}

	/**
	 * 获取所有历史记录
	 */
	getHistory(): string[] {
		return [...this.history];
	}

	/**
	 * 缓存目录数据
	 */
	cacheDirectory(path: string, items: FsItem[], thumbnails: Map<string, string>, mtime?: number) {
		// 限制缓存大小
		if (this.cache.size >= this.maxCacheSize) {
			// 删除最旧的缓存项
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey) {
				this.cache.delete(oldestKey);
			}
		}

		this.cache.set(path, {
			path,
			items: [...items], // 深拷贝避免引用问题
			thumbnails: new Map(thumbnails),
			timestamp: Date.now(),
			mtime
		});

		console.log(`📁 缓存目录: ${path}, 项目数: ${items.length}, 缩略图数: ${thumbnails.size}`);
	}

	/**
	 * 更新目录缓存中的单个缩略图
	 */
	updateCachedThumbnail(path: string, key: string, dataUrl: string) {
		const cached = this.cache.get(path);
		if (!cached) return;
		cached.thumbnails.set(key, dataUrl);
		cached.timestamp = Date.now();
	}

	/**
	 * 获取缓存的目录数据
	 */
	getCachedDirectory(path: string): DirectoryCache | null {
		const cached = this.cache.get(path);
		if (!cached) return null;

		// 检查缓存是否过期
		if (Date.now() - cached.timestamp > this.cacheTimeout) {
			console.log(`⏰ 缓存过期: ${path}`);
			this.cache.delete(path);
			return null;
		}

		console.log(
			`📋 使用缓存: ${path}, 项目数: ${cached.items.length}, 缩略图数: ${cached.thumbnails.size}`
		);
		return {
			...cached,
			items: [...cached.items], // 返回深拷贝
			thumbnails: new Map(cached.thumbnails)
		};
	}

	/**
	 * 验证缓存是否仍然有效
	 */
	async validateCache(path: string): Promise<boolean> {
		const cached = this.cache.get(path);
		if (!cached) return false;

		try {
			// 检查目录是否存在
			const exists = await FileSystemAPI.pathExists(path);
			if (!exists) {
				this.cache.delete(path);
				return false;
			}

			// 如果有mtime，检查目录是否被修改
			if (cached.mtime) {
				const currentMtime = await this.getDirectoryMtime(path);
				if (currentMtime !== cached.mtime) {
					console.log(`📝 目录已修改: ${path}`);
					this.cache.delete(path);
					return false;
				}
			}

			return true;
		} catch (error) {
			console.error(`❌ 验证缓存失败: ${path}`, error);
			this.cache.delete(path);
			return false;
		}
	}

	/**
	 * 获取目录修改时间
	 */
	private async getDirectoryMtime(path: string): Promise<number | undefined> {
		try {
			const fileInfo = await FileSystemAPI.getFileMetadata(path);
			return fileInfo.modified ? new Date(fileInfo.modified).getTime() : undefined;
		} catch {
			return undefined;
		}
	}

	/**
	 * 清除指定路径的缓存
	 */
	clearCache(path?: string) {
		if (path) {
			this.cache.delete(path);
			console.log(`🗑️ 清除缓存: ${path}`);
		} else {
			this.cache.clear();
			console.log(`🗑️ 清除所有缓存`);
		}
	}

	/**
	 * 清理过期缓存
	 */
	cleanupExpiredCache() {
		const now = Date.now();
		const expiredKeys: string[] = [];

		for (const [key, cache] of this.cache.entries()) {
			if (now - cache.timestamp > this.cacheTimeout) {
				expiredKeys.push(key);
			}
		}

		expiredKeys.forEach((key) => {
			this.cache.delete(key);
			console.log(`🧹 清理过期缓存: ${key}`);
		});

		return expiredKeys.length;
	}

	/**
	 * 获取缓存统计信息
	 */
	getCacheStats() {
		const stats = {
			size: this.cache.size,
			maxSize: this.maxCacheSize,
			entries: [] as Array<{
				path: string;
				itemCount: number;
				thumbnailCount: number;
				age: number;
			}>
		};

		for (const [path, cache] of this.cache.entries()) {
			stats.entries.push({
				path,
				itemCount: cache.items.length,
				thumbnailCount: cache.thumbnails.size,
				age: Date.now() - cache.timestamp
			});
		}

		return stats;
	}

	/**
	 * 预缓存相邻目录（可选的性能优化）
	 */
	async prefetchAdjacentPaths(currentPath: string): Promise<void> {
		// 获取父目录和子目录路径
		const parentPath = this.getParentPath(currentPath);
		const adjacentPaths = [parentPath];

		// 异步预加载，但不等待结果
		adjacentPaths.forEach(async (path) => {
			if (path && !this.cache.has(path)) {
				try {
					console.log(`🚀 预加载目录: ${path}`);
					const items = await FileSystemAPI.browseDirectory(path);
					this.cacheDirectory(path, items, new Map());
				} catch (error) {
					console.debug(`预加载失败: ${path}`, error);
				}
			}
		});
	}

	/**
	 * 获取父目录路径
	 */
	private getParentPath(path: string): string | null {
		const normalized = path.replace(/\\/g, '/');
		const lastSlash = normalized.lastIndexOf('/');
		return lastSlash > 0 ? normalized.substring(0, lastSlash) : null;
	}
}
