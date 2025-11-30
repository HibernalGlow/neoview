/**
 * Rating 缓存管理器
 * 提供快速的 rating 获取，支持：
 * 1. 内存缓存（最快）
 * 2. 独立 rating 字段（快速 SQL 查询）
 * 3. emm_json 回退（兼容旧数据）
 */

import { invoke } from '@tauri-apps/api/core';
import type { EMMCacheEntry } from './emmSyncService';

// ==================== 类型定义 ====================

export interface RatingInfo {
	rating?: number;        // EMM 原始评分
	manualRating?: number;  // 手动评分
	folderAvgRating?: number; // 文件夹平均评分
	effectiveRating?: number; // 有效评分（手动 > 原始 > 文件夹）
}

interface CacheEntry {
	rating: RatingInfo;
	timestamp: number;
}

// ==================== 配置 ====================

const CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存有效期
const MAX_CACHE_SIZE = 5000;     // 最大缓存条目数

// ==================== 内存缓存 ====================

class RatingCache {
	private cache = new Map<string, CacheEntry>();
	private accessOrder: string[] = [];

	/**
	 * 获取单个 rating（带缓存）
	 */
	async getRating(pathKey: string): Promise<RatingInfo> {
		// 1. 检查内存缓存
		const cached = this.cache.get(pathKey);
		if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
			return cached.rating;
		}

		// 2. 从独立字段获取
		try {
			const [rating, manualRating, folderAvgRating] = await invoke<[number | null, number | null, number | null]>(
				'get_rating',
				{ path: pathKey }
			);

			const ratingInfo: RatingInfo = {
				rating: rating ?? undefined,
				manualRating: manualRating ?? undefined,
				folderAvgRating: folderAvgRating ?? undefined,
				effectiveRating: this.calculateEffectiveRating(rating, manualRating, folderAvgRating)
			};

			// 如果独立字段有数据，直接返回
			if (rating !== null || manualRating !== null || folderAvgRating !== null) {
				this.setCache(pathKey, ratingInfo);
				return ratingInfo;
			}
		} catch (e) {
			console.debug('[RatingCache] 从独立字段获取失败:', e);
		}

		// 3. 从 emm_json 回退
		try {
			const emmJson = await invoke<string | null>('get_emm_json', { path: pathKey });
			if (emmJson) {
				const emmData = JSON.parse(emmJson) as EMMCacheEntry;
				const ratingInfo: RatingInfo = {
					rating: emmData.rating,
					manualRating: emmData.manual_rating,
					folderAvgRating: emmData.folder_avg_rating,
					effectiveRating: this.calculateEffectiveRating(
						emmData.rating ?? null,
						emmData.manual_rating ?? null,
						emmData.folder_avg_rating ?? null
					)
				};
				this.setCache(pathKey, ratingInfo);
				return ratingInfo;
			}
		} catch (e) {
			console.debug('[RatingCache] 从 emm_json 获取失败:', e);
		}

