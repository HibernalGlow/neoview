/**
 * DirectoryTreeCache - 目录树内存缓存
 * 全局单例，管理目录内容的内存缓存
 * 减少本地 I/O，提高浏览速度
 *
 * 参考 Spacedrive 架构，支持流式加载
 */

import type { FsItem } from '$lib/types';
import { FileSystemAPI } from '$lib/api';
import { streamDirectory, type StreamHandle, type StreamComplete } from '$lib/api/filesystem';

interface CacheEntry {
	items: FsItem[];
	timestamp: number;
	loading: boolean;
	accessCount: number; // 访问计数，用于智能淘汰
	isComplete: boolean; // 是否完整加载（用于流式加载）
	streamHandle?: StreamHandle; // 流句柄（用于取消）
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
	private readonly MAX_CACHE_SIZE = 500; // 最多缓存 500 个目录（从200提升）
	private readonly CACHE_TTL = 10 * 60 * 1000; // 10 分钟缓存有效期
	private readonly PRELOAD_DEPTH = 3; // 预加载深度（从2提升到3）

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
			if (cached && now - cached.timestamp < this.CACHE_TTL && !cached.loading) {
				// 增加访问计数
				cached.accessCount = (cached.accessCount || 0) + 1;
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
		this.cache.set(key, {
			items: [],
			timestamp: now,
			loading: true,
			accessCount: 0,
			isComplete: false
		});

		try {
			const items = await FileSystemAPI.browseDirectory(path);

			// 更新缓存，初始访问计数为1
			this.cache.set(key, {
				items,
				timestamp: Date.now(),
				loading: false,
				accessCount: 1,
				isComplete: true
			});
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
		return Date.now() - cached.timestamp < this.CACHE_TTL;
	}

	/**
	 * 获取缓存（不触发加载）
	 */
	getCached(path: string): FsItem[] | null {
		const key = this.normalizePath(path);
		const cached = this.cache.get(key);
		if (!cached || cached.loading) return null;
		if (Date.now() - cached.timestamp >= this.CACHE_TTL) return null;
		return cached.items;
	}

	/**
	 * 预加载子目录
	 */
	private async preloadChildren(parentPath: string, items: FsItem[], depth = 1) {
		if (depth > this.PRELOAD_DEPTH) return;

		// 只预加载前 5 个子目录
		const directories = items.filter((item) => item.isDir).slice(0, 5);

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
		const toLoad = paths.filter((p) => !this.hasValidCache(p));
		await Promise.all(toLoad.map((p) => this.getDirectory(p).catch(() => {})));
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
			cached.items = cached.items.filter(
				(item) => this.normalizePath(item.path) !== this.normalizePath(itemPath)
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
			if (!entry.loading && now - entry.timestamp > this.CACHE_TTL) {
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
	 * 后台预热子树（递归预加载多层子目录）
	 * @param rootPath 根路径
	 * @param maxDepth 最大深度，默认3层
	 * @param onProgress 进度回调
	 */
	async warmupSubtree(
		rootPath: string,
		maxDepth = 3,
		onProgress?: (loaded: number, total: number) => void
	): Promise<void> {
		const queue: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: 0 }];
		const visited = new Set<string>();
		let loaded = 0;
		let total = 1;

		console.log(`🔥 开始预热子树: ${rootPath} (深度: ${maxDepth})`);

		while (queue.length > 0) {
			const { path, depth } = queue.shift()!;
			const key = this.normalizePath(path);

			// 避免重复访问
			if (visited.has(key) || depth >= maxDepth) continue;
			visited.add(key);

			try {
				// 静默加载（如果已缓存则跳过）
				const items = await this.getDirectory(path).catch(() => [] as FsItem[]);
				loaded++;
				onProgress?.(loaded, total);

				// 收集子目录
				const dirs = items.filter((i) => i.isDir);

				// 限制每层最多预热20个子目录，避免爆炸
				const subDirs = dirs.slice(0, 20);
				subDirs.forEach((dir) => {
					queue.push({ path: dir.path, depth: depth + 1 });
				});

				total += subDirs.length;

				// 避免阻塞UI，每处理一项暂停10ms
				await new Promise((r) => setTimeout(r, 10));
			} catch (error) {
				console.debug(`预热失败: ${path}`, error);
			}
		}

		console.log(`✅ 子树预热完成: ${rootPath} (已加载 ${loaded}/${total})`);
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

	// ============================================================================
	// 流式加载支持（Spacedrive 风格）
	// ============================================================================

	/**
	 * 流式加载目录（边扫描边返回）
	 * 适用于大型目录，首批数据 100ms 内显示
	 *
	 * @param path 目录路径
	 * @param onBatch 每批数据的回调
	 * @param options 流配置选项
	 * @returns Promise<StreamComplete> 完成信息
	 */
	async getDirectoryStreaming(
		path: string,
		onBatch?: (items: FsItem[], batchIndex: number, total: number) => void,
		options?: { batchSize?: number; skipHidden?: boolean }
	): Promise<StreamComplete> {
		const key = this.normalizePath(path);
		const now = Date.now();

		// 检查缓存
		const cached = this.cache.get(key);
		if (cached && cached.isComplete && !cached.loading && now - cached.timestamp < this.CACHE_TTL) {
			// 缓存命中，模拟流式返回
			cached.accessCount = (cached.accessCount || 0) + 1;
			onBatch?.(cached.items, 0, cached.items.length);
			return {
				totalItems: cached.items.length,
				skippedItems: 0,
				elapsedMs: 0,
				fromCache: true
			};
		}

		// 取消之前的流（如果有）
		if (cached?.streamHandle) {
			await cached.streamHandle.cancel().catch(() => {});
		}

		// 初始化缓存条目
		this.loadingPaths.add(key);
		const entry: CacheEntry = {
			items: [],
			timestamp: now,
			loading: true,
			accessCount: 1,
			isComplete: false
		};
		this.cache.set(key, entry);

		return new Promise((resolve, reject) => {
			let totalLoaded = 0;

			streamDirectory(
				path,
				{
					onBatch: (batch) => {
						// 追加到缓存
						const cached = this.cache.get(key);
						if (cached) {
							cached.items.push(...batch.items);
							totalLoaded = cached.items.length;
						}
						// 通知调用者
						onBatch?.(batch.items, batch.batchIndex, totalLoaded);
						// 触发更新回调
						this.notifyUpdate(path, cached?.items || batch.items);
					},
					onProgress: (progress) => {
						// 可以在这里更新进度 UI
						console.debug(`📁 流式加载进度: ${progress.loaded} 项, ${progress.elapsedMs}ms`);
					},
					onError: (error) => {
						console.warn(`⚠️ 流式加载错误: ${error.message}`);
					},
					onComplete: (complete) => {
						// 标记完成
						const cached = this.cache.get(key);
						if (cached) {
							cached.loading = false;
							cached.isComplete = true;
							cached.timestamp = Date.now();
							delete cached.streamHandle;
						}
						this.loadingPaths.delete(key);
						this.cleanup();
						resolve(complete);
					}
				},
				{
					batchSize: options?.batchSize,
					skipHidden: options?.skipHidden
				}
			)
				.then((handle) => {
					// 保存流句柄以便取消
					const cached = this.cache.get(key);
					if (cached) {
						cached.streamHandle = handle;
					}
				})
				.catch((err) => {
					this.loadingPaths.delete(key);
					this.cache.delete(key);
					reject(err);
				});
		});
	}

	/**
	 * 取消指定路径的流式加载
	 */
	async cancelStream(path: string): Promise<void> {
		const key = this.normalizePath(path);
		const cached = this.cache.get(key);
		if (cached?.streamHandle) {
			await cached.streamHandle.cancel().catch(() => {});
			delete cached.streamHandle;
			cached.loading = false;
		}
		this.loadingPaths.delete(key);
	}

	/**
	 * 检查是否正在流式加载
	 */
	isStreaming(path: string): boolean {
		const key = this.normalizePath(path);
		const cached = this.cache.get(key);
		return cached?.loading === true && cached?.streamHandle !== undefined;
	}
}

// 导出单例
export const directoryTreeCache = new DirectoryTreeCache();
