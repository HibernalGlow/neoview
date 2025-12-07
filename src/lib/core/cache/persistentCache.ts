/**
 * IndexedDB 持久化缓存
 * 
 * 提供缓存数据的持久化存储，支持：
 * - 自动过期清理
 * - 批量操作
 * - 异步初始化
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface PersistentCacheConfig {
	/** 数据库名称 */
	dbName: string;
	/** 存储名称 */
	storeName: string;
	/** 最大过期时间（毫秒） */
	maxAge?: number;
	/** 数据库版本 */
	version?: number;
}

interface StoredEntry<T> {
	key: string;
	value: T;
	createdAt: number;
	expiresAt?: number;
}

// ============================================================================
// 持久化缓存实现
// ============================================================================

export class PersistentCache<T> {
	private db: IDBDatabase | null = null;
	private config: Required<Omit<PersistentCacheConfig, 'maxAge'>> & { maxAge?: number };
	private initPromise: Promise<void> | null = null;

	constructor(config: PersistentCacheConfig) {
		this.config = {
			dbName: config.dbName,
			storeName: config.storeName,
			maxAge: config.maxAge,
			version: config.version ?? 1,
		};
	}

	async init(): Promise<void> {
		if (this.db) return;
		if (this.initPromise) return this.initPromise;

		this.initPromise = this.openDatabase();
		return this.initPromise;
	}