		// 4. 没有数据
		const emptyInfo: RatingInfo = {};
		this.setCache(pathKey, emptyInfo);
		return emptyInfo;
	}

	/**
	 * 批量获取 rating（优化版）
	 */
	async batchGetRatings(pathKeys: string[]): Promise<Map<string, RatingInfo>> {
		const result = new Map<string, RatingInfo>();
		const uncachedKeys: string[] = [];

		// 1. 先从缓存获取
		for (const key of pathKeys) {
			const cached = this.cache.get(key);
			if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
				result.set(key, cached.rating);
			} else {
				uncachedKeys.push(key);
			}
		}

		if (uncachedKeys.length === 0) {
			return result;
		}

		// 2. 批量从独立字段获取
		try {
			const dbRatings = await invoke<Record<string, [number | null, number | null, number | null]>>(
				'batch_get_ratings',
				{ paths: uncachedKeys }
			);

			const stillMissingKeys: string[] = [];

			for (const key of uncachedKeys) {
				const dbData = dbRatings[key];
				if (dbData && (dbData[0] !== null || dbData[1] !== null || dbData[2] !== null)) {
					const ratingInfo: RatingInfo = {
						rating: dbData[0] ?? undefined,
						manualRating: dbData[1] ?? undefined,
						folderAvgRating: dbData[2] ?? undefined,
						effectiveRating: this.calculateEffectiveRating(dbData[0], dbData[1], dbData[2])
					};
					result.set(key, ratingInfo);
					this.setCache(key, ratingInfo);
				} else {
					stillMissingKeys.push(key);
				}
			}

			// 3. 对于仍然没有数据的，尝试从 emm_json 回退
			if (stillMissingKeys.length > 0) {
				const emmJsonMap = await invoke<Record<string, string>>('batch_get_emm_json', { paths: stillMissingKeys });

				for (const key of stillMissingKeys) {
					const emmJson = emmJsonMap[key];
					if (emmJson) {
						try {
							const emmData = JSON.parse(emmJson) as EMMCacheEntry;
							const ratingInfo: RatingInfo = {
								rating: emmData.rating,
								manualRating: emmData.manual_rating,
								folderAvgRating: emmData.folder_avg_rating,
								effectiveRating: this.calculateEffectiveRating(
									emmData.rating ?? null,
									emmData.manual_rating ?? null,
									emmData.folder_avg_rating ?? null
								)
							};
							result.set(key, ratingInfo);
							this.setCache(key, ratingInfo);
						} catch {
							// 解析失败，设置空
							result.set(key, {});
							this.setCache(key, {});
						}
					} else {
						result.set(key, {});
						this.setCache(key, {});
					}
				}
			}
		} catch (e) {
			console.error('[RatingCache] 批量获取失败:', e);
			// 设置空值避免重复请求
			for (const key of uncachedKeys) {
				if (!result.has(key)) {
					result.set(key, {});
					this.setCache(key, {});
				}
			}
		}

		return result;
	}

	/**
	 * 更新手动评分
	 */
	async updateManualRating(pathKey: string, manualRating: number): Promise<boolean> {
		try {
			// 获取当前 rating
			const current = await this.getRating(pathKey);

			// 更新数据库
			await invoke('update_rating', {
				path: pathKey,
				rating: current.rating ?? null,
				manualRating
			});

			// 更新缓存
			const newInfo: RatingInfo = {
				...current,
				manualRating,
				effectiveRating: this.calculateEffectiveRating(
					current.rating ?? null,
					manualRating,
					current.folderAvgRating ?? null
				)
			};
			this.setCache(pathKey, newInfo);

			return true;
		} catch (e) {
			console.error('[RatingCache] 更新手动评分失败:', e);
			return false;
		}
	}

	/**
	 * 更新文件夹平均评分
	 */
	async updateFolderAvgRating(pathKey: string, avgRating: number): Promise<boolean> {
		try {
			await invoke('update_folder_avg_rating', {
				path: pathKey,
				avgRating
			});

			// 更新缓存
			const current = this.cache.get(pathKey)?.rating || {};
			const newInfo: RatingInfo = {
				...current,
				folderAvgRating: avgRating,
				effectiveRating: this.calculateEffectiveRating(
					current.rating ?? null,
					current.manualRating ?? null,
					avgRating
				)
			};
			this.setCache(pathKey, newInfo);

			return true;
		} catch (e) {
			console.error('[RatingCache] 更新文件夹评分失败:', e);
			return false;
		}
	}

	/**
	 * 计算目录下所有文件的平均评分
	 */
	async calculateFolderAvgRating(dirPath: string): Promise<number | null> {
		try {
			const ratings = await invoke<[string, number | null, number | null][]>(
				'get_ratings_by_prefix',
				{ prefix: dirPath }
			);

			if (ratings.length === 0) {
				return null;
			}

			let sum = 0;
			let count = 0;

			for (const [, rating, manualRating] of ratings) {
				// 优先使用手动评分
				const effectiveRating = manualRating ?? rating;
				if (effectiveRating !== null) {
					sum += effectiveRating;
					count++;
				}
			}

			return count > 0 ? sum / count : null;
		} catch (e) {
			console.error('[RatingCache] 计算文件夹平均评分失败:', e);
			return null;
		}
	}

	/**
	 * 批量计算并更新文件夹评分
	 */
	async batchUpdateFolderRatings(dirPaths: string[]): Promise<number> {
		const entries: [string, number | null][] = [];

		for (const dirPath of dirPaths) {
			const avgRating = await this.calculateFolderAvgRating(dirPath);
			entries.push([dirPath, avgRating]);

			// 更新缓存
			if (avgRating !== null) {
				const current = this.cache.get(dirPath)?.rating || {};
				this.setCache(dirPath, {
					...current,
					folderAvgRating: avgRating,
					effectiveRating: this.calculateEffectiveRating(
						current.rating ?? null,
						current.manualRating ?? null,
						avgRating
					)
				});
			}
		}

		try {
			return await invoke<number>('batch_update_folder_ratings', { entries });
		} catch (e) {
			console.error('[RatingCache] 批量更新文件夹评分失败:', e);
			return 0;
		}
	}

	/**
	 * 清除缓存
	 */
	clearCache() {
		this.cache.clear();
		this.accessOrder = [];
	}

	/**
	 * 清除指定路径的缓存
	 */
	invalidate(pathKey: string) {
		this.cache.delete(pathKey);
		this.accessOrder = this.accessOrder.filter(k => k !== pathKey);
	}

	/**
	 * 清除指定目录下的缓存
	 */
	invalidateByPrefix(prefix: string) {
		for (const key of this.cache.keys()) {
			if (key.startsWith(prefix)) {
				this.cache.delete(key);
			}
		}
		this.accessOrder = this.accessOrder.filter(k => !k.startsWith(prefix));
	}

	// ==================== 私有方法 ====================

	private setCache(pathKey: string, rating: RatingInfo) {
		// LRU 淘汰
		if (this.cache.size >= MAX_CACHE_SIZE && !this.cache.has(pathKey)) {
			const oldest = this.accessOrder.shift();
			if (oldest) {
				this.cache.delete(oldest);
			}
		}

		this.cache.set(pathKey, {
			rating,
			timestamp: Date.now()
		});

		// 更新访问顺序
		const idx = this.accessOrder.indexOf(pathKey);
		if (idx !== -1) {
			this.accessOrder.splice(idx, 1);
		}
		this.accessOrder.push(pathKey);
	}

	private calculateEffectiveRating(
		rating: number | null,
		manualRating: number | null,
		folderAvgRating: number | null
	): number | undefined {
		// 优先级：手动评分 > EMM 原始评分 > 文件夹平均评分
		if (manualRating !== null) return manualRating;
		if (rating !== null) return rating;
		if (folderAvgRating !== null) return folderAvgRating;
		return undefined;
	}
}

// ==================== 导出单例 ====================

export const ratingCache = new RatingCache();

// ==================== 辅助函数 ====================

/**
 * 获取用于排序的评分值
 */
export function getSortableRating(info: RatingInfo, defaultValue = 0): number {
	return info.effectiveRating ?? defaultValue;
}

/**
 * 比较两个路径的评分（用于排序）
 */
export async function compareByRating(
	pathA: string,
	pathB: string,
	ascending = false
): Promise<number> {
	const ratings = await ratingCache.batchGetRatings([pathA, pathB]);
	const ratingA = getSortableRating(ratings.get(pathA) || {});
	const ratingB = getSortableRating(ratings.get(pathB) || {});

	const diff = ratingA - ratingB;
	return ascending ? diff : -diff;
}
