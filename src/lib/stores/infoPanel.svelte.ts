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
		// 来自 EMM 数据库 mangas 表的原始字段映射，用于在属性面板中完整展示
		raw?: Record<string, unknown>;
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
	// 视频特有属性
	isVideo?: boolean;
	duration?: number; // 秒
	videoCodec?: string;
	audioCodec?: string;
	frameRate?: number;
	bitrate?: number; // bps
}

/** 链路延迟追踪信息 */
export interface LatencyTrace {
	/** 数据源模式 */
	dataSource: 'blob' | 'tempfile' | 'protocol' | 'file-url' | 'tempfile-url';
	/** 渲染模式 */
	renderMode: 'img' | 'canvas';
	/** IPC/提取耗时 (ms) */
	loadMs?: number;
	/** Blob 创建耗时 (ms) */
	blobMs?: number;
	/** 图片解码耗时 (ms) */
	decodeMs?: number;
	/** 渲染耗时 (ms) */
	renderMs?: number;
	/** 总耗时 (ms) */
	totalMs?: number;
	/** 是否缓存命中 */
	cacheHit?: boolean;
	/** 数据大小 (bytes) */
	dataSize?: number;
	/** 追踪 ID */
	traceId?: string;
}

interface InfoPanelState {
	bookInfo: ViewerBookInfo | null;
	imageInfo: ViewerImageInfo | null;
	latencyTrace: LatencyTrace | null;
}

const { subscribe, set, update } = writable<InfoPanelState>({
	bookInfo: null,
	imageInfo: null,
	latencyTrace: null
});

export const infoPanelStore = {
	subscribe,
	setBookInfo(info: ViewerBookInfo | null) {
		update((state) => ({ ...state, bookInfo: info }));
	},
	setImageInfo(info: ViewerImageInfo | null) {
		update((state) => ({ ...state, imageInfo: info }));
	},
	setLatencyTrace(trace: LatencyTrace | null) {
		update((state) => ({ ...state, latencyTrace: trace }));
	},
	resetBookInfo() {
		update((state) => ({ ...state, bookInfo: null }));
	},
	resetImageInfo() {
		update((state) => ({ ...state, imageInfo: null }));
	},
	resetLatencyTrace() {
		update((state) => ({ ...state, latencyTrace: null }));
	},
	resetAll() {
		set({ bookInfo: null, imageInfo: null, latencyTrace: null });
	}
};

export type { InfoPanelState };



















