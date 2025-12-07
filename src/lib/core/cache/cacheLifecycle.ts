/**
 * 缓存生命周期管理
 * 
 * 处理应用启动时的缓存预热和关闭时的清理
 */

import { globalCacheManager } from './globalCacheManager';
import { estimateStorageUsage } from './persistentCache';

let initialized = false;
let beforeUnloadHandler: (() => void) | null = null;

/**
 * 初始化缓存系统
 * 
 * - 启动自动清理
 * - 从持久化存储预热常用缓存
 * - 注册应用关闭处理器
 */
export async function initializeCacheSystem(): Promise<void> {
	if (initialized) return;
	initialized = true;

	console.debug('[CacheLifecycle] 初始化缓存系统...');

	// 启动自动清理（每分钟检查一次过期项）
	globalCacheManager.startAutoCleanup();

	// 注册应用关闭处理器
	if (typeof window !== 'undefined') {
		beforeUnloadHandler = () => {
			// 清理过期数据
			globalCacheManager.cleanupAllExpired();
			// 停止自动清理
			globalCacheManager.dispose();
		};
		window.addEventListener('beforeunload', beforeUnloadHandler);
	}

	// 异步预热（不阻塞启动）
	warmupCaches().catch((e) => {
		console.debug('[CacheLifecycle] 预热失败:', e);
	});

	// 打印存储使用情况
	const storage = await estimateStorageUsage();
	if (storage) {
		const usageMB = Math.round(storage.usage / 1024 / 1024);
		const quotaMB = Math.round(storage.quota / 1024 / 1024);
		console.debug(`[CacheLifecycle] 存储使用: ${usageMB}MB / ${quotaMB}MB`);
	}
}

/**
 * 预热缓存（从 IndexedDB 恢复到内存）
 */
async function warmupCaches(): Promise<void> {
	const start = performance.now();
	const results = await globalCacheManager.warmupAll();
	const elapsed = Math.round(performance.now() - start);

	if (results.size > 0) {
		let total = 0;
		for (const count of results.values()) {
			total += count;
		}
		console.debug(`[CacheLifecycle] 预热完成: ${total} 项, 耗时 ${elapsed}ms`);
	}
}

/**
 * 关闭缓存系统
 */
export function teardownCacheSystem(): void {
	if (!initialized) return;

	// 移除事件监听
	if (beforeUnloadHandler && typeof window !== 'undefined') {
		window.removeEventListener('beforeunload', beforeUnloadHandler);
		beforeUnloadHandler = null;
	}

	// 清理
	globalCacheManager.dispose();
	initialized = false;

	console.debug('[CacheLifecycle] 缓存系统已关闭');
}

/**
 * 获取缓存统计摘要
 */
export function getCacheStatsSummary(): string {
	const stats = globalCacheManager.getStats();
	const sizeMB = Math.round(stats.totalSize / 1024 / 1024 * 100) / 100;
	
	const lines = [
		`总缓存: ${stats.totalItems} 项, ${sizeMB}MB`,
		`命名空间: ${stats.namespaces.size} (持久化: ${stats.persistentNamespaces})`,
	];

	for (const [name, ns] of stats.namespaces) {
		const nsSizeMB = Math.round(ns.size / 1024 / 1024 * 100) / 100;
		const hitRatePct = Math.round(ns.hitRate * 100);
		lines.push(`  - ${name}: ${ns.items} 项, ${nsSizeMB}MB, 命中率 ${hitRatePct}%`);
	}

	return lines.join('\n');
}

/**
 * 清空所有缓存（包括持久化）
 */
export function clearAllCaches(): void {
	globalCacheManager.clearAll();
	console.debug('[CacheLifecycle] 所有缓存已清空');
}

/**
 * 手动触发过期清理
 */
export function triggerCleanup(): number {
	const cleaned = globalCacheManager.cleanupAllExpired();
	if (cleaned > 0) {
		console.debug(`[CacheLifecycle] 手动清理: ${cleaned} 项`);
	}
	return cleaned;
}
