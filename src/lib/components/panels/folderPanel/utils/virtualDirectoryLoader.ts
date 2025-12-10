/**
 * VirtualDirectoryLoader - 虚拟化分页目录加载器
 * 参考 Spacedrive 的虚拟化列表，实现按需分页加载
 * 只加载可见范围 + 预加载区域，大幅提升大目录性能
 */

import * as FileSystemAPI from '$lib/api/filesystem';
import type { FsItem } from '$lib/types';

export interface LoadPageResult {
	items: FsItem[];
	total: number;
	hasMore: boolean;
	page: number;
}

export interface VirtualLoaderConfig {
	pageSize: number;
	preloadPages: number; // 可见范围外预加载的页数
}

const DEFAULT_CONFIG: VirtualLoaderConfig = {
	pageSize: 100,     // 每页100项
	preloadPages: 1,   // 预加载前后各1页
};

export class VirtualDirectoryLoader {
	private config: VirtualLoaderConfig;
	private path: string;
	private cache = new Map<number, FsItem[]>();  // 页号 -> 项目列表
	private totalItems = 0;
	private totalPages = 0;
	private loadingPages = new Set<number>();
	
	constructor(path: string, config: Partial<VirtualLoaderConfig> = {}) {
		this.path = path;
		this.config = { ...DEFAULT_CONFIG, ...config };
	}
	
	/**
	 * 获取总项数
	 */
	getTotal(): number {
		return this.totalItems;
	}
	
	/**
	 * 获取总页数
	 */
	getTotalPages(): number {
		return this.totalPages;
	}
	
	/**
	 * 加载指定页
	 */
	async loadPage(page: number): Promise<LoadPageResult> {
		// 检查缓存
		if (this.cache.has(page)) {
			return {
				items: this.cache.get(page)!,
				total: this.totalItems,
				hasMore: page < this.totalPages - 1,
				page,
			};
		}
		
		// 检查是否正在加载
		if (this.loadingPages.has(page)) {
			// 等待加载完成
			return this.waitForPageLoad(page);
		}
		
		// 开始加载
		this.loadingPages.add(page);
		
		try {
			const offset = page * this.config.pageSize;
			const result = await FileSystemAPI.browseDirectoryPage(this.path, {
				offset,
				limit: this.config.pageSize,
			});
			
			// 更新总数信息
			this.totalItems = result.total;
			this.totalPages = Math.ceil(result.total / this.config.pageSize);
			
			// 缓存结果
			this.cache.set(page, result.items);
			this.loadingPages.delete(page);
			
			return {
				items: result.items,
				total: result.total,
				hasMore: result.hasMore,
				page,
			};
		} catch (error) {
			this.loadingPages.delete(page);
			throw error;
		}
	}
	
	/**
	 * 等待页面加载完成
	 */
	private async waitForPageLoad(page: number): Promise<LoadPageResult> {
		return new Promise((resolve) => {
			const checkInterval = setInterval(() => {
				if (this.cache.has(page)) {
					clearInterval(checkInterval);
					resolve({
						items: this.cache.get(page)!,
						total: this.totalItems,
						hasMore: page < this.totalPages - 1,
						page,
					});
				}
			}, 50);
			
			// 超时保护
			setTimeout(() => {
				clearInterval(checkInterval);
				resolve({
					items: [],
					total: 0,
					hasMore: false,
					page,
				});
			}, 5000);
		});
	}
	
	/**
	 * 批量加载多页（并发）
	 */
	async loadPages(pages: number[]): Promise<Map<number, FsItem[]>> {
		const results = new Map<number, FsItem[]>();
		
		// 过滤掉已缓存的页
		const needLoad = pages.filter(p => !this.cache.has(p) && !this.loadingPages.has(p));
		
		if (needLoad.length === 0) {
			// 全部命中缓存
			pages.forEach(p => {
				if (this.cache.has(p)) {
					results.set(p, this.cache.get(p)!);
				}
			});
			return results;
		}
		
		// 并发加载
		const loadPromises = needLoad.map(p => this.loadPage(p));
		await Promise.all(loadPromises);
		
		// 收集结果
		pages.forEach(p => {
			if (this.cache.has(p)) {
				results.set(p, this.cache.get(p)!);
			}
		});
		
		return results;
	}
	
	/**
	 * 根据可见范围加载页面
	 * @param visibleStart 可见起始索引（全局索引，非页内索引）
	 * @param visibleEnd 可见结束索引（全局索引）
	 */
	async loadVisibleRange(visibleStart: number, visibleEnd: number): Promise<FsItem[]> {
		const startPage = Math.floor(visibleStart / this.config.pageSize);
		const endPage = Math.floor(visibleEnd / this.config.pageSize);
		
		// 计算需要加载的页（包括预加载）
		const preload = this.config.preloadPages;
		const pagesToLoad: number[] = [];
		
		for (let p = Math.max(0, startPage - preload); p <= Math.min(this.totalPages - 1, endPage + preload); p++) {
			pagesToLoad.push(p);
		}
		
		// 批量加载
		const results = await this.loadPages(pagesToLoad);
		
		// 合并结果
		const allItems: FsItem[] = [];
		for (let p = 0; p < this.totalPages; p++) {
			if (results.has(p)) {
				allItems.push(...results.get(p)!);
			}
		}
		
		return allItems;
	}
	
	/**
	 * 获取指定范围的项（从缓存）
	 */
	getItemsInRange(start: number, end: number): FsItem[] {
		const startPage = Math.floor(start / this.config.pageSize);
		const endPage = Math.floor(end / this.config.pageSize);
		
		const items: FsItem[] = [];
		for (let p = startPage; p <= endPage; p++) {
			if (this.cache.has(p)) {
				items.push(...this.cache.get(p)!);
			}
		}
		
		// 截取精确范围
		const startOffset = start % this.config.pageSize;
		const totalNeeded = end - start + 1;
		return items.slice(startOffset, startOffset + totalNeeded);
	}
	
	/**
	 * 获取所有已加载的项
	 */
	getAllLoadedItems(): FsItem[] {
		const allItems: FsItem[] = [];
		const pages = Array.from(this.cache.keys()).sort((a, b) => a - b);
		
		for (const page of pages) {
			allItems.push(...this.cache.get(page)!);
		}
		
		return allItems;
	}
	
	/**
	 * 清除缓存
	 */
	clear() {
		this.cache.clear();
		this.loadingPages.clear();
		this.totalItems = 0;
		this.totalPages = 0;
	}
	
	/**
	 * 获取缓存统计
	 */
	getStats() {
		return {
			path: this.path,
			cachedPages: this.cache.size,
			totalPages: this.totalPages,
			totalItems: this.totalItems,
			loadingPages: this.loadingPages.size,
			pageSize: this.config.pageSize,
		};
	}
}
