/**
 * NeoView - Book API
 * 书籍管理相关的前端 API 封装
 * 全面使用 Python HTTP API
 */

import { apiGet, apiPost, openBook as httpOpenBook, closeBook as httpCloseBook, getCurrentBook as httpGetCurrentBook, navigateToPage as httpNavigateToPage } from './http-bridge';
import type { BookInfo, PageSortMode } from '../types';

export async function openBook(path: string): Promise<BookInfo> {
	return await httpOpenBook(path);
}

export async function closeBook(): Promise<void> {
	return await httpCloseBook();
}

export async function getCurrentBook(): Promise<BookInfo | null> {
	return await httpGetCurrentBook();
}

export async function navigateToPage(pageIndex: number): Promise<void> {
	await httpNavigateToPage(pageIndex);
}

export async function nextPage(): Promise<number> {
	return await apiPost<number>('/book/next');
}

export async function previousPage(): Promise<number> {
	return await apiPost<number>('/book/previous');
}

export async function navigateToImage(imagePath: string): Promise<number> {
	return await apiPost<number>('/book/navigate-to-image', { image_path: imagePath });
}

export async function setBookSortMode(sortMode: PageSortMode): Promise<BookInfo> {
	return await apiPost<BookInfo>('/book/sort', { sort_mode: sortMode });
}
