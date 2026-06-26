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

interface DirectoryLoadOptions {
	forceRefresh?: boolean;
	preloadChildren?: boolean;
	childPreloadDepth?: number;
}

interface BackgroundPreloadTask {
	path: string;
	depth: number;
	priority: number;
	queuedAt: number;
}

type StreamingNotifyMode = 'batch' | 'final' | 'none';

interface DirectoryStreamingOptions {
	batchSize?: number;
	skipHidden?: boolean;
	notifyMode?: StreamingNotifyMode;
	lane?: 'active' | 'background';
}

const DIRECTORY_TREE_DEBUG = false;

function debugDirectoryTree(getMessage: () => string, ...details: unknown[]): void {
	if (DIRECTORY_TREE_DEBUG) {
		console.debug(getMessage(), ...details);
	}
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
	private readonly CHILD_PRELOAD_LIMIT = 3;
	private readonly BACKGROUND_PRELOAD_CONCURRENCY = 2;
	private readonly MAX_BACKGROUND_PRELOAD_QUEUE = 64;

	// 正在加载的路径
	private loadingPaths = new Set<string>();
	private inflightLoads = new Map<string, Promise<FsItem[]>>();
	private streamingLoads = new Map<string, Promise<StreamComplete>>();
	private backgroundPreloadQueue: BackgroundPreloadTask[] = [];
	private backgroundPreloadKeys = new Set<string>();
	private activeBackgroundPreloads = 0;
	private activePathKeys = new Set<string>();
	private activePathPriorities = new Map<string, number>();
	private activePathScopes = new Map<string, { keys: Set<string>; priority: number }>();

	// 更新回调
	private onUpdateCallbacks: ((path: string, items: FsItem[]) => void)[] = [];

	/**
	 * 规范化路径
	 */
	private normalizePath(path: string): string {
		return path.replace(/\\/g, '/').toLowerCase();
	}

	private getPathSegmentDistance(fromKey: string, toKey: string): number {
		const fromSegments = fromKey.split('/').filter(Boolean);
		const toSegments = toKey.split('/').filter(Boolean);
		return Math.max(0, toSegments.length - fromSegments.length);
	}

	private getParentKey(key: string): string {
		const lastSlash = key.lastIndexOf('/');
		return lastSlash > 0 ? key.slice(0, lastSlash) : '';
	}

	private getActivePathPriority(path: string, depth = 0): number {
		if (this.activePathKeys.size === 0) return depth;

		const key = this.normalizePath(path);
		let best = Number.POSITIVE_INFINITY;
		for (const activeKey of this.activePathKeys) {
			if (!activeKey) continue;
			const basePriority = this.activePathPriorities.get(activeKey) ?? 0;
			if (key === activeKey) {
				best = Math.min(best, basePriority + depth);
				continue;
			}
			if (key.startsWith(`${activeKey}/`)) {
				best = Math.min(
					best,
					basePriority + 10 + depth + this.getPathSegmentDistance(activeKey, key)
				);
				continue;
			}
			if (activeKey.startsWith(`${key}/`)) {
				best = Math.min(
					best,
					basePriority + 20 + depth + this.getPathSegmentDistance(key, activeKey)
				);
				continue;
			}
			if (this.getParentKey(key) && this.getParentKey(key) === this.getParentKey(activeKey)) {
				best = Math.min(best, basePriority + 40 + depth);
			}
		}

		return Number.isFinite(best) ? best : 1000 + depth;
	}

	private isRelatedToActivePath(path: string): boolean {
		return this.activePathKeys.size === 0 || this.getActivePathPriority(path) < 1000;
	}

	private sortBackgroundPreloadQueue(): void {
		this.backgroundPreloadQueue.sort(
			(a, b) => a.priority - b.priority || a.depth - b.depth || a.queuedAt - b.queuedAt
		);
	}

	private refreshBackgroundPreloadPriorities(): void {
		for (const task of this.backgroundPreloadQueue) {
			task.priority = this.getActivePathPriority(task.path, task.depth);
		}
		this.sortBackgroundPreloadQueue();
	}

	private trimBackgroundPreloadQueue(): void {
		this.refreshBackgroundPreloadPriorities();
		if (this.activePathKeys.size > 0) {
			const kept = this.backgroundPreloadQueue.filter((task) => task.priority < 1000);
			if (kept.length !== this.backgroundPreloadQueue.length) {
				this.backgroundPreloadQueue = kept;
				this.backgroundPreloadKeys.clear();
				for (const task of kept) {
					this.backgroundPreloadKeys.add(this.normalizePath(task.path));
				}
			}
		}

		while (this.backgroundPreloadQueue.length > this.MAX_BACKGROUND_PRELOAD_QUEUE) {
			const removed = this.backgroundPreloadQueue.pop();
			if (removed) {
				this.backgroundPreloadKeys.delete(this.normalizePath(removed.path));
			}
		}
	}

	private rebuildActivePathKeys(): void {
		const nextKeys = new Set<string>();
		const nextPriorities = new Map<string, number>();
		for (const scope of this.activePathScopes.values()) {
			for (const key of scope.keys) {
				nextKeys.add(key);
				const current = nextPriorities.get(key);
				if (current === undefined || scope.priority < current) {
					nextPriorities.set(key, scope.priority);
				}
			}
		}
		this.activePathKeys = nextKeys;
		this.activePathPriorities = nextPriorities;
	}

	setActivePaths(paths: string[]): void {
		this.setActiveScope('default', paths, 0);
	}

	setActiveScope(scopeId: string, paths: string[], priority = 0): void {
		const nextKeys = new Set(
			paths
				.filter((path) => path && !path.startsWith('virtual://'))
				.map((path) => this.normalizePath(path))
		);
		const previous = this.activePathScopes.get(scopeId);
		let changed =
			!previous || previous.priority !== priority || nextKeys.size !== previous.keys.size;
		if (!changed) {
			for (const key of nextKeys) {
				if (!previous?.keys.has(key)) {
					changed = true;
					break;
				}
			}
		}
		if (!changed) return;

		if (nextKeys.size === 0) {
			this.activePathScopes.delete(scopeId);
		} else {
			this.activePathScopes.set(scopeId, {
				keys: nextKeys,
				priority
			});
		}
		this.rebuildActivePathKeys();
		this.trimBackgroundPreloadQueue();
		this.pumpBackgroundPreloadQueue();
	}

	clearActiveScope(scopeId: string): void {
		if (!this.activePathScopes.delete(scopeId)) return;
		this.rebuildActivePathKeys();
		this.trimBackgroundPreloadQueue();
		this.pumpBackgroundPreloadQueue();
	}

	isActivePath(path: string): boolean {
		if (!path || path.startsWith('virtual://')) return false;
		if (this.activePathKeys.size === 0) return true;
		const key = this.normalizePath(path);
		return this.activePathKeys.has(key) && (this.activePathPriorities.get(key) ?? 0) < 100;
	}

	private waitForLoadingCache(key: string): Promise<FsItem[]> {
		return new Promise((resolve) => {
			const startedAt = Date.now();
			const checkInterval = setInterval(() => {
				const cached = this.cache.get(key);
				if (cached && !cached.loading) {
					clearInterval(checkInterval);
					resolve(cached.items);
					return;
				}

				if (!cached || Date.now() - startedAt > 5000) {
					clearInterval(checkInterval);
					resolve(cached?.items ?? []);
				}
			}, 50);
		});
	}

	private normalizeLoadOptions(
		options: boolean | DirectoryLoadOptions
	): Required<DirectoryLoadOptions> {
		if (typeof options === 'boolean') {
			return {
				forceRefresh: options,
				preloadChildren: true,
				childPreloadDepth: 0
			};
		}

		return {
			forceRefresh: options.forceRefresh ?? false,
			preloadChildren: options.preloadChildren ?? true,
			childPreloadDepth: options.childPreloadDepth ?? 0
		};
	}

	/**
	 * 获取目录内容（优先从缓存）
	 */
	async getDirectory(
		path: string,
		options: boolean | DirectoryLoadOptions = false
	): Promise<FsItem[]> {
		const loadOptions = this.normalizeLoadOptions(options);
		const key = this.normalizePath(path);
		const now = Date.now();

		// 检查缓存
		if (!loadOptions.forceRefresh) {
			const cached = this.cache.get(key);
			if (cached && now - cached.timestamp < this.CACHE_TTL && !cached.loading) {
				// 增加访问计数
				cached.accessCount = (cached.accessCount || 0) + 1;
				return cached.items;
			}
		}

		const inflight = this.inflightLoads.get(key);
		if (inflight) {
			return inflight;
		}

		if (this.loadingPaths.has(key)) {
			return this.waitForLoadingCache(key);
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

		const loadPromise = FileSystemAPI.browseDirectory(path)
			.then((items) => {
				// 更新缓存，初始访问计数为1
				this.cache.set(key, {
					items,
					timestamp: Date.now(),
					loading: false,
					accessCount: 1,
					isComplete: true
				});

				// 清理过期缓存
				this.cleanup();

				// 触发更新回调
				this.notifyUpdate(path, items);

				// 后台预加载子目录
				if (loadOptions.preloadChildren && loadOptions.childPreloadDepth < this.PRELOAD_DEPTH) {
					this.preloadChildren(path, items, loadOptions.childPreloadDepth + 1);
				}

				return items;
			})
			.catch((err) => {
				this.cache.delete(key);
				throw err;
			})
			.finally(() => {
				this.loadingPaths.delete(key);
				this.inflightLoads.delete(key);
			});

		this.inflightLoads.set(key, loadPromise);
		return loadPromise;
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
	private preloadChildren(parentPath: string, items: FsItem[], depth = 1) {
		if (depth > this.PRELOAD_DEPTH) return;
		if (!this.isRelatedToActivePath(parentPath)) return;

		// 只预加载前几个子目录，避免大目录/多页签切换时 I/O 放大
		const directories = items.filter((item) => item.isDir).slice(0, this.CHILD_PRELOAD_LIMIT);

		for (const dir of directories) {
			const key = this.normalizePath(dir.path);
			const priority = this.getActivePathPriority(dir.path, depth);
			if (this.activePathKeys.size > 0 && priority >= 1000) continue;

			// 跳过已缓存的
			if (this.hasValidCache(dir.path)) continue;

			// 跳过正在加载的
			if (this.loadingPaths.has(key)) continue;
			if (this.backgroundPreloadKeys.has(key)) continue;

			if (this.backgroundPreloadQueue.length >= this.MAX_BACKGROUND_PRELOAD_QUEUE) {
				this.trimBackgroundPreloadQueue();
				const worst = this.backgroundPreloadQueue.at(-1);
				if (!worst || worst.priority <= priority) {
					break;
				}
				this.backgroundPreloadQueue.pop();
				this.backgroundPreloadKeys.delete(this.normalizePath(worst.path));
			}

			this.backgroundPreloadQueue.push({
				path: dir.path,
				depth,
				priority,
				queuedAt: Date.now()
			});
			this.backgroundPreloadKeys.add(key);
		}

		this.sortBackgroundPreloadQueue();
		this.pumpBackgroundPreloadQueue();
	}

	private pumpBackgroundPreloadQueue(): void {
		this.refreshBackgroundPreloadPriorities();
		while (
			this.activeBackgroundPreloads < this.BACKGROUND_PRELOAD_CONCURRENCY &&
			this.backgroundPreloadQueue.length > 0
		) {
			const next = this.backgroundPreloadQueue.shift();
			if (!next) return;

			const key = this.normalizePath(next.path);
			this.backgroundPreloadKeys.delete(key);

			if (this.activePathKeys.size > 0 && next.priority >= 1000) {
				continue;
			}

			if (this.hasValidCache(next.path) || this.loadingPaths.has(key)) {
				continue;
			}

			this.activeBackgroundPreloads++;
			this.getDirectory(next.path, {
				preloadChildren: next.depth < this.PRELOAD_DEPTH,
				childPreloadDepth: next.depth
			})
				.catch(() => {})
				.finally(() => {
					this.activeBackgroundPreloads--;
					this.pumpBackgroundPreloadQueue();
				});
		}
	}

	/**
	 * 预加载指定路径
	 */
	async preload(path: string): Promise<void> {
		if (this.hasValidCache(path)) return;
		await this.getDirectory(path, { preloadChildren: false }).catch(() => {});
	}

	/**
	 * 批量预加载
	 */
	async preloadBatch(paths: string[]): Promise<void> {
		const toLoad = paths.filter((p) => !this.hasValidCache(p));
		const concurrency = 3;
		let cursor = 0;

		const workers = Array.from({ length: Math.min(concurrency, toLoad.length) }, async () => {
			while (cursor < toLoad.length) {
				const path = toLoad[cursor++];
				await this.getDirectory(path, { preloadChildren: false }).catch(() => {});
			}
		});

		await Promise.all(workers);
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

	private getCacheEvictionRank(key: string, entry: CacheEntry): number {
		const activePriority = this.getActivePathPriority(key);
		const activeRank = activePriority >= 1000 ? 0 : activePriority >= 100 ? 1000 : 2000;
		const completeBonus = entry.isComplete ? 100 : 0;
		const accessBonus = Math.min(entry.accessCount || 0, 50);
		return activeRank + completeBonus - accessBonus;
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
				.filter(([, e]) => !e.loading && !e.streamHandle)
				.sort(
					(a, b) =>
						this.getCacheEvictionRank(a[0], a[1]) - this.getCacheEvictionRank(b[0], b[1]) ||
						a[1].timestamp - b[1].timestamp
				);

			const toDelete = entries.slice(0, Math.max(0, this.cache.size - this.MAX_CACHE_SIZE));
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
		this.inflightLoads.clear();
		this.streamingLoads.clear();
		this.backgroundPreloadQueue = [];
		this.backgroundPreloadKeys.clear();
		this.activeBackgroundPreloads = 0;
		this.activePathKeys.clear();
		this.activePathPriorities.clear();
		this.activePathScopes.clear();
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

		debugDirectoryTree(() => `开始预热子树: ${rootPath} (深度: ${maxDepth})`);

		while (queue.length > 0) {
			const { path, depth } = queue.shift()!;
			const key = this.normalizePath(path);

			// 避免重复访问
			if (visited.has(key) || depth >= maxDepth) continue;
			visited.add(key);

			try {
				// 静默加载（如果已缓存则跳过）
				const items = await this.getDirectory(path, { preloadChildren: false }).catch(
					() => [] as FsItem[]
				);
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
				debugDirectoryTree(() => `预热失败: ${path}`, error);
			}
		}

		debugDirectoryTree(() => `子树预热完成: ${rootPath} (已加载 ${loaded}/${total})`);
	}

	/**
	 * 获取缓存统计
	 */
	getStats() {
		return {
			size: this.cache.size,
			loading: this.loadingPaths.size,
			inflight: this.inflightLoads.size,
			backgroundQueue: this.backgroundPreloadQueue.length,
			backgroundActive: this.activeBackgroundPreloads,
			activePaths: this.activePathKeys.size,
			activeScopes: this.activePathScopes.size,
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
		options?: DirectoryStreamingOptions
	): Promise<StreamComplete> {
		const key = this.normalizePath(path);
		const now = Date.now();
		const notifyMode = options?.notifyMode ?? 'batch';

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

		const inflight = this.streamingLoads.get(key);
		if (inflight && cached?.loading) {
			let emitted = 0;
			const emitAvailable = () => {
				const current = this.cache.get(key);
				if (!current || current.items.length <= emitted) return;
				const delta = current.items.slice(emitted);
				emitted = current.items.length;
				onBatch?.(delta, 0, emitted);
			};

			emitAvailable();
			return inflight.then((complete) => {
				emitAvailable();
				return complete;
			});
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

		const streamingPromise = new Promise<StreamComplete>((resolve, reject) => {
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
						if (notifyMode === 'batch') {
							this.notifyUpdate(path, cached?.items || batch.items);
						}
					},
					onProgress: (progress) => {
						// 可以在这里更新进度 UI
						debugDirectoryTree(
							() => `流式加载进度: ${progress.loaded} 项, ${progress.elapsedMs}ms`
						);
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
						this.streamingLoads.delete(key);
						this.cleanup();
						if (notifyMode === 'final' && cached) {
							this.notifyUpdate(path, cached.items);
						}
						resolve(complete);
					}
				},
				{
					batchSize: options?.batchSize,
					skipHidden: options?.skipHidden,
					lane: options?.lane
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
					this.streamingLoads.delete(key);
					this.cache.delete(key);
					reject(err);
				});
		});
		this.streamingLoads.set(key, streamingPromise);
		return streamingPromise;
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
		this.streamingLoads.delete(key);
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
