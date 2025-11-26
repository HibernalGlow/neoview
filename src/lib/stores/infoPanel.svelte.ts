/**
 * Info Panel Store
 * 共享当前书籍与图像的元数据信息
 */

import { writable } from 'svelte/store';

export interface ViewerBookInfo {
	path: string;
	name: string;
	type: string;
	totalPages: number;
	currentPage: number;
	// EMM 元数据
	emmMetadata?: {
		translatedTitle?: string;
		tags?: Record<string, string[]>;
		rating?: number;
	};
}

export interface ViewerImageInfo {
	path: string;
	name: string;
	format?: string;
	width?: number;
	height?: number;
	fileSize?: number;
	colorDepth?: string;
	createdAt?: string;
	modifiedAt?: string;
}

interface InfoPanelState {
	bookInfo: ViewerBookInfo | null;
	imageInfo: ViewerImageInfo | null;
}

const { subscribe, set, update } = writable<InfoPanelState>({
	bookInfo: null,
	imageInfo: null
});

export const infoPanelStore = {
	subscribe,
	setBookInfo(info: ViewerBookInfo | null) {
		update((state) => ({ ...state, bookInfo: info }));
	},
	setImageInfo(info: ViewerImageInfo | null) {
		update((state) => ({ ...state, imageInfo: info }));
	},
	resetBookInfo() {
		update((state) => ({ ...state, bookInfo: null }));
	},
	resetImageInfo() {
		update((state) => ({ ...state, imageInfo: null }));
	},
	resetAll() {
		set({ bookInfo: null, imageInfo: null });
	}
};

export type { InfoPanelState };



















