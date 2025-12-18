/**
 * NeoView - Book API
 * 书籍管理相关的前端 API 封装
 */

import { invoke } from '$lib/api/adapter';
import type { BookInfo, PageSortMode } from '../types';

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
