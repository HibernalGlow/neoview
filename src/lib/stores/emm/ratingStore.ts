/**
 * 评分存储模块
 * - 从缩略图数据库读写 rating_data（JSON 格式）
 * - 计算文件夹平均评分
 * - 支持手动设置评分
 */

import { writable, get } from 'svelte/store';
import { invoke } from '$lib/api/adapter';
import type { RatingData } from './types';

// 内存缓存
const ratingCache = writable<Map<string, RatingData | null>>(new Map());

/**
 * 规范化路径（统一使用反斜杠格式，与缩略图数据库一致）
 */
function normalizePath(path: string): string {
	if (!path) return path;
	// 统一使用反斜杠（Windows 格式）
	let normalized = path.replace(/\//g, '\\');
	// 确保盘符后有反斜杠
	normalized = normalized.replace(/^([a-zA-Z]):(?!\\)/, '$1:\\');
	// 去除末尾斜杠
	if (normalized.length > 3 && normalized.endsWith('\\')) {
		normalized = normalized.slice(0, -1);
	}
	return normalized;
}

/**
 * 解析 rating_data JSON
 */
function parseRatingData(json: string | null | undefined): RatingData | null {
	if (!json) return null;
	try {
		return JSON.parse(json) as RatingData;
	} catch {
		return null;
	}
}

/**
 * 序列化 rating_data
 */
function stringifyRatingData(data: RatingData): string {
	return JSON.stringify(data);
}

export const ratingStore = {
	subscribe: ratingCache.subscribe,

	/**
	 * 从缩略图数据库获取单个路径的评分
	 */
	async getRating(path: string): Promise<RatingData | null> {
		const normalizedPath = normalizePath(path);
		
		// 先检查缓存
		const cache = get(ratingCache);
		if (cache.has(normalizedPath)) {
			return cache.get(normalizedPath) ?? null;
		}

		try {
			const json = await invoke<string | null>('get_rating_data', { path: normalizedPath });
			const rating = parseRatingData(json);
			
			// 更新缓存
			ratingCache.update(c => {
				c.set(normalizedPath, rating);
				return c;
			});
			
			return rating;
		} catch (e) {
			console.error('[RatingStore] 获取评分失败:', normalizedPath, e);
			return null;
		}
	},

	/**
	 * 批量获取评分
	 */
	async batchGetRatings(paths: string[]): Promise<Map<string, RatingData | null>> {
		const normalizedPaths = paths.map(normalizePath);
		const result = new Map<string, RatingData | null>();
		
		try {
			const data = await invoke<Record<string, string | null>>('batch_get_rating_data', { 
				paths: normalizedPaths 
			});
			
			for (const [path, json] of Object.entries(data)) {
				const rating = parseRatingData(json);
				result.set(path, rating);
				
				// 更新缓存
				ratingCache.update(c => {
					c.set(path, rating);
					return c;
				});
			}
		} catch (e) {
			console.error('[RatingStore] 批量获取评分失败:', e);
		}
		
		return result;
	},

	/**
	 * 设置评分（手动评分）
	 */
	async setRating(path: string, value: number): Promise<boolean> {
		const normalizedPath = normalizePath(path);
		
		const ratingData: RatingData = {
			value,
			source: 'manual',
			timestamp: Date.now()
		};
		
		try {
			await invoke('update_rating_data', { 
				path: normalizedPath, 
				ratingData: stringifyRatingData(ratingData) 
			});
			
			// 更新缓存
			ratingCache.update(c => {
				c.set(normalizedPath, ratingData);
				return c;
			});
			
			console.debug('[RatingStore] 设置评分成功:', normalizedPath, value);
			return true;
		} catch (e) {
			console.error('[RatingStore] 设置评分失败:', normalizedPath, e);
			return false;
		}
	},

	/**
	 * 清除评分
	 */
	async clearRating(path: string): Promise<boolean> {
		const normalizedPath = normalizePath(path);
		
		try {
			await invoke('update_rating_data', { 
				path: normalizedPath, 
				ratingData: null 
			});
			
			// 更新缓存
			ratingCache.update(c => {
				c.set(normalizedPath, null);
				return c;
			});
			
			return true;
		} catch (e) {
			console.error('[RatingStore] 清除评分失败:', normalizedPath, e);
			return false;
		}
	},

	/**
	 * 计算文件夹的平均评分（从子条目计算）
	 */
	async calculateFolderRating(folderPath: string): Promise<RatingData | null> {
		const normalizedPath = normalizePath(folderPath);
		
		try {
			// 获取该文件夹下所有条目的 rating_data
			const entries = await invoke<Array<[string, string | null]>>('get_rating_data_by_prefix', { 
				prefix: normalizedPath + '\\' 
			});
			
			if (!entries || entries.length === 0) {
				return null;
			}
			
			// 解析并计算平均值（只计算直接子项，不递归）
			let sum = 0;
			let count = 0;
			
			for (const [entryPath, json] of entries) {
				// 只计算直接子项（不包含更深层的）
				const relativePath = entryPath.substring(normalizedPath.length + 1);
				if (relativePath.includes('\\')) continue; // 跳过更深层的
				
				const rating = parseRatingData(json);
				if (rating && rating.value > 0) {
					sum += rating.value;
					count++;
				}
			}
			
			if (count === 0) return null;
			
			const avgRating: RatingData = {
				value: sum / count,
				source: 'calculated',
				timestamp: Date.now(),
				childCount: count
			};
			
			// 保存到数据库
			await invoke('update_rating_data', { 
				path: normalizedPath, 
				ratingData: stringifyRatingData(avgRating) 
			});
			
			// 更新缓存
			ratingCache.update(c => {
				c.set(normalizedPath, avgRating);
				return c;
			});
			
			console.debug('[RatingStore] 计算文件夹评分:', normalizedPath, avgRating.value, `(${count}个子项)`);
			return avgRating;
		} catch (e) {
			console.error('[RatingStore] 计算文件夹评分失败:', normalizedPath, e);
			return null;
		}
	},

	/**
	 * 批量计算文件夹评分
	 */
	async batchCalculateFolderRatings(folderPaths: string[]): Promise<number> {
		let count = 0;
		for (const path of folderPaths) {
			const result = await this.calculateFolderRating(path);
			if (result) count++;
		}
		return count;
	},

	/**
	 * 获取有效评分值（返回数值）
	 */
	async getEffectiveRating(path: string): Promise<number | null> {
		const rating = await this.getRating(path);
		return rating?.value ?? null;
	},

	/**
	 * 同步获取评分（仅从内存缓存，不访问数据库）
	 * 用于排序时直接读取 Card 已加载的评分
	 */
	getRatingSync(path: string): RatingData | null {
		const normalizedPath = normalizePath(path);
		const cache = get(ratingCache);
		return cache.get(normalizedPath) ?? null;
	},

	/**
	 * 清除缓存
	 */
	clearCache(): void {
		ratingCache.set(new Map());
	}
};

// 导出类型
export type { RatingData };
