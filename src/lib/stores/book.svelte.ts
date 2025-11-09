/**
 * NeoView - Book Store
 * 书籍状态管理 Store
 */

import { writable, derived, get } from 'svelte/store';
import type { BookInfo } from '../types';
import * as bookApi from '../api/book';

// 当前打开的书籍
export const currentBook = writable<BookInfo | null>(null);

// 当前页面索引
export const currentPageIndex = derived(currentBook, ($book) => $book?.currentPage ?? 0);

// 总页数
export const totalPages = derived(currentBook, ($book) => $book?.totalPages ?? 0);

// 是否有书籍打开
export const hasBook = derived(currentBook, ($book) => $book !== null);

// 是否可以翻到下一页
export const canNextPage = derived(
	[currentBook],
	([$book]) => $book !== null && $book.currentPage < $book.totalPages - 1
);

// 是否可以翻到上一页
export const canPreviousPage = derived(
	[currentBook],
	([$book]) => $book !== null && $book.currentPage > 0
);

// 当前页面信息
export const currentPage = derived(currentBook, ($book) => {
	if (!$book || $book.pages.length === 0) return null;
	return $book.pages[$book.currentPage];
});

/**
 * 打开书籍
 */
export async function openBook(path: string) {
	try {
		const book = await bookApi.openBook(path);
		currentBook.set(book);
		return book;
	} catch (error) {
		console.error('Failed to open book:', error);
		throw error;
	}
}

/**
 * 关闭书籍
 */
export async function closeBook() {
	try {
		await bookApi.closeBook();
		currentBook.set(null);
	} catch (error) {
		console.error('Failed to close book:', error);
		throw error;
	}
}

/**
 * 导航到指定页面
 */
export async function navigateToPage(pageIndex: number) {
	try {
		await bookApi.navigateToPage(pageIndex);
		const book = get(currentBook);
		if (book) {
			currentBook.set({ ...book, currentPage: pageIndex });
		}
	} catch (error) {
		console.error('Failed to navigate to page:', error);
		throw error;
	}
}

/**
 * 下一页
 */
export async function nextPage() {
	try {
		const newIndex = await bookApi.nextPage();
		const book = get(currentBook);
		if (book) {
			currentBook.set({ ...book, currentPage: newIndex });
		}
		return newIndex;
	} catch (error) {
		console.error('Failed to go to next page:', error);
		throw error;
	}
}

/**
 * 上一页
 */
export async function previousPage() {
	try {
		const newIndex = await bookApi.previousPage();
		const book = get(currentBook);
		if (book) {
			currentBook.set({ ...book, currentPage: newIndex });
		}
		return newIndex;
	} catch (error) {
		console.error('Failed to go to previous page:', error);
		throw error;
	}
}

/**
 * 刷新当前书籍信息
 */
export async function refreshCurrentBook() {
	try {
		const book = await bookApi.getCurrentBook();
		currentBook.set(book);
	} catch (error) {
		console.error('Failed to refresh book:', error);
		throw error;
	}
}
