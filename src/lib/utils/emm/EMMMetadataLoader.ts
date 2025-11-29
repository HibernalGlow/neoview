/**
 * EMM Metadata Loader
 * EMM 元数据加载器 - 参考缩略图加载器的设计
 * 支持：并发控制、批量加载、超时处理、失败记录、可见范围优化
 */

import { invokeWithTimeout, DEFAULT_IPC_TIMEOUT, isTimeoutError } from '../thumbnail/ipcTimeout';
import type { EMMMetadata } from '$lib/api/emm';

export interface EMMLoaderConfig {
	maxConcurrent: number;      // 最大并发数
	batchSize: number;          // 批量大小
	timeout: number;            // IPC 超时（毫秒）
}

export interface EMMLoadProgress {
	total: number;
	completed: number;
	current: string;
	failed: number;
}

type ProgressCallback = (progress: EMMLoadProgress) => void;

class EMMMetadataLoader {
	private config: EMMLoaderConfig = {
		maxConcurrent: 8,
		batchSize: 20,
		timeout: DEFAULT_IPC_TIMEOUT,
	};

	// 缓存
	private metadataCache = new Map<string, EMMMetadata | null>();
	private failedPaths = new Map<string, { reason: string; count: number; lastAttempt: number }>();
	
	// 并发控制
	private activeRequests = 0;
	private pendingQueue: Array<{
		path: string;
		resolve: (value: EMMMetadata | null) => void;
		reject: (error: Error) => void;
	}> = [];
	
	// 当前目录（用于取消旧请求）
	private currentDirectory = '';
	private abortController: AbortController | null = null;

	// 数据库路径
	private databasePaths: string[] = [];
	private translationDbPath: string | undefined;

	/**
	 * 设置数据库路径
	 */
	setDatabasePaths(paths: string[], translationDbPath?: string) {
		this.databasePaths = paths;
		this.translationDbPath = translationDbPath;
	}

	/**
	 * 设置当前目录（切换目录时取消旧请求）
	 */
	setCurrentDirectory(dir: string) {
		if (this.currentDirectory !== dir) {
			this.currentDirectory = dir;
			// 取消旧请求
			this.abortController?.abort();
			this.abortController = new AbortController();
			// 清空非当前目录的 pending 队列
			this.pendingQueue = this.pendingQueue.filter(item => 
				item.path.startsWith(dir)
			);
		}
	}

	/**
	 * 检查是否应该跳过（已失败且不应重试）
	 */
	private shouldSkip(path: string): boolean {
		const failed = this.failedPaths.get(path);
		if (!failed) return false;
		
		// 格式不支持或权限问题，永久跳过
		if (['format_not_supported', 'permission_denied', 'not_found'].includes(failed.reason)) {
			return true;
		}
		// 其他错误，重试次数限制
		return failed.count >= 3;
	}

	/**
	 * 记录失败
	 */
	private markFailed(path: string, reason: string) {
		const existing = this.failedPaths.get(path);
		this.failedPaths.set(path, {
			reason,
			count: (existing?.count || 0) + 1,
			lastAttempt: Date.now(),
		});
	}

	/**
	 * 加载单个元数据（带超时和并发控制）
	 */
	async loadMetadata(path: string): Promise<EMMMetadata | null> {
		// 检查是否有数据库配置
		if (this.databasePaths.length === 0) {
			console.warn('[EMMLoader] 没有配置数据库路径，跳过加载:', path);
			return null;
		}

		// 检查缓存
		if (this.metadataCache.has(path)) {
			return this.metadataCache.get(path) || null;
		}

		// 检查是否应该跳过
		if (this.shouldSkip(path)) {
			return null;
		}

		// 并发控制
		if (this.activeRequests >= this.config.maxConcurrent) {
			return new Promise((resolve, reject) => {
				this.pendingQueue.push({ path, resolve, reject });
			});
		}

		return this._doLoadMetadata(path);
	}