	private openDatabase(): Promise<void> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.config.dbName, this.config.version);

			request.onerror = () => {
				console.error('[PersistentCache] 数据库打开失败:', request.error);
				reject(request.error);
			};

			request.onsuccess = () => {
				this.db = request.result;
				resolve();
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				
				// 创建存储（如果不存在）
				if (!db.objectStoreNames.contains(this.config.storeName)) {
					const store = db.createObjectStore(this.config.storeName, { keyPath: 'key' });
					store.createIndex('expiresAt', 'expiresAt', { unique: false });
					store.createIndex('createdAt', 'createdAt', { unique: false });
				}
			};
		});
	}

	async get(key: string): Promise<T | undefined> {
		await this.init();
		if (!this.db) return undefined;

		return new Promise((resolve) => {
			const tx = this.db!.transaction(this.config.storeName, 'readonly');
			const store = tx.objectStore(this.config.storeName);
			const request = store.get(key);

			request.onsuccess = () => {
				const entry = request.result as StoredEntry<T> | undefined;
				if (!entry) {
					resolve(undefined);
					return;
				}

				// 检查是否过期
				if (entry.expiresAt && Date.now() > entry.expiresAt) {
					this.delete(key).catch(() => {});
					resolve(undefined);
					return;
				}

				resolve(entry.value);
			};

			request.onerror = () => {
				console.debug('[PersistentCache] 读取失败:', request.error);
				resolve(undefined);
			};
		});
	}

	async set(key: string, value: T): Promise<void> {
		await this.init();
		if (!this.db) return;

		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction(this.config.storeName, 'readwrite');
			const store = tx.objectStore(this.config.storeName);

			const entry: StoredEntry<T> = {
				key,
				value,
				createdAt: Date.now(),
				expiresAt: this.config.maxAge ? Date.now() + this.config.maxAge : undefined,
			};

			const request = store.put(entry);

			request.onsuccess = () => resolve();
			request.onerror = () => {
				console.debug('[PersistentCache] 写入失败:', request.error);
				reject(request.error);
			};
		});
	}

	async delete(key: string): Promise<boolean> {
		await this.init();
		if (!this.db) return false;

		return new Promise((resolve) => {
			const tx = this.db!.transaction(this.config.storeName, 'readwrite');
			const store = tx.objectStore(this.config.storeName);
			const request = store.delete(key);

			request.onsuccess = () => resolve(true);
			request.onerror = () => resolve(false);
		});
	}

	async clear(): Promise<void> {
		await this.init();
		if (!this.db) return;

		return new Promise((resolve) => {
			const tx = this.db!.transaction(this.config.storeName, 'readwrite');
			const store = tx.objectStore(this.config.storeName);
			const request = store.clear();

			request.onsuccess = () => resolve();
			request.onerror = () => resolve();
		});
	}

	async keys(): Promise<string[]> {
		await this.init();
		if (!this.db) return [];

		return new Promise((resolve) => {
			const tx = this.db!.transaction(this.config.storeName, 'readonly');
			const store = tx.objectStore(this.config.storeName);
			const request = store.getAllKeys();

			request.onsuccess = () => {
				resolve(request.result as string[]);
			};
			request.onerror = () => resolve([]);
		});
	}

	async count(): Promise<number> {
		await this.init();
		if (!this.db) return 0;

		return new Promise((resolve) => {
			const tx = this.db!.transaction(this.config.storeName, 'readonly');
			const store = tx.objectStore(this.config.storeName);
			const request = store.count();

			request.onsuccess = () => resolve(request.result);
			request.onerror = () => resolve(0);
		});
	}

	/** 清理过期数据 */
	async cleanupExpired(): Promise<number> {
		await this.init();
		if (!this.db) return 0;

		return new Promise((resolve) => {
			const tx = this.db!.transaction(this.config.storeName, 'readwrite');
			const store = tx.objectStore(this.config.storeName);
			const index = store.index('expiresAt');
			const now = Date.now();

			// 获取所有过期的条目
			const range = IDBKeyRange.upperBound(now);
			const request = index.openCursor(range);
			let deleted = 0;

			request.onsuccess = () => {
				const cursor = request.result;
				if (cursor) {
					const entry = cursor.value as StoredEntry<T>;
					if (entry.expiresAt && entry.expiresAt < now) {
						cursor.delete();
						deleted++;
					}
					cursor.continue();
				} else {
					resolve(deleted);
				}
			};

			request.onerror = () => resolve(deleted);
		});
	}

	/** 批量获取 */
	async batchGet(keys: string[]): Promise<Map<string, T>> {
		await this.init();
		const result = new Map<string, T>();
		if (!this.db || keys.length === 0) return result;

		return new Promise((resolve) => {
			const tx = this.db!.transaction(this.config.storeName, 'readonly');
			const store = tx.objectStore(this.config.storeName);
			let pending = keys.length;
			const now = Date.now();

			for (const key of keys) {
				const request = store.get(key);
				request.onsuccess = () => {
					const entry = request.result as StoredEntry<T> | undefined;
					if (entry && (!entry.expiresAt || entry.expiresAt > now)) {
						result.set(key, entry.value);
					}
					pending--;
					if (pending === 0) resolve(result);
				};
				request.onerror = () => {
					pending--;
					if (pending === 0) resolve(result);
				};
			}
		});
	}

	/** 批量设置 */
	async batchSet(entries: Map<string, T>): Promise<void> {
		await this.init();
		if (!this.db || entries.size === 0) return;

		return new Promise((resolve, reject) => {
			const tx = this.db!.transaction(this.config.storeName, 'readwrite');
			const store = tx.objectStore(this.config.storeName);
			const now = Date.now();

			for (const [key, value] of entries) {
				const entry: StoredEntry<T> = {
					key,
					value,
					createdAt: now,
					expiresAt: this.config.maxAge ? now + this.config.maxAge : undefined,
				};
				store.put(entry);
			}

			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	/** 关闭数据库连接 */
	close(): void {
		if (this.db) {
			this.db.close();
			this.db = null;
			this.initPromise = null;
		}
	}
}

// ============================================================================
// 工厂函数
// ============================================================================

/** 创建持久化缓存实例 */
export function createPersistentCache<T>(config: PersistentCacheConfig): PersistentCache<T> {
	return new PersistentCache<T>(config);
}

// ============================================================================
// 数据库管理
// ============================================================================

/** 删除整个缓存数据库 */
export async function deleteCacheDatabase(dbName: string = 'neoview-cache'): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(dbName);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

/** 获取数据库存储大小估计 */
export async function estimateStorageUsage(): Promise<{ usage: number; quota: number } | null> {
	if (!navigator.storage || !navigator.storage.estimate) {
		return null;
	}
	try {
		const estimate = await navigator.storage.estimate();
		return {
			usage: estimate.usage ?? 0,
			quota: estimate.quota ?? 0,
		};
	} catch {
		return null;
	}
}
