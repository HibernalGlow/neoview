/**
 * DirectoryTreeCache - 目录树内存缓存
 * 全局单例，管理目录内容的内存缓存
 * 减少本地 I/O，提高浏览速度
 */

import type { FsItem } from '$lib/types';
import { FileSystemAPI } from '$lib/api';

interface CacheEntry {
	items: FsItem[];
	timestamp: number;
	loading: boolean;
}

interface TreeNode {
	path: string;
	items: FsItem[];
	children: Map<string, TreeNode>;
	timestamp: number;
}

class DirectoryTreeCache {
	// 扁平缓存（快速查找）
	private cache = new Map<string, CacheEntry>();
	
	// 树形结构（用于层级关系）
	private root: TreeNode | null = null;
	
	// 配置
	private readonly MAX_CACHE_SIZE = 200; // 最多缓存 200 个目录
	private readonly CACHE_TTL = 10 * 60 * 1000; // 10 分钟缓存有效期
	private readonly PRELOAD_DEPTH = 2; // 预加载深度
	
	// 正在加载的路径
	private loadingPaths = new Set<string>();
	
	// 更新回调
	private onUpdateCallbacks: ((path: string, items: FsItem[]) => void)[] = [];
	
	/**
	 * 规范化路径
	 */
	private normalizePath(path: string): string {
		return path.replace(/\\/g, '/').toLowerCase();
	}
	
	/**
	 * 获取目录内容（优先从缓存）
	 */
	async getDirectory(path: string, forceRefresh = false): Promise<FsItem[]> {
		const key = this.normalizePath(path);
		const now = Date.now();
		
		// 检查缓存
		if (!forceRefresh) {
			const cached = this.cache.get(key);
			if (cached && (now - cached.timestamp < this.CACHE_TTL) && !cached.loading) {
				return cached.items;
			}
		}
		
		// 检查是否正在加载
		if (this.loadingPaths.has(key)) {
			// 等待加载完成
			return new Promise((resolve) => {
				const checkInterval = setInterval(() => {
					const cached = this.cache.get(key);
					if (cached && !cached.loading) {
						clearInterval(checkInterval);
						resolve(cached.items);
					}
				}, 50);
				// 超时保护
				setTimeout(() => {
					clearInterval(checkInterval);
					resolve([]);
				}, 5000);
			});
		}
		
		// 开始加载
		this.loadingPaths.add(key);
		this.cache.set(key, { items: [], timestamp: now, loading: true });
		
		try {
			const items = await FileSystemAPI.browseDirectory(path);
			
			// 更新缓存
			this.cache.set(key, { items, timestamp: Date.now(), loading: false });
			this.loadingPaths.delete(key);
			
			// 清理过期缓存
			this.cleanup();
			
			// 触发更新回调
			this.notifyUpdate(path, items);
			
			// 后台预加载子目录
			this.preloadChildren(path, items);
			
			return items;
		} catch (err) {
			this.loadingPaths.delete(key);
			this.cache.delete(key);
			throw err;
		}
	}
	
	/**
	 * 检查缓存是否存在且有效
	 */
	hasValidCache(path: string): boolean {
		const key = this.normalizePath(path);
		const cached = this.cache.get(key);
		if (!cached || cached.loading) return false;
		return (Date.now() - cached.timestamp) < this.CACHE_TTL;
	}
	
	/**
	 * 获取缓存（不触发加载）
	 */
	getCached(path: string): FsItem[] | null {
		const key = this.normalizePath(path);
		const cached = this.cache.get(key);
		if (!cached || cached.loading) return null;
		if ((Date.now() - cached.timestamp) >= this.CACHE_TTL) return null;
		return cached.items;
	}
	
	/**
	 * 预加载子目录
	 */
	private async preloadChildren(parentPath: string, items: FsItem[], depth = 1) {
		if (depth > this.PRELOAD_DEPTH) return;
		
		// 只预加载前 5 个子目录
		const directories = items.filter(item => item.isDir).slice(0, 5);
		
		for (const dir of directories) {
			const key = this.normalizePath(dir.path);
			
			// 跳过已缓存的
			if (this.hasValidCache(dir.path)) continue;
			
			// 跳过正在加载的
			if (this.loadingPaths.has(key)) continue;
			
			// 静默加载
			this.getDirectory(dir.path).catch(() => {
				// 忽略预加载错误
			});
		}
	}
	
