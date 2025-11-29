/**
 * 文件夹平均评分计算和缓存模块
 * - 在加载 EMM 数据库时计算每个文件夹的平均评分
 * - 持久化到 localStorage 的 JSON
 * - 支持增量更新（当数据库条目数增加时）
 * - 可导出和恢复
 */

import { writable, get, derived } from 'svelte/store';
import type { FolderRatingCache, FolderRatingEntry } from './types';
import { invoke } from '@tauri-apps/api/core';

const STORAGE_KEY = 'neoview-emm-folder-ratings';
const CACHE_VERSION = 1;

// 内存中的评分缓存
const { subscribe, set, update } = writable<FolderRatingCache>({
	version: CACHE_VERSION,
	databaseEntryCount: {},
	ratings: {},
	lastUpdated: 0
});

// 加载持久化的缓存
function loadFromStorage(): FolderRatingCache {
	if (typeof window === 'undefined' || !window.localStorage) {
		return {
			version: CACHE_VERSION,
			databaseEntryCount: {},
			ratings: {},
			lastUpdated: 0
		};
	}

	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored) as FolderRatingCache;
			// 版本检查
			if (parsed.version === CACHE_VERSION) {
				console.debug('[FolderRating] 从 localStorage 加载评分缓存:', Object.keys(parsed.ratings).length, '个文件夹');
				return parsed;
			}
		}
	} catch (error) {
		console.error('[FolderRating] 加载评分缓存失败:', error);
	}

	return {
		version: CACHE_VERSION,
		databaseEntryCount: {},
		ratings: {},
		lastUpdated: 0
	};
}

// 保存到持久化存储
function saveToStorage(cache: FolderRatingCache): void {
	if (typeof window === 'undefined' || !window.localStorage) return;

	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
		console.debug('[FolderRating] 评分缓存已保存:', Object.keys(cache.ratings).length, '个文件夹');
	} catch (error) {
		console.error('[FolderRating] 保存评分缓存失败:', error);
	}
}

// 规范化路径（用于一致的键名）
function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').toLowerCase();
}

// 获取父目录路径
function getParentPath(filePath: string): string | null {
	const normalized = normalizePath(filePath);
	const lastSlash = normalized.lastIndexOf('/');
	if (lastSlash <= 0) return null;
	return normalized.substring(0, lastSlash);
}

