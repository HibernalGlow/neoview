/**
 * NeoView - Book API
 * 书籍管理相关的前端 API 封装
 */

import { invoke } from '@tauri-apps/api/core';
import type { BookInfo, PageSortMode, MediaPriorityMode } from '../types';

export async function openBook(path: string): Promise<BookInfo> {
	return await invoke<BookInfo>('open_book', { path });
}

export async function closeBook(): Promise<void> {
	return await invoke('close_book');
}

export async function getCurrentBook(): Promise<BookInfo | null> {
	return await invoke<BookInfo | null>('get_current_book');
}

export async function navigateToPage(pageIndex: number): Promise<void> {
	return await invoke('navigate_to_page', { pageIndex });
}

export async function nextPage(): Promise<number> {
	return await invoke<number>('next_page');
}

export async function previousPage(): Promise<number> {
	return await invoke<number>('previous_page');
}

export async function navigateToImage(imagePath: string): Promise<number> {
	return await invoke<number>('navigate_to_image', { imagePath });
}

export async function setBookSortMode(sortMode: PageSortMode): Promise<BookInfo> {
	return await invoke<BookInfo>('set_book_sort_mode', { sortMode });
}

export async function setMediaPriorityMode(mode: MediaPriorityMode): Promise<BookInfo> {
	return await invoke<BookInfo>('set_media_priority_mode', { mode });
}

// ============================================================================
// 缓存管理 API
// ============================================================================

/** 缓存统计信息 */
export interface CacheStats {
	memory_count: number;
	memory_size: number;
	disk_count: number;
	disk_size: number;
	hits: number;
	misses: number;
	hit_rate: number;
}

/** 加载性能指标 */
export interface LoadMetrics {
	index_load_ms: number;
	first_page_ms: number;
	full_list_ms: number;
	total_ms: number;
	page_count: number;
	cache_hit: boolean;
}

/** 缓存状态响应 */
export interface CacheStatusResponse {
	index_cache: CacheStats;
	preheat_queue_size: number;
	last_load_metrics: LoadMetrics | null;
}

/** 获取缓存状态 */
export async function getCacheStats(): Promise<CacheStatusResponse> {
	return await invoke<CacheStatusResponse>('get_cache_stats');
}

/** 清除索引缓存 */
export async function clearIndexCache(): Promise<void> {
	return await invoke('clear_index_cache');
}

/** 使指定压缩包的缓存失效 */
export async function invalidateArchiveCache(path: string): Promise<void> {
	return await invoke('invalidate_archive_cache', { path });
}

/** 预热相邻压缩包 */
export async function preheatAdjacentArchives(path: string): Promise<void> {
	return await invoke('preheat_adjacent_archives', { path });
}

/** 取消预热任务 */
export async function cancelPreheat(): Promise<void> {
	return await invoke('cancel_preheat');
}

/** 取消当前加载 */
export async function cancelCurrentLoad(): Promise<void> {
	return await invoke('cancel_current_load');
}

/** 获取最近加载性能指标 */
export async function getLoadMetrics(): Promise<LoadMetrics | null> {
	return await invoke<LoadMetrics | null>('get_load_metrics');
}