	/**
	 * 预加载指定路径
	 */
	async preload(path: string): Promise<void> {
		if (this.hasValidCache(path)) return;
		await this.getDirectory(path).catch(() => {});
	}
	
	/**
	 * 批量预加载
	 */
	async preloadBatch(paths: string[]): Promise<void> {
		const toLoad = paths.filter(p => !this.hasValidCache(p));
		await Promise.all(toLoad.map(p => this.getDirectory(p).catch(() => {})));
	}
	
	/**
	 * 使缓存失效
	 */
	invalidate(path: string) {
		const key = this.normalizePath(path);
		this.cache.delete(key);
	}
	
	/**
	 * 从父目录缓存中移除指定项目
	 * 删除文件后调用，异步同步内存树
	 */
	removeItemFromCache(itemPath: string): void {
		// 获取父目录路径
		const normalizedPath = itemPath.replace(/\\/g, '/');
		const lastSlash = normalizedPath.lastIndexOf('/');
		if (lastSlash < 0) return;
		
		const parentPath = normalizedPath.slice(0, lastSlash);
		const parentKey = this.normalizePath(parentPath);
		
		const cached = this.cache.get(parentKey);
		if (cached && !cached.loading) {
			// 从缓存中过滤掉已删除的项目
			cached.items = cached.items.filter(item => 
				this.normalizePath(item.path) !== this.normalizePath(itemPath)
			);
			// 触发更新通知
			this.notifyUpdate(parentPath, cached.items);
		}
	}
	
	/**
	 * 批量从缓存中移除项目
	 */
	removeItemsFromCache(itemPaths: string[]): void {
		for (const path of itemPaths) {
			this.removeItemFromCache(path);
		}
	}
	
	/**
	 * 使目录及其子目录缓存失效
	 */
	invalidateTree(path: string) {
		const key = this.normalizePath(path);
		for (const [cachedKey] of this.cache) {
			if (cachedKey.startsWith(key)) {
				this.cache.delete(cachedKey);
			}
		}
	}
	
	/**
	 * 清理过期缓存
	 */
	private cleanup() {
		const now = Date.now();
		
		// 删除过期条目
		for (const [key, entry] of this.cache) {
			if (!entry.loading && (now - entry.timestamp > this.CACHE_TTL)) {
				this.cache.delete(key);
			}
		}
		
		// 如果缓存超过限制，删除最旧的
		if (this.cache.size > this.MAX_CACHE_SIZE) {
			const entries = Array.from(this.cache.entries())
				.filter(([, e]) => !e.loading)
				.sort((a, b) => a[1].timestamp - b[1].timestamp);
			
			const toDelete = entries.slice(0, entries.length - this.MAX_CACHE_SIZE);
			for (const [key] of toDelete) {
				this.cache.delete(key);
			}
		}
	}
	
	/**
	 * 清空所有缓存
	 */
	clear() {
		this.cache.clear();
		this.loadingPaths.clear();
		this.root = null;
	}
	
	/**
	 * 注册更新回调
	 */
	onUpdate(callback: (path: string, items: FsItem[]) => void) {
		this.onUpdateCallbacks.push(callback);
		return () => {
			const index = this.onUpdateCallbacks.indexOf(callback);
			if (index >= 0) {
				this.onUpdateCallbacks.splice(index, 1);
			}
		};
	}
	
	/**
	 * 触发更新通知
	 */
	private notifyUpdate(path: string, items: FsItem[]) {
		for (const callback of this.onUpdateCallbacks) {
			try {
				callback(path, items);
			} catch {
				// 忽略回调错误
			}
		}
	}
	
	/**
	 * 获取缓存统计
	 */
	getStats() {
		return {
			size: this.cache.size,
			loading: this.loadingPaths.size,
			maxSize: this.MAX_CACHE_SIZE,
			ttl: this.CACHE_TTL
		};
	}
}

// 导出单例
export const directoryTreeCache = new DirectoryTreeCache();
