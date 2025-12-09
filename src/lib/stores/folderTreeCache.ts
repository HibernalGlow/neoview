/**
 * FolderTreeCache - 文件树结构缓存
 * 使用 IndexedDB 持久化树结构，支持增量更新
 */

import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';

// ============ Types ============

export interface CachedTreeNode {
  path: string;
  name: string;
  isRoot: boolean;
  expanded: boolean;
  /** 子节点路径列表（不存储完整子节点，减少存储量） */
  childPaths: string[];
  /** 目录修改时间（用于增量校验） */
  mtime?: number;
  /** 缓存时间 */
  cachedAt: number;
  /** 是否有子目录（用于显示展开箭头） */
  hasChildren: boolean;
}

export interface TreeCacheStats {
  totalNodes: number;
  expandedNodes: number;
  lastUpdated: number;
}

// ============ Constants ============

const DB_NAME = 'neoview-folder-tree';
const DB_VERSION = 1;
const STORE_NAME = 'tree-nodes';
const META_STORE = 'meta';

// 缓存有效期: 7天
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

// ============ Database ============

let dbPromise: Promise<IDBPDatabase> | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 树节点存储
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'path' });
          store.createIndex('by-expanded', 'expanded');
          store.createIndex('by-cached-at', 'cachedAt');
        }
        // 元数据存储
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// ============ Cache API ============

/**
 * 获取缓存的节点
 */
export async function getCachedNode(path: string): Promise<CachedTreeNode | null> {
  try {
    const db = await getDb();
    const node = await db.get(STORE_NAME, path);
    
    if (!node) return null;
    
    // 检查是否过期
    if (Date.now() - node.cachedAt > CACHE_TTL) {
      await db.delete(STORE_NAME, path);
      return null;
    }
    
    return node;
  } catch (e) {
    console.error('[FolderTreeCache] getCachedNode error:', e);
    return null;
  }
}

/**
 * 批量获取缓存的节点
 */
export async function getCachedNodes(paths: string[]): Promise<Map<string, CachedTreeNode>> {
  const result = new Map<string, CachedTreeNode>();
  if (paths.length === 0) return result;
  
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    const now = Date.now();
    const expired: string[] = [];
    
    for (const path of paths) {
      const node = await store.get(path);
      if (node) {
        if (now - node.cachedAt > CACHE_TTL) {
          expired.push(path);
        } else {
          result.set(path, node);
        }
      }
    }
    
    await tx.done;
    
    // 异步清理过期节点
    if (expired.length > 0) {
      cleanupExpiredNodes(expired).catch(() => {});
    }
    
    return result;
  } catch (e) {
    console.error('[FolderTreeCache] getCachedNodes error:', e);
    return result;
  }
}

/**
 * 保存节点到缓存
 */
export async function saveNode(node: CachedTreeNode): Promise<void> {
  try {
    const db = await getDb();
    await db.put(STORE_NAME, {
      ...node,
      cachedAt: Date.now(),
    });
  } catch (e) {
    console.error('[FolderTreeCache] saveNode error:', e);
  }
}

/**
 * 批量保存节点
 */
export async function saveNodes(nodes: CachedTreeNode[]): Promise<void> {
  if (nodes.length === 0) return;
  
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const now = Date.now();
    
    for (const node of nodes) {
      await store.put({
        ...node,
        cachedAt: now,
      });
    }
    
    await tx.done;
  } catch (e) {
    console.error('[FolderTreeCache] saveNodes error:', e);
  }
}

/**
 * 更新节点的展开状态
 */
export async function updateNodeExpanded(path: string, expanded: boolean): Promise<void> {
  try {
    const db = await getDb();
    const node = await db.get(STORE_NAME, path);
    if (node) {
      node.expanded = expanded;
      await db.put(STORE_NAME, node);
    }
  } catch (e) {
    console.error('[FolderTreeCache] updateNodeExpanded error:', e);
  }
}

/**
 * 批量更新展开状态
 */
