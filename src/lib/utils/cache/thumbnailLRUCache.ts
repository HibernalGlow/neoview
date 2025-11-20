/**
 * LRU 缓存管理模块
 * 自动淘汰最少使用的缓存项，限制内存使用
 */

export interface CacheItem<T> {
    key: string;
    value: T;
    timestamp: number;
    accessCount: number;
    lastAccessTime: number;
}

interface LRUNode<T> {
    key: string;
    value: CacheItem<T>;
    prev: LRUNode<T> | null;
    next: LRUNode<T> | null;
}

export interface LRUCacheConfig {
    maxSize: number;              // 最大缓存数量
    cleanupThreshold: number;     // 清理阈值（0-1之间）
    onEvict?: (key: string, value: CacheItem<any>) => void;  // 淘汰回调
}

/**
 * LRU 缓存类
 * 使用双向链表 + Map 实现 O(1) 的访问和更新
 */
export class LRUCache<T> {
    private maxSize: number;
    private cleanupThreshold: number;
    private cache = new Map<string, CacheItem<T>>();
    private lruMap = new Map<string, LRUNode<T>>();
    private head: LRUNode<T> | null = null;  // 最近使用
    private tail: LRUNode<T> | null = null;  // 最少使用
    private onEvict?: (key: string, value: CacheItem<T>) => void;

    constructor(config: LRUCacheConfig) {
        this.maxSize = config.maxSize;
        this.cleanupThreshold = config.cleanupThreshold;
        this.onEvict = config.onEvict;
    }

    /**
     * 获取缓存项（自动更新访问信息）
     */
    get(key: string): T | null {
        const node = this.lruMap.get(key);
        if (!node) return null;

        // 更新访问信息
        const now = Date.now();
        node.value.accessCount++;
        node.value.lastAccessTime = now;

        // 移到头部（最近使用）
        this.moveToHead(node);

        return node.value.value;
    }

    /**
     * 设置缓存项
     */
    set(key: string, value: T): void {
        const existingNode = this.lruMap.get(key);

        if (existingNode) {
            // 更新已存在的项
            const now = Date.now();
            existingNode.value.value = value;
            existingNode.value.timestamp = now;
            existingNode.value.lastAccessTime = now;
            this.moveToHead(existingNode);
        } else {
            // 检查是否需要清理
            if (this.cache.size >= this.maxSize * this.cleanupThreshold) {
                this.cleanup();
            }

            // 添加新项
            const now = Date.now();
            const cacheItem: CacheItem<T> = {
                key,
                value,
                timestamp: now,
                accessCount: 0,
                lastAccessTime: now,
            };

            const newNode: LRUNode<T> = {
                key,
                value: cacheItem,
                prev: null,
                next: null,
            };

            this.lruMap.set(key, newNode);
            this.cache.set(key, cacheItem);
            this.addToHead(newNode);
        }
    }

    /**
     * 删除缓存项
     */
    delete(key: string): boolean {
        const node = this.lruMap.get(key);
        if (!node) return false;

        this.removeNode(node);
        this.lruMap.delete(key);
        this.cache.delete(key);

        return true;
    }

    /**
     * 检查是否存在
     */
    has(key: string): boolean {
        return this.cache.has(key);
    }

    /**
     * 获取当前大小
     */
    get size(): number {
        return this.cache.size;
    }

    /**
     * 清空缓存
     */
    clear(): void {
        // 触发所有项的淘汰回调
        if (this.onEvict) {
            this.cache.forEach((value, key) => {
                this.onEvict!(key, value);
            });
        }

        this.cache.clear();
        this.lruMap.clear();
        this.head = null;
        this.tail = null;
    }

    /**
     * 获取所有键
     */
    keys(): IterableIterator<string> {
        return this.cache.keys();
    }

    /**
     * 清理缓存（淘汰最少使用的）
     */
    private cleanup(): void {
        const targetSize = Math.floor(this.maxSize * 0.7); // 清理到 70%
        const toRemove = this.cache.size - targetSize;

        if (toRemove <= 0) return;

        console.log(`🧹 LRU 缓存清理: 移除 ${toRemove} 个最少使用的项`);

        for (let i = 0; i < toRemove; i++) {
            const tail = this.removeTail();
            if (!tail) break;

            // 触发淘汰回调
            if (this.onEvict) {
                this.onEvict(tail.key, tail.value);
            }

            this.cache.delete(tail.key);
            this.lruMap.delete(tail.key);
        }
    }

    /**
     * 移动节点到头部
     */
    private moveToHead(node: LRUNode<T>): void {
        if (node === this.head) return;

        // 从当前位置移除
        if (node.prev) node.prev.next = node.next;
        if (node.next) node.next.prev = node.prev;
        if (node === this.tail) this.tail = node.prev;

        // 移到头部
        node.prev = null;
        node.next = this.head;
        if (this.head) this.head.prev = node;
        this.head = node;
        if (!this.tail) this.tail = node;
    }

    /**
     * 添加节点到头部
     */
    private addToHead(node: LRUNode<T>): void {
        node.prev = null;
        node.next = this.head;
        if (this.head) this.head.prev = node;
        this.head = node;
        if (!this.tail) this.tail = node;
    }

    /**
     * 移除指定节点
     */
    private removeNode(node: LRUNode<T>): void {
        if (node.prev) node.prev.next = node.next;
        if (node.next) node.next.prev = node.prev;
        if (node === this.head) this.head = node.next;
        if (node === this.tail) this.tail = node.prev;
    }

    /**
     * 移除尾部节点
     */
    private removeTail(): LRUNode<T> | null {
        if (!this.tail) return null;

        const tail = this.tail;
        if (tail.prev) {
            tail.prev.next = null;
            this.tail = tail.prev;
        } else {
            this.head = null;
            this.tail = null;
        }

        return tail;
    }

    /**
     * 获取缓存统计信息
     */
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            usage: (this.cache.size / this.maxSize * 100).toFixed(1) + '%',
        };
    }
}
