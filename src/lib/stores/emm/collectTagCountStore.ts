/**
 * 收藏标签匹配数缓存模块
 * - 缓存每个文件夹匹配的收藏标签数量
 * - 支持批量查询和更新
 * - 与 favoriteTagStore 配合使用
 */

import { writable, get } from 'svelte/store';
import { invoke } from '$lib/api/adapter';
import { favoriteTagStore, mixedGenderStore } from './favoriteTagStore.svelte';

// 缓存结构
interface CollectTagCountCache {
	counts: Map<string, number>;
	lastUpdated: number;
}

const { subscribe, set, update } = writable<CollectTagCountCache>({
	counts: new Map(),
	lastUpdated: 0
});

// 规范化路径（统一小写和斜杠）
function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').toLowerCase();
}

export const collectTagCountStore = {
	subscribe,

	/**
	 * 获取文件夹的收藏标签匹配数（同步）
	 */
	getCount(folderPath: string): number {
		const cache = get({ subscribe });
		const key = normalizePath(folderPath);
		return cache.counts.get(key) ?? 0;
	},

	/**
	 * 检查是否有缓存数据
	 */
	hasCount(folderPath: string): boolean {
		const cache = get({ subscribe });
		const key = normalizePath(folderPath);
		return cache.counts.has(key);
	},

	/**
	 * 批量加载文件夹的收藏标签匹配数
	 */
	async loadCounts(folderPaths: string[]): Promise<void> {
		const favTags = favoriteTagStore.tags;
		if (favTags.length === 0) return;
		if (folderPaths.length === 0) return;

		try {
			const collectTags: [string, string][] = favTags.map((t) => [t.cat, t.tag]);
			const enableMixed = mixedGenderStore.enabled;

			const countResults = await invoke<[string, number][]>('batch_count_matching_collect_tags', {
				keys: folderPaths,
				collectTags,
				enableMixedGender: enableMixed
			});

			// 更新缓存
			update(cache => {
				const newCounts = new Map(cache.counts);
				for (const [path, count] of countResults) {
					newCounts.set(normalizePath(path), count);
				}
				return {
					counts: newCounts,
					lastUpdated: Date.now()
				};
			});
		} catch (e) {
			console.warn('[CollectTagCountStore] 加载收藏标签数失败:', e);
		}
	},

	/**
	 * 清除缓存
	 */
	clear(): void {
		set({
			counts: new Map(),
			lastUpdated: 0
		});
	},

	/**
	 * 设置单个路径的收藏标签匹配数（前端计算后直接更新缓存）
	 * 注意：只在值真正变化时更新，避免无限循环
	 */
	setCount(path: string, count: number): void {
		const key = normalizePath(path);
		const cache = get({ subscribe });
		
		// 如果值没有变化，不触发更新
		if (cache.counts.get(key) === count) {
			return;
		}
		
		update(c => {
			const newCounts = new Map(c.counts);
			newCounts.set(key, count);
			return {
				counts: newCounts,
				lastUpdated: Date.now()
			};
		});
	},

	/**
	 * 获取缓存统计信息
	 */
	getStats(): { count: number; lastUpdated: number } {
		const cache = get({ subscribe });
		return {
			count: cache.counts.size,
			lastUpdated: cache.lastUpdated
		};
	}
};