export async function updateNodesExpanded(updates: { path: string; expanded: boolean }[]): Promise<void> {
  if (updates.length === 0) return;
  
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    for (const { path, expanded } of updates) {
      const node = await store.get(path);
      if (node) {
        node.expanded = expanded;
        await store.put(node);
      }
    }
    
    await tx.done;
  } catch (e) {
    console.error('[FolderTreeCache] updateNodesExpanded error:', e);
  }
}

/**
 * 删除节点（用于增量更新时清理已删除的目录）
 */
export async function deleteNode(path: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(STORE_NAME, path);
  } catch (e) {
    console.error('[FolderTreeCache] deleteNode error:', e);
  }
}

/**
 * 使节点失效（清除其子节点列表，下次访问时重新加载）
 */
export async function invalidateNode(path: string): Promise<void> {
  try {
    const db = await getDb();
    const node = await db.get(STORE_NAME, path);
    if (node) {
      node.childPaths = [];
      node.mtime = undefined;
      await db.put(STORE_NAME, node);
    }
  } catch (e) {
    console.error('[FolderTreeCache] invalidateNode error:', e);
  }
}

/**
 * 清理过期节点
 */
async function cleanupExpiredNodes(paths: string[]): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    for (const path of paths) {
      await store.delete(path);
    }
    
    await tx.done;
  } catch (e) {
    console.error('[FolderTreeCache] cleanupExpiredNodes error:', e);
  }
}

/**
 * 获取所有展开的节点路径
 */
export async function getExpandedPaths(): Promise<string[]> {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('by-expanded');
    const nodes = await index.getAll(IDBKeyRange.only(true));
    await tx.done;
    
    return nodes.map((n: CachedTreeNode) => n.path);
  } catch (e) {
    console.error('[FolderTreeCache] getExpandedPaths error:', e);
    return [];
  }
}

/**
 * 获取缓存统计信息
 */
export async function getCacheStats(): Promise<TreeCacheStats> {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    const totalNodes = await store.count();
    const expandedIndex = store.index('by-expanded');
    const expandedNodes = await expandedIndex.count(IDBKeyRange.only(true));
    
    // 获取最近更新时间
    const cachedAtIndex = store.index('by-cached-at');
    const cursor = await cachedAtIndex.openCursor(null, 'prev');
    const lastUpdated = cursor?.value?.cachedAt ?? 0;
    
    await tx.done;
    
    return { totalNodes, expandedNodes, lastUpdated };
  } catch (e) {
    console.error('[FolderTreeCache] getCacheStats error:', e);
    return { totalNodes: 0, expandedNodes: 0, lastUpdated: 0 };
  }
}

/**
 * 清除所有缓存
 */
export async function clearCache(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear(STORE_NAME);
    console.log('[FolderTreeCache] Cache cleared');
  } catch (e) {
    console.error('[FolderTreeCache] clearCache error:', e);
  }
}

/**
 * 运行垃圾回收（清理过期节点）
 */
export async function runGC(): Promise<number> {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('by-cached-at');
    
    const threshold = Date.now() - CACHE_TTL;
    let cursor = await index.openCursor(IDBKeyRange.upperBound(threshold));
    let deleted = 0;
    
    while (cursor) {
      await cursor.delete();
      deleted++;
      cursor = await cursor.continue();
    }
    
    await tx.done;
    
    if (deleted > 0) {
      console.log(`[FolderTreeCache] GC: removed ${deleted} expired nodes`);
    }
    
    return deleted;
  } catch (e) {
    console.error('[FolderTreeCache] runGC error:', e);
    return 0;
  }
}

// ============ Helper Functions ============

/**
 * 规范化路径（用于缓存 key）
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

/**
 * 从 FsItem 列表创建缓存节点
 */
export function createCachedNode(
  path: string,
  name: string,
  isRoot: boolean,
  childPaths: string[],
  mtime?: number
): CachedTreeNode {
  return {
    path,
    name,
    isRoot,
    expanded: false,
    childPaths,
    mtime,
    cachedAt: Date.now(),
    hasChildren: childPaths.length > 0,
  };
}
