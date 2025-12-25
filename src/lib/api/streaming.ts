/**
 * 流式打开书籍 API
 * 
 * 支持增量返回页面列表，让 UI 可以先响应
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/** 流式条目信息 */
export interface StreamingEntry {
	name: string;
	is_directory: boolean;
	size: number | null;
	index: number;
	is_image: boolean;
}

/** 流式打开结果 */
export interface StreamingOpenResult {
	path: string;
	name: string;
	book_type: string;
	initial_pages: StreamingEntry[];
	has_more: boolean;
	estimated_total: number | null;
}

/** 流式扫描进度事件 */
export interface StreamingScanProgress {
	path: string;
	scanned_count: number;
	estimated_total: number | null;
	entries: StreamingEntry[];
	completed: boolean;
	error: string | null;
}

/**
 * 快速打开书籍
 * 
 * 只返回首批页面，让 UI 可以立即显示
 * 后台继续扫描剩余页面，通过事件通知
 * 
 * @param path 书籍路径
 * @param initialCount 首批返回的页面数量（默认 10）
 */
export async function openBookFast(
	path: string,
	initialCount?: number
): Promise<StreamingOpenResult> {
	return await invoke<StreamingOpenResult>('open_book_fast', {
		path,
		initialCount
	});
}

/**
 * 取消流式扫描
 */
export async function cancelStreamingScan(): Promise<void> {
	return await invoke('cancel_streaming_scan');
}

/**
 * 获取压缩包条目数量
 * 
 * 快速估算，不读取完整列表
 */
export async function getArchiveEntryCount(path: string): Promise<number> {
	return await invoke<number>('get_archive_entry_count', { path });
}

/**
 * 监听流式扫描进度
 * 
 * @param callback 进度回调
 * @returns 取消监听函数
 */
export async function onStreamingScanProgress(
	callback: (progress: StreamingScanProgress) => void
): Promise<UnlistenFn> {
	return await listen<StreamingScanProgress>('archive-scan-progress', (event) => {
		callback(event.payload);
	});
}

/**
 * 流式打开书籍的完整流程
 * 
 * 1. 快速打开，获取首批页面
 * 2. 监听后台扫描进度
 * 3. 增量更新页面列表
 * 
 * @param path 书籍路径
 * @param onInitial 首批页面回调
 * @param onProgress 进度回调
 * @param onComplete 完成回调
 */
export async function openBookStreaming(
	path: string,
	onInitial: (result: StreamingOpenResult) => void,
	onProgress?: (entries: StreamingEntry[], scannedCount: number) => void,
	onComplete?: (totalCount: number) => void,
	onError?: (error: string) => void
): Promise<UnlistenFn> {
	// 监听进度事件
	const unlisten = await onStreamingScanProgress((progress) => {
		if (progress.path !== path) return;

		if (progress.error) {
			onError?.(progress.error);
			return;
		}

		if (progress.entries.length > 0) {
			onProgress?.(progress.entries, progress.scanned_count);
		}

		if (progress.completed) {
			onComplete?.(progress.scanned_count);
		}
	});

	try {
		// 快速打开
		const result = await openBookFast(path);
		onInitial(result);
	} catch (error) {
		unlisten();
		throw error;
	}

	return unlisten;
}
