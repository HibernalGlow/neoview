/**
 * Thumbnail Persistent Cache
 * 缩略图持久性缓存 - 使用 IndexedDB 存储
 * 避免每次启动都需要重新从后端加载
 */

const DB_NAME = 'neoview-thumbnail-cache';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';

interface CacheEntry {
  key: string;
  dataUrl: string;
  size: number;
  timestamp: number;
}

class ThumbnailPersistentCache {
  private db: IDBDatabase | null = null;
  private dbReady: Promise<void>;
  private maxSize = 2048 * 1024 * 1024; // 2048MB
  private currentSize = 0;

  constructor() {
    this.dbReady = this.initDB();
  }

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('❌ IndexedDB 打开失败:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB 缩略图缓存已初始化');
        this.calculateCurrentSize().then(resolve);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // 创建对象存储
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('size', 'size', { unique: false });
          console.log('📦 创建 IndexedDB 缩略图存储');
        }
      };
    });
  }

  private async calculateCurrentSize(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();
      
      let totalSize = 0;
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          totalSize += cursor.value.size || 0;
          cursor.continue();
        } else {
          this.currentSize = totalSize;
          console.log(`📊 IndexedDB 缓存大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
          resolve();
        }
      };

      request.onerror = () => {
        console.error('计算缓存大小失败');
        resolve();
      };
    });
  }

  /**
   * 获取缓存
   */
  async get(key: string): Promise<string | null> {
    await this.dbReady;
    if (!this.db) return null;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        if (entry) {
          resolve(entry.dataUrl);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  }

  /**
   * 设置缓存
   */
  async set(key: string, dataUrl: string): Promise<void> {
    await this.dbReady;
    if (!this.db) return;

    const size = dataUrl.length * 2; // 估算字节大小（UTF-16）

    // 检查是否需要清理空间
    if (this.currentSize + size > this.maxSize) {
      await this.evictOldest(size);
    }

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const entry: CacheEntry = {
        key,
        dataUrl,
        size,
        timestamp: Date.now(),
      };

      const request = store.put(entry);

      request.onsuccess = () => {
        this.currentSize += size;
        resolve();
      };

      request.onerror = () => {
        console.error('写入 IndexedDB 失败:', request.error);
        resolve();
      };
    });
  }

  /**
   * 批量获取缓存
   */
  async getBatch(keys: string[]): Promise<Map<string, string>> {
    await this.dbReady;
    if (!this.db) return new Map();

    return new Promise((resolve) => {
      const results = new Map<string, string>();
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      let completed = 0;
      const total = keys.length;

      if (total === 0) {
        resolve(results);
        return;
      }

      for (const key of keys) {
        const request = store.get(key);

        request.onsuccess = () => {
          const entry = request.result as CacheEntry | undefined;
          if (entry) {
            results.set(key, entry.dataUrl);
          }
          completed++;
          if (completed === total) {
            resolve(results);
          }
        };

        request.onerror = () => {
          completed++;
          if (completed === total) {
            resolve(results);
          }
        };
      }
    });
  }

  /**
   * 批量设置缓存
   */
  async setBatch(entries: Array<{ key: string; dataUrl: string }>): Promise<void> {
    await this.dbReady;
    if (!this.db || entries.length === 0) return;

    // 计算总大小
    let totalSize = 0;
    for (const entry of entries) {
      totalSize += entry.dataUrl.length * 2;
    }

    // 检查是否需要清理空间
    if (this.currentSize + totalSize > this.maxSize) {
      await this.evictOldest(totalSize);
    }

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      for (const { key, dataUrl } of entries) {
        const size = dataUrl.length * 2;
        const entry: CacheEntry = {
          key,
          dataUrl,
          size,
          timestamp: Date.now(),
        };
        store.put(entry);
        this.currentSize += size;
      }

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        console.error('批量写入 IndexedDB 失败');
        resolve();
      };
    });
  }

  /**
   * 删除最旧的条目以腾出空间
   */
  private async evictOldest(neededSize: number): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.openCursor();

      let freedSize = 0;
      const targetFree = neededSize + this.maxSize * 0.1; // 多清理 10%

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor && freedSize < targetFree) {
          const entry = cursor.value as CacheEntry;
          freedSize += entry.size;
          this.currentSize -= entry.size;
          cursor.delete();
          cursor.continue();
        } else {
          console.log(`🗑️ IndexedDB 清理了 ${(freedSize / 1024 / 1024).toFixed(2)} MB`);
          resolve();
        }
      };

      request.onerror = () => {
        resolve();
      };
    });
  }

  /**
   * 检查是否存在
   */
  async has(key: string): Promise<boolean> {
    await this.dbReady;
    if (!this.db) return false;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count(IDBKeyRange.only(key));

      request.onsuccess = () => {
        resolve(request.result > 0);
      };

      request.onerror = () => {
        resolve(false);
      };
    });
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    await this.dbReady;
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      // 先获取大小
      const getRequest = store.get(key);
      getRequest.onsuccess = () => {
        const entry = getRequest.result as CacheEntry | undefined;
        if (entry) {
          this.currentSize -= entry.size;
          store.delete(key);
        }
        resolve();
      };

      getRequest.onerror = () => {
        resolve();
      };
    });
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    await this.dbReady;
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        this.currentSize = 0;
        console.log('🗑️ IndexedDB 缓存已清空');
        resolve();
      };

      request.onerror = () => {
        resolve();
      };
    });
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{ count: number; size: number; maxSize: number }> {
    await this.dbReady;
    if (!this.db) return { count: 0, size: 0, maxSize: this.maxSize };

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => {
        resolve({
          count: request.result,
          size: this.currentSize,
          maxSize: this.maxSize,
        });
      };

      request.onerror = () => {
        resolve({ count: 0, size: this.currentSize, maxSize: this.maxSize });
      };
    });
  }
}

// 单例
export const thumbnailPersistentCache = new ThumbnailPersistentCache();
