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
	| 'playlist'     // 播放列表
	| 'epub';        // EPUB 电子书

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
	| 'ebook'     // 电子书 (PDF/EPUB/XPS，用 MuPDF 渲染)
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
	/** 图片宽度（如果是图片） */
	width?: number;
	/** 图片高度（如果是图片） */
	height?: number;
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
 * 跳转到指定页面（返回原始 ArrayBuffer，用于延迟追踪）
 */
export async function gotoPageRaw(index: number): Promise<ArrayBuffer> {
	return invoke<ArrayBuffer>('pm_goto_page', { index });
}

/**
 * 获取页面数据（返回原始 ArrayBuffer，用于延迟追踪）
 */
export async function getPageRaw(index: number): Promise<ArrayBuffer> {
	return invoke<ArrayBuffer>('pm_get_page', { index });
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

// ===== 视频相关 =====

/** 临时文件统计 */
export interface TempFileStats {
	fileCount: number;
	totalSize: number;
	tempDir: string;
}

/**
 * 获取视频文件路径
 * 
 * 对于压缩包内的视频，后端会自动提取到临时文件
 * 返回的路径可以用 convertFileSrc() 转换为可用的 URL
 */
export async function getVideoPath(index: number): Promise<string> {
	console.log('🎬 [PageManager] getVideoPath:', index);
	return invoke<string>('pm_get_video_path', { index });
}

/**
 * 获取临时文件统计
 */
export async function getTempStats(): Promise<TempFileStats> {
	return invoke<TempFileStats>('pm_get_temp_stats');
}

/**
 * 获取大文件阈值（MB）
 */
export async function getLargeFileThreshold(): Promise<number> {
	return invoke<number>('pm_get_large_file_threshold');
}

/**
 * 设置大文件阈值（MB）
 * 
 * 超过此阈值的文件会自动使用临时文件而非内存缓存
 * 默认值: 800 MB
 */
export async function setLargeFileThreshold(thresholdMb: number): Promise<void> {
	console.log('⚙️ [PageManager] setLargeFileThreshold:', thresholdMb, 'MB');
	return invoke('pm_set_large_file_threshold', { thresholdMb });
}

// ===== 缩略图 =====

/**
 * 缩略图就绪事件数据
 */
export interface ThumbnailReadyEvent {
	index: number;
	data: string; // data:image/webp;base64,...
	width: number;
	height: number;
}

/**
 * 预加载缩略图（异步，结果通过事件推送）
 * 
 * 接受需要生成的页面索引列表，生成后通过 "thumbnail-ready" 事件推送
 * 前端负责过滤已缓存的页面，避免重复生成
 * 
 * @param indices 需要生成缩略图的页面索引列表
 * @param maxSize 缩略图最大尺寸（默认 256）
 * @returns 开始预加载的页面索引列表
 */
export async function preloadThumbnails(
	indices: number[],
	maxSize: number = 256
): Promise<number[]> {
	return invoke<number[]>('pm_preload_thumbnails', { indices, maxSize });
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
