/**
 * NeoView Page Store (NeeView 架构)
 * 
 * 简化的页面状态管理，后端主导加载
 * 前端只负责：
 * - 存储当前状态
 * - 触发后端请求
 * - 显示加载结果
 */

import * as pageManager from '$lib/api/pageManager';
import type { BookInfo, PageManagerStats } from '$lib/api/pageManager';

// ===== 类型定义 =====

export interface PageState {
	/** 当前书籍信息 */
	book: BookInfo | null;
	/** 当前页面 Blob URL */
	currentPageUrl: string | null;
	/** 当前页面 Blob */
	currentPageBlob: Blob | null;
	/** 是否正在加载 */
	isLoading: boolean;
	/** 错误信息 */
	error: string | null;
	/** 统计信息 */
	stats: PageManagerStats | null;
}

// ===== Store 创建 =====

function createPageStore() {
	const state = $state<PageState>({
		book: null,
		currentPageUrl: null,
		currentPageBlob: null,
		isLoading: false,
		error: null,
		stats: null
	});

	// 清理旧的 Object URL
	function cleanupUrl() {
		if (state.currentPageUrl) {
			pageManager.revokeObjectURL(state.currentPageUrl);
			state.currentPageUrl = null;
		}
	}

	/**
	 * 打开书籍
	 */
	async function openBook(path: string): Promise<BookInfo> {
		state.isLoading = true;
		state.error = null;
		cleanupUrl();

		try {
			const book = await pageManager.openBook(path);
			state.book = book;
			
			// 自动加载第一页
			if (book.totalPages > 0) {
				await gotoPage(0);
			}
			
			return book;
		} catch (err) {
			state.error = err instanceof Error ? err.message : String(err);
			throw err;
		} finally {
			state.isLoading = false;
		}
	}

	/**
	 * 关闭书籍
	 */
	async function closeBook(): Promise<void> {
		cleanupUrl();
		state.book = null;
		state.currentPageBlob = null;
		state.error = null;
		
		await pageManager.closeBook();
	}

	/**
	 * 跳转到指定页面
	 */
	async function gotoPage(index: number): Promise<void> {
		if (!state.book) {
			throw new Error('没有打开的书籍');
		}

		if (index < 0 || index >= state.book.totalPages) {
			throw new Error(`页面索引越界: ${index}`);
		}

		state.isLoading = true;
		state.error = null;

		try {
			const blob = await pageManager.gotoPage(index);
			
			// 更新状态
			cleanupUrl();
			state.currentPageBlob = blob;
			state.currentPageUrl = pageManager.createObjectURL(blob);
			
			// 更新书籍信息中的当前页
			if (state.book) {
				state.book = { ...state.book, currentIndex: index };
			}
		} catch (err) {
			state.error = err instanceof Error ? err.message : String(err);
			throw err;
		} finally {
			state.isLoading = false;
		}
	}

	/**
	 * 下一页
	 */
	async function nextPage(): Promise<void> {
		if (!state.book) return;
		const nextIndex = state.book.currentIndex + 1;
		if (nextIndex < state.book.totalPages) {
			await gotoPage(nextIndex);
		}
	}

	/**
	 * 上一页
	 */
	async function prevPage(): Promise<void> {
		if (!state.book) return;
		const prevIndex = state.book.currentIndex - 1;
		if (prevIndex >= 0) {
			await gotoPage(prevIndex);
		}
	}

	/**
	 * 刷新统计信息
	 */
	async function refreshStats(): Promise<PageManagerStats> {
		const stats = await pageManager.getStats();
		state.stats = stats;
		return stats;
	}

	/**
	 * 清除缓存
	 */
	async function clearCache(): Promise<void> {
		await pageManager.clearCache();
		await refreshStats();
	}

	return {
		// 状态 getters
		get book() { return state.book; },
		get currentPageUrl() { return state.currentPageUrl; },
		get currentPageBlob() { return state.currentPageBlob; },
		get isLoading() { return state.isLoading; },
		get error() { return state.error; },
		get stats() { return state.stats; },
		
		// 派生状态
		get hasBook() { return state.book !== null; },
		get currentIndex() { return state.book?.currentIndex ?? 0; },
		get totalPages() { return state.book?.totalPages ?? 0; },
		get isFirstPage() { return (state.book?.currentIndex ?? 0) === 0; },
		get isLastPage() { 
			const book = state.book;
			return book ? book.currentIndex >= book.totalPages - 1 : true;
		},
		get memoryUsage() {
			const stats = state.stats;
			if (!stats) return '0%';
			return `${stats.memory.usagePercent}%`;
		},
		
		// 方法
		openBook,
		closeBook,
		gotoPage,
		nextPage,
		prevPage,
		refreshStats,
		clearCache,
		
		// 工具方法
		formatMemorySize: pageManager.formatMemorySize
	};
}

// ===== 导出单例 =====

export const pageStore = createPageStore();