export const folderRatingStore = {
	subscribe,

	/**
	 * 初始化：从 localStorage 加载缓存
	 */
	initialize(): void {
		const cached = loadFromStorage();
		set(cached);
	},

	/**
	 * 获取文件夹的平均评分
	 */
	getFolderRating(folderPath: string): FolderRatingEntry | null {
		const cache = get({ subscribe });
		const key = normalizePath(folderPath);
		return cache.ratings[key] || null;
	},

	/**
	 * 计算并缓存所有文件夹的平均评分
	 * @param dbPath 数据库路径
	 * @param forceRecalculate 是否强制重新计算
	 */
	async calculateFolderRatings(dbPath: string, forceRecalculate = false): Promise<void> {
		console.debug('[FolderRating] 开始计算文件夹评分，数据库:', dbPath);

		try {
			// 获取数据库中所有条目的评分和路径
			const entries = await invoke<Array<{ filepath: string; rating: number | null }>>('get_emm_all_ratings', {
				dbPath
			});

			if (!entries || entries.length === 0) {
				console.debug('[FolderRating] 数据库中没有条目');
				return;
			}

			const currentCache = get({ subscribe });
			const currentCount = currentCache.databaseEntryCount[dbPath] || 0;

			// 检查是否需要重新计算
			if (!forceRecalculate && currentCount === entries.length) {
				console.debug('[FolderRating] 数据库条目数未变化，跳过计算');
				return;
			}

			console.debug(`[FolderRating] 处理 ${entries.length} 个条目 (之前: ${currentCount})`);

			// 第一轮：按直接文件夹分组计算平均评分
			const folderStats = new Map<string, { sum: number; count: number }>();

			for (const entry of entries) {
				if (entry.filepath && entry.rating !== null && entry.rating > 0) {
					const parentPath = getParentPath(entry.filepath);
					if (parentPath) {
						const existing = folderStats.get(parentPath) || { sum: 0, count: 0 };
						existing.sum += entry.rating;
						existing.count += 1;
						folderStats.set(parentPath, existing);
					}
				}
			}

			// 构建初始评分缓存（有直接文件评分的文件夹）
			const now = Date.now();
			const newRatings: Record<string, FolderRatingEntry> = {};

			for (const [path, stats] of folderStats) {
				if (stats.count > 0) {
					newRatings[path] = {
						path,
						averageRating: stats.sum / stats.count,
						count: stats.count,
						lastUpdated: now
					};
				}
			}

			// 第二轮：为没有直接文件评分的父文件夹计算子文件夹平均评分
			// 收集所有需要计算的父文件夹
			const allPaths = new Set<string>();
			for (const path of folderStats.keys()) {
				let current = path;
				while (current) {
					allPaths.add(current);
					const parent = getParentPath(current);
					if (!parent) break;
					current = parent;
				}
			}

			// 按路径深度排序（深的先处理）
			const sortedPaths = Array.from(allPaths).sort((a, b) => {
				const depthA = a.split('/').length;
				const depthB = b.split('/').length;
				return depthB - depthA; // 深度大的在前
			});

			// 从深到浅计算：如果父文件夹没有直接评分，使用子文件夹评分
			for (const path of sortedPaths) {
				if (newRatings[path]) continue; // 已有直接评分

				// 查找直接子文件夹的评分
				const childRatings: number[] = [];
				for (const [childPath, entry] of Object.entries(newRatings)) {
					const childParent = getParentPath(childPath);
					if (childParent === path) {
						childRatings.push(entry.averageRating);
					}
				}

				if (childRatings.length > 0) {
					const avgRating = childRatings.reduce((a, b) => a + b, 0) / childRatings.length;
					newRatings[path] = {
						path,
						averageRating: avgRating,
						count: childRatings.length, // 子文件夹数量
						lastUpdated: now
					};
				}
			}

			// 更新缓存
			update(cache => {
				const newCache = {
					...cache,
					databaseEntryCount: {
						...cache.databaseEntryCount,
						[dbPath]: entries.length
					},
					ratings: {
						...cache.ratings,
						...newRatings
					},
					lastUpdated: now
				};
				saveToStorage(newCache);
				return newCache;
			});

			console.debug(`[FolderRating] 计算完成，${Object.keys(newRatings).length} 个文件夹有评分`);
		} catch (error) {
			console.error('[FolderRating] 计算文件夹评分失败:', error);
		}
	},

	/**
	 * 清除缓存
	 */
	clearCache(): void {
		const emptyCache: FolderRatingCache = {
			version: CACHE_VERSION,
			databaseEntryCount: {},
			ratings: {},
			lastUpdated: 0
		};
		set(emptyCache);
		saveToStorage(emptyCache);
	},

	/**
	 * 导出缓存数据（用于设置导出）
	 */
	exportCache(): FolderRatingCache {
		return get({ subscribe });
	},

	/**
	 * 导入缓存数据（用于设置恢复）
	 */
	importCache(data: FolderRatingCache): void {
		if (data && data.version === CACHE_VERSION) {
			set(data);
			saveToStorage(data);
			console.debug('[FolderRating] 评分缓存已导入:', Object.keys(data.ratings).length, '个文件夹');
		} else {
			console.warn('[FolderRating] 导入数据版本不匹配或无效');
		}
	}
};

// 导出派生 store，用于获取特定文件夹的评分
export function getFolderRatingStore(folderPath: string) {
	return derived({ subscribe }, ($cache) => {
		const key = normalizePath(folderPath);
		return $cache.ratings[key] || null;
	});
}