	/**
	 * 实际加载逻辑
	 */
	private async _doLoadMetadata(path: string): Promise<EMMMetadata | null> {
		this.activeRequests++;

		try {
			// 遍历所有数据库尝试加载
			for (const dbPath of this.databasePaths) {
				try {
					const metadata = await invokeWithTimeout<EMMMetadata | null>(
						'load_emm_metadata_by_path',
						{
							dbPath,
							filePath: path,
							translationDbPath: this.translationDbPath || null,
						},
						this.config.timeout
					);

					if (metadata) {
						this.metadataCache.set(path, metadata);
						// 清除失败记录
						this.failedPaths.delete(path);
						return metadata;
					}
				} catch (error) {
					if (isTimeoutError(error)) {
						console.warn(`⏱️ EMM 加载超时: ${path}`);
						this.markFailed(path, 'timeout');
					}
					// 继续尝试下一个数据库
				}
			}

			// 所有数据库都没找到
			this.metadataCache.set(path, null);
			this.markFailed(path, 'not_found');
			return null;
		} catch (error) {
			console.error('EMM 加载失败:', path, error);
			this.markFailed(path, 'unknown');
			return null;
		} finally {
			this.activeRequests--;
			this._processQueue();
		}
	}

	/**
	 * 处理等待队列
	 */
	private _processQueue() {
		while (this.pendingQueue.length > 0 && this.activeRequests < this.config.maxConcurrent) {
			const next = this.pendingQueue.shift();
			if (next) {
				this._doLoadMetadata(next.path)
					.then(next.resolve)
					.catch(next.reject);
			}
		}
	}

	/**
	 * 批量加载元数据（可见范围优化）
	 */
	async loadBatch(
		paths: string[],
		onProgress?: ProgressCallback
	): Promise<Map<string, EMMMetadata | null>> {
		const results = new Map<string, EMMMetadata | null>();
		const toLoad: string[] = [];

		// 先检查缓存
		for (const path of paths) {
			if (this.metadataCache.has(path)) {
				results.set(path, this.metadataCache.get(path) || null);
			} else if (!this.shouldSkip(path)) {
				toLoad.push(path);
			} else {
				results.set(path, null);
			}
		}

		if (toLoad.length === 0) {
			return results;
		}

		// 批量加载
		let completed = 0;
		const failed = { count: 0 };

		// 分批处理
		for (let i = 0; i < toLoad.length; i += this.config.batchSize) {
			const batch = toLoad.slice(i, i + this.config.batchSize);
			
			// 并发加载这一批
			const promises = batch.map(async (path) => {
				try {
					const metadata = await this.loadMetadata(path);
					results.set(path, metadata);
					if (!metadata) failed.count++;
				} catch {
					results.set(path, null);
					failed.count++;
				} finally {
					completed++;
					onProgress?.({
						total: toLoad.length,
						completed,
						current: path,
						failed: failed.count,
					});
				}
			});

			await Promise.all(promises);
		}

		return results;
	}

	/**
	 * 只加载可见范围的元数据
	 */
	async loadVisibleRange(
		allPaths: string[],
		startIndex: number,
		endIndex: number,
		onProgress?: ProgressCallback
	): Promise<Map<string, EMMMetadata | null>> {
		const visiblePaths = allPaths.slice(
			Math.max(0, startIndex),
			Math.min(allPaths.length, endIndex + 1)
		);
		return this.loadBatch(visiblePaths, onProgress);
	}

	/**
	 * 清空缓存
	 */
	clearCache() {
		this.metadataCache.clear();
	}

	/**
	 * 清空失败记录
	 */
	clearFailedRecords() {
		this.failedPaths.clear();
	}

	/**
	 * 清空指定目录的缓存
	 */
	clearCacheForDirectory(dir: string) {
		const normalizedDir = dir.replace(/\\/g, '/');
		for (const key of this.metadataCache.keys()) {
			if (key.replace(/\\/g, '/').startsWith(normalizedDir)) {
				this.metadataCache.delete(key);
			}
		}
		for (const key of this.failedPaths.keys()) {
			if (key.replace(/\\/g, '/').startsWith(normalizedDir)) {
				this.failedPaths.delete(key);
			}
		}
	}

	/**
	 * 获取缓存统计
	 */
	getStats() {
		return {
			cacheSize: this.metadataCache.size,
			failedCount: this.failedPaths.size,
			activeRequests: this.activeRequests,
			pendingCount: this.pendingQueue.length,
		};
	}
}

// 导出单例
export const emmMetadataLoader = new EMMMetadataLoader();
export { EMMMetadataLoader };
