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

// ============ Memory Cache ============
// 内存缓存层：避免频繁访问 IndexedDB
const memoryCache = new Map<string, CachedTreeNode>();
let memoryCachePopulated = false;

/**
 * 预加载所有缓存节点到内存（启动时调用一次）
 */
export async function preloadCache(): Promise<void> {
  if (memoryCachePopulated) return;
  
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const allNodes = await store.getAll();
    
    const now = Date.now();
    for (const node of allNodes) {
      if (now - node.cachedAt <= CACHE_TTL) {
        memoryCache.set(node.path, node);
      }
    }
    
    memoryCachePopulated = true;
    console.log(`[FolderTreeCache] 预加载 ${memoryCache.size} 节点到内存`);
  } catch (e) {
    console.error('[FolderTreeCache] preloadCache error:', e);
  }
}

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
 * 获取缓存的节点（优化：先查内存缓存）
 */
export async function getCachedNode(path: string): Promise<CachedTreeNode | null> {
  // 优先从内存缓存获取
  if (memoryCachePopulated) {
    const cached = memoryCache.get(path);
    if (cached) {
      if (Date.now() - cached.cachedAt <= CACHE_TTL) {
        return cached;
      }
      memoryCache.delete(path);
    }
    return null;
  }
  
  // 回退到 IndexedDB
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
 * 批量获取缓存的节点（优化：内存缓存 + 并行获取）
 */
export async function getCachedNodes(paths: string[]): Promise<Map<string, CachedTreeNode>> {
  const result = new Map<string, CachedTreeNode>();
  if (paths.length === 0) return result;
  
  // 优先从内存缓存获取
  if (memoryCachePopulated) {
    const now = Date.now();
    for (const path of paths) {
      const cached = memoryCache.get(path);
      if (cached && now - cached.cachedAt <= CACHE_TTL) {
        result.set(path, cached);
      }
    }
    return result;
  }
  
  // 回退到 IndexedDB
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    // 优化：并行获取所有节点，而不是串行
    const nodePromises = paths.map(path => store.get(path));
    const nodes = await Promise.all(nodePromises);
    
    const now = Date.now();
    const expired: string[] = [];
    
    for (let i = 0; i < paths.length; i++) {
      const node = nodes[i];
      if (node) {
        if (now - node.cachedAt > CACHE_TTL) {
          expired.push(paths[i]);
        } else {
          result.set(paths[i], node);
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
 * 保存节点到缓存（同时更新内存缓存）
 */
export async function saveNode(node: CachedTreeNode): Promise<void> {
  const nodeWithTime = { ...node, cachedAt: Date.now() };
  
  // 更新内存缓存
  memoryCache.set(node.path, nodeWithTime);
  
  // 异步写入 IndexedDB
  try {
    const db = await getDb();
    await db.put(STORE_NAME, nodeWithTime);
  } catch (e) {
    console.error('[FolderTreeCache] saveNode error:', e);
  }
}

/**
 * 批量保存节点（优化：内存缓存 + 并行写入 IndexedDB）
 */
export async function saveNodes(nodes: CachedTreeNode[]): Promise<void> {
  if (nodes.length === 0) return;
  
  const now = Date.now();
  
  // 先更新内存缓存（同步，立即生效）
  for (const node of nodes) {
    memoryCache.set(node.path, { ...node, cachedAt: now });
  }
  
  // 异步写入 IndexedDB
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // 优化：并行写入所有节点
    const putPromises = nodes.map(node => 
      store.put({
        ...node,
        cachedAt: now,
      })
    );
    await Promise.all(putPromises);
    
    await tx.done;
  } catch (e) {
    console.error('[FolderTreeCache] saveNodes error:', e);
  }
}

/**
 * 更新节点的展开状态（同时更新内存缓存）
 */
export async function updateNodeExpanded(path: string, expanded: boolean): Promise<void> {
  // 先更新内存缓存
  const cached = memoryCache.get(path);
  if (cached) {
    cached.expanded = expanded;
  }
  
  // 异步更新 IndexedDB
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
 * 批量更新展开状态（优化：并行读取和写入）
 */
export async function updateNodesExpanded(updates: { path: string; expanded: boolean }[]): Promise<void> {
  if (updates.length === 0) return;
  
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // 并行获取所有节点
    const paths = updates.map(u => u.path);
    const nodePromises = paths.map(path => store.get(path));
    const nodes = await Promise.all(nodePromises);
    
    // 并行更新所有节点
    const putPromises: Promise<IDBValidKey>[] = [];
    for (let i = 0; i < updates.length; i++) {
      const node = nodes[i];
      if (node) {
        node.expanded = updates[i].expanded;
        putPromises.push(store.put(node));
      }
    }
    await Promise.all(putPromises);
    
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
 * 获取所有展开的节点路径（优化：使用内存缓存）
 */
export async function getExpandedPaths(): Promise<string[]> {
  // 优先从内存缓存获取
  if (memoryCachePopulated) {
    const paths: string[] = [];
    for (const [path, node] of memoryCache) {
      if (node.expanded) {
        paths.push(path);
      }
    }
    return paths;
  }
  
  // 回退到 IndexedDB
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
 * 获取缓存统计信息（优化：使用内存缓存）
 */
export async function getCacheStats(): Promise<TreeCacheStats> {
  // 优先从内存缓存获取
  if (memoryCachePopulated) {
    let expandedCount = 0;
    let lastUpdated = 0;
    for (const node of memoryCache.values()) {
      if (node.expanded) expandedCount++;
      if (node.cachedAt > lastUpdated) lastUpdated = node.cachedAt;
    }
    return { totalNodes: memoryCache.size, expandedNodes: expandedCount, lastUpdated };
  }
  
  // 回退到 IndexedDB
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
