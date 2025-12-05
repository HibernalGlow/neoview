/**
 * NeoView Page Manager API
 * 
 * 基于 NeeView 架构的新加载系统
 * 后端主导，前端只发请求
 * 
 * 特点：
 * - 后端自动管理预加载
 * - 后端自动管理缓存（距离驱逐）
 * - 前端无需管理加载状态
 */

import { invoke } from '@tauri-apps/api/core';

// ===== 类型定义 =====

/** 书籍类型（参考 NeeView 设计） */
export type BookType = 
	| 'archive'      // 压缩包（ZIP/RAR/7z）
	| 'directory'    // 文件夹
	| 'singleimage'  // 单个图片文件
	| 'singlevideo'  // 单个视频文件
	| 'playlist';    // 播放列表

/** 书籍信息 */
export interface BookInfo {
	path: string;
	bookType: BookType;
	totalPages: number;
	currentIndex: number;
}

/** 页面内容类型 */
export type PageContentType = 
	| 'image'     // 普通图片
	| 'video'     // 视频
	| 'animated'  // 动图 (GIF/APNG/WebP动画)
	| 'archive'   // 嵌套压缩包
	| 'unknown';  // 未知类型

/** 页面信息 */
export interface PageInfo {
	index: number;
	innerPath: string;
	name: string;
	size: number | null;
	contentType: PageContentType;
}

/** 内存池统计 */
export interface MemoryPoolStats {
	entryCount: number;
	totalSize: number;
	maxSize: number;
	usagePercent: number;
	lockedCount: number;
}

/** 页面管理器统计 */
export interface PageManagerStats {
	memory: MemoryPoolStats;
	currentBook: string | null;
	currentIndex: number;
	totalPages: number;
	cachedPages: number[];
}

/** 页面加载结果 */
export interface PageLoadResult {
	index: number;
	size: number;
	mimeType: string;
	cacheHit: boolean;
}

// ===== API 函数 =====

/**
 * 打开书籍
 * 
 * 后端自动：
 * - 扫描书籍内容
 * - 初始化缓存
 * - 取消旧书籍的加载任务
 */
export async function openBook(path: string): Promise<BookInfo> {
	console.log('📖 [PageManager] openBook:', path);
	return invoke<BookInfo>('pm_open_book', { path });
}

/**
 * 关闭书籍
 */
export async function closeBook(): Promise<void> {
	console.log('📖 [PageManager] closeBook');
	return invoke('pm_close_book');
}

/**
 * 获取当前书籍信息
 */
export async function getBookInfo(): Promise<BookInfo | null> {
	return invoke<BookInfo | null>('pm_get_book_info');
}

/**
 * 跳转到指定页面
 * 
 * 后端自动：
 * - 检查缓存
 * - 加载页面
 * - 提交预加载任务
 * 
 * @returns Blob 数据
 */
export async function gotoPage(index: number): Promise<Blob> {
	console.log('📄 [PageManager] gotoPage:', index);
	const buffer = await invoke<ArrayBuffer>('pm_goto_page', { index });
	return new Blob([buffer]);
}

/**
 * 获取页面数据（不改变当前页）
 * 
 * @returns Blob 数据
 */
export async function getPage(index: number): Promise<Blob> {
	const buffer = await invoke<ArrayBuffer>('pm_get_page', { index });
	return new Blob([buffer]);
}

/**
 * 获取页面信息（元数据）
 */
export async function getPageInfo(index: number): Promise<PageInfo> {
	return invoke<PageInfo>('pm_get_page_info', { index });
}

/**
 * 获取页面管理器统计
 */
export async function getStats(): Promise<PageManagerStats> {
	return invoke<PageManagerStats>('pm_get_stats');
}

/**
 * 获取内存池统计
 */
export async function getMemoryStats(): Promise<MemoryPoolStats> {
	return invoke<MemoryPoolStats>('pm_get_memory_stats');
}

/**
 * 清除所有缓存
 */
export async function clearCache(): Promise<void> {
	console.log('🧹 [PageManager] clearCache');
	return invoke('pm_clear_cache');
}

// ===== 工具函数 =====

/**
 * 格式化内存大小
 */
export function formatMemorySize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * 创建 Object URL 从 Blob
 */
export function createObjectURL(blob: Blob): string {
	return URL.createObjectURL(blob);
}

/**
 * 释放 Object URL
 */
export function revokeObjectURL(url: string): void {
	URL.revokeObjectURL(url);
}
