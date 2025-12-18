/**
 * 文件夹平均评分计算和缓存模块
 * - 在加载 EMM 数据库时计算每个文件夹的平均评分
 * - 持久化到 localStorage 的 JSON
 * - 支持增量更新（当数据库条目数增加时）
 * - 可导出和恢复
 */

import { writable, get, derived } from 'svelte/store';
import type { FolderRatingCache, FolderRatingEntry } from './types';
import { invoke } from '$lib/api/adapter';
import { ratingStore } from './ratingStore';

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
// 统一使用正斜杠小写格式
function normalizePath(path: string): string {
	if (!path) return path;
	let normalized = path.replace(/\\/g, '/').toLowerCase();
	// 确保盘符后有斜杠（处理 d:folder -> d:/folder）
	normalized = normalized.replace(/^([a-z]):(?!\/)/, '$1:/');
	// 去除末尾斜杠
	if (normalized.length > 3 && normalized.endsWith('/')) {
		normalized = normalized.slice(0, -1);
	}
	return normalized;
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
			// 收集所有需要计算的父文件夹（最多向上3层）
			const MAX_PARENT_LEVELS = 3;
			const allPaths = new Set<string>();
			for (const path of folderStats.keys()) {
				let current = path;
				let level = 0;
				while (current && level < MAX_PARENT_LEVELS) {
					allPaths.add(current);
					const parent = getParentPath(current);
					if (!parent) break;
					current = parent;
					level++;
				}
				// 添加最后一个父文件夹
				if (current) {
					allPaths.add(current);
				}
			}

			// 按路径深度排序（深的先处理）
			const sortedPaths = Array.from(allPaths).sort((a, b) => {
				const depthA = a.split('/').length;
				const depthB = b.split('/').length;
				return depthB - depthA; // 深度大的在前
			});

			// 多轮从深到浅计算：确保父文件夹可以聚合子文件夹评分
			// 最多进行 MAX_PARENT_LEVELS 轮迭代
			for (let round = 0; round < MAX_PARENT_LEVELS; round++) {
				let hasNewRatings = false;

				for (const path of sortedPaths) {
					if (newRatings[path]) continue; // 已有评分

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
						hasNewRatings = true;
					}
				}

				// 如果这一轮没有新评分产生，提前退出
				if (!hasNewRatings) break;
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
	},

	/**
	 * 设置文件夹的手动评分
	 * @param folderPath 文件夹路径
	 * @param rating 评分 (1-5)，null 表示清除手动评分
	 */
	setManualRating(folderPath: string, rating: number | null): void {
		const normalized = normalizePath(folderPath);
		const now = Date.now();

		update(cache => {
			const existing = cache.ratings[normalized];
			if (rating === null) {
				// 清除手动评分
				if (existing) {
					const { manualRating, ...rest } = existing;
					cache.ratings[normalized] = rest as FolderRatingEntry;
				}
			} else {
				// 设置手动评分
				if (existing) {
					cache.ratings[normalized] = { ...existing, manualRating: rating, lastUpdated: now };
				} else {
					cache.ratings[normalized] = {
						path: normalized,
						averageRating: 0,
						count: 0,
						lastUpdated: now,
						manualRating: rating
					};
				}
			}
			cache.lastUpdated = now;
			saveToStorage(cache);
			return cache;
		});
	},

	/**
	 * 获取有效评分（优先从 ratingStore 缓存获取，即 Card 已加载的评分）
	 */
	getEffectiveRating(folderPath: string): number | null {
		// 首先尝试从 ratingStore 缓存获取（Card 加载评分时会写入此缓存）
		const ratingData = ratingStore.getRatingSync(folderPath);
		if (ratingData?.value !== undefined) {
			return ratingData.value;
		}

		// 回退到旧的本地缓存（EMM 计算的平均评分）
		const entry = this.getFolderRating(folderPath);
		if (!entry) return null;
		return entry.manualRating ?? (entry.averageRating > 0 ? entry.averageRating : null);
	},

	/**
	 * 按路径补充评分：根据现有子文件夹评分计算父文件夹评分
	 * @param rootPath 根路径
	 * @param maxLevels 最多向上计算的层数
	 */
	calculateRatingsForPath(rootPath: string, maxLevels = 3): void {
		const normalized = normalizePath(rootPath);
		const currentCache = get({ subscribe });
		const now = Date.now();

		// 获取该路径下所有已有评分的子文件夹
		const childRatings: Record<string, FolderRatingEntry> = {};
		for (const [path, entry] of Object.entries(currentCache.ratings)) {
			if (path.startsWith(normalized + '/') || path === normalized) {
				childRatings[path] = entry;
			}
		}

		if (Object.keys(childRatings).length === 0) {
			console.debug('[FolderRating] 该路径下没有已有评分的文件夹:', rootPath);
			return;
		}

		console.debug(`[FolderRating] 开始补充 ${rootPath} 路径下的评分，已有 ${Object.keys(childRatings).length} 个文件夹有评分`);

		// 收集所有需要计算的父文件夹路径
		const allPaths = new Set<string>();
		for (const path of Object.keys(childRatings)) {
			let current = path;
			let level = 0;
			while (current && current.startsWith(normalized) && level <= maxLevels) {
				allPaths.add(current);
				const parent = getParentPath(current);
				if (!parent || !parent.startsWith(normalized.split('/')[0])) break;
				current = parent;
				level++;
			}
		}

		// 添加根路径本身
		allPaths.add(normalized);

		// 按路径深度排序（深的先处理）
		const sortedPaths = Array.from(allPaths).sort((a, b) => {
			const depthA = a.split('/').length;
			const depthB = b.split('/').length;
			return depthB - depthA;
		});

		const newRatings: Record<string, FolderRatingEntry> = { ...childRatings };

		// 多轮迭代计算
		for (let round = 0; round < maxLevels; round++) {
			let hasNewRatings = false;

			for (const path of sortedPaths) {
				if (newRatings[path]) continue;

				// 查找直接子文件夹的评分
				const childScores: number[] = [];
				for (const [childPath, entry] of Object.entries(newRatings)) {
					const childParent = getParentPath(childPath);
					if (childParent === path) {
						childScores.push(entry.averageRating);
					}
				}

				if (childScores.length > 0) {
					const avgRating = childScores.reduce((a, b) => a + b, 0) / childScores.length;
					newRatings[path] = {
						path,
						averageRating: avgRating,
						count: childScores.length,
						lastUpdated: now
					};
					hasNewRatings = true;
				}
			}

			if (!hasNewRatings) break;
		}

		// 计算新增了多少评分
		const newCount = Object.keys(newRatings).length - Object.keys(childRatings).length;

		// 更新缓存
		update(cache => {
			const newCache = {
				...cache,
				ratings: {
					...cache.ratings,
					...newRatings
				},
				lastUpdated: now
			};
			saveToStorage(newCache);
			return newCache;
		});

		console.debug(`[FolderRating] 补充完成，新增 ${newCount} 个文件夹评分`);
	}
};

// 导出派生 store，用于获取特定文件夹的评分
export function getFolderRatingStore(folderPath: string) {
	return derived({ subscribe }, ($cache) => {
		const key = normalizePath(folderPath);
		return $cache.ratings[key] || null;
	});
}
