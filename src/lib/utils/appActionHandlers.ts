/**
 * App Action Handlers
 * 应用级动作处理器映射。
 */

import { open } from '@tauri-apps/plugin-dialog';
import {
	bookStore,
	zoomIn,
	zoomOut,
	toggleLeftSidebar,
	toggleRightSidebar,
	toggleFullscreen,
	rotateClockwise,
	rotate180,
	toggleViewMode,
	pageLeft,
	pageRight,
	topToolbarPinned,
	bottomThumbnailBarPinned,
	toggleReadingDirection,
	toggleSinglePanoramaView,
	toggleTemporaryFitZoom,
	quickLibraryStore
} from '$lib/stores';
import { settingsManager } from '$lib/settings/settingsManager';
import { dispatchApplyZoomMode } from '$lib/utils/zoomMode';
import { slideshowStore } from '$lib/stores/slideshow.svelte';
import { dispatchViewerAction } from '$lib/utils/viewerActionDispatcher';
import { executeProvidedAction } from '$lib/actions/actionRegistry';
import { showInfoToast } from '$lib/utils/toast';

const APP_ACTION_DEBUG = false;

function debugAppAction(...args: unknown[]): void {
	if (APP_ACTION_DEBUG) {
		console.debug(...args);
	}
}

export interface ActionHandlerContext {
	handleDeleteCurrentArchivePage: () => Promise<void>;
}

export type ActionHandler = (ctx: ActionHandlerContext) => void | Promise<void>;

export const SIMPLE_ACTION_HANDLERS: Record<string, () => void> = {
	zoomIn: () => {
		debugAppAction('执行放大操作');
		zoomIn();
	},
	zoomOut: () => {
		debugAppAction('执行缩小操作');
		zoomOut();
	},
	fitWindow: () => {
		debugAppAction('执行适应窗口操作');
		dispatchApplyZoomMode('fit');
	},
	actualSize: () => {
		debugAppAction('执行实际大小操作');
		dispatchApplyZoomMode('original');
	},
	fullscreen: () => {
		debugAppAction('执行全屏操作');
		toggleFullscreen();
	},
	toggleLeftSidebar: () => {
		debugAppAction('执行切换左侧边栏操作');
		toggleLeftSidebar();
	},
	toggleRightSidebar: () => {
		debugAppAction('执行切换右侧边栏操作');
		toggleRightSidebar();
	},
	toggleLibrary: () => {
		debugAppAction('执行切换快捷书库操作');
		quickLibraryStore.toggle();
	},
	toggleBookMode: () => {
		debugAppAction('执行切换书籍模式操作');
		toggleViewMode();
	},
	toggleSinglePanoramaView: () => {
		debugAppAction('执行全景/单页视图互切操作');
		toggleSinglePanoramaView();
	},
	toggleTemporaryFitZoom: () => {
		debugAppAction('执行临时适应窗口缩放操作');
		toggleTemporaryFitZoom();
	},
	rotate: () => {
		debugAppAction('执行旋转90度操作');
		rotateClockwise();
	},
	rotate180: () => {
		debugAppAction('执行旋转180度操作');
		rotate180();
	},
	toggleTopToolbarPin: () => {
		debugAppAction('执行顶部工具栏钉住切换');
		topToolbarPinned.update((p) => !p);
	},
	toggleBottomThumbnailBarPin: () => {
		debugAppAction('执行底部缩略图栏钉住切换');
		bottomThumbnailBarPinned.update((p) => !p);
	},
	toggleReadingDirection: () => {
		debugAppAction('执行阅读方向切换');
		toggleReadingDirection();
	},
	toggleLayoutMode: () => {
		debugAppAction('布局模式切换已禁用');
	}
};

export async function handleToggleAutoUpscale(): Promise<void> {
	debugAppAction('执行自动超分开关切换');
	const { upscaleStore } = await import('$lib/stackview/stores/upscaleStore.svelte');
	const next = !upscaleStore.enabled;
	await upscaleStore.setEnabled(next);
	showInfoToast(next ? '自动超分已开启' : '自动超分已关闭');
}

export const ASYNC_ACTION_HANDLERS: Record<string, ActionHandler> = {
	nextPage: async () => {
		debugAppAction('执行下一页操作');
		await pageRight();
	},
	prevPage: async () => {
		debugAppAction('执行上一页操作');
		await pageLeft();
	},
	firstPage: async () => {
		debugAppAction('执行第一页操作');
		await bookStore.firstPage();
	},
	lastPage: async () => {
		debugAppAction('执行最后一页操作');
		await bookStore.lastPage();
	},
	nextBook: async () => {
		debugAppAction('执行下一本书籍操作');
		await bookStore.openNextBook();
	},
	prevBook: async () => {
		debugAppAction('执行上一本书籍操作');
		await bookStore.openPreviousBook();
	},
	openFile: async () => {
		debugAppAction('执行打开文件操作');
		try {
			const selected = await open({ multiple: false });
			if (selected) await bookStore.openBook(selected as string);
		} catch (err) {
			console.error('openFile action failed', err);
		}
	},
	closeFile: async () => {
		debugAppAction('执行关闭文件操作');
		await bookStore.closeFile();
	},
	deleteFile: async () => {
		debugAppAction('执行删除文件操作');
		await bookStore.closeBook();
	},
	deleteCurrentPage: async (ctx) => {
		debugAppAction('执行删除当前页操作');
		await ctx.handleDeleteCurrentArchivePage();
	}
};

export async function handlePageLeft(): Promise<void> {
	debugAppAction('执行向左翻页操作');
	const settings = settingsManager.getSettings();
	const readingDirection = settings.book.readingDirection;
	if (readingDirection === 'right-to-left') {
		await pageRight();
	} else {
		await pageLeft();
	}
}

export async function handlePageRight(): Promise<void> {
	debugAppAction('执行向右翻页操作');
	const settings = settingsManager.getSettings();
	const readingDirection = settings.book.readingDirection;
	if (readingDirection === 'right-to-left') {
		await pageLeft();
	} else {
		await pageRight();
	}
}

export const SLIDESHOW_ACTION_HANDLERS: Record<string, () => void> = {
	slideshowToggle: () => {
		debugAppAction('执行幻灯片开关切换');
		dispatchViewerAction('slideshowToggle');
	},
	slideshowPlayPause: () => {
		debugAppAction('执行幻灯片播放/暂停');
		slideshowStore.toggle();
	},
	slideshowStop: () => {
		debugAppAction('执行幻灯片停止');
		slideshowStore.stop();
	},
	slideshowSkip: () => {
		debugAppAction('执行幻灯片跳过');
		slideshowStore.skip();
	}
};

export const VIDEO_ACTION_NAMES = [
	'videoPlayPause',
	'videoSeekForward',
	'videoSeekBackward',
	'videoToggleMute',
	'videoToggleLoopMode',
	'videoVolumeUp',
	'videoVolumeDown',
	'videoSpeedUp',
	'videoSpeedDown',
	'videoSpeedToggle',
	'videoSeekModeToggle'
] as const;

export function isVideoActionName(action: string): boolean {
	return VIDEO_ACTION_NAMES.includes(action as (typeof VIDEO_ACTION_NAMES)[number]);
}

export async function executeAppAction(
	action: string,
	ctx: ActionHandlerContext
): Promise<boolean> {
	if (await executeProvidedAction(action)) {
		return true;
	}

	if (action in SIMPLE_ACTION_HANDLERS) {
		SIMPLE_ACTION_HANDLERS[action]();
		return true;
	}

	if (action in ASYNC_ACTION_HANDLERS) {
		await ASYNC_ACTION_HANDLERS[action](ctx);
		return true;
	}

	if (action === 'toggleAutoUpscale') {
		await handleToggleAutoUpscale();
		return true;
	}

	if (action === 'pageLeft') {
		await handlePageLeft();
		return true;
	}

	if (action === 'pageRight') {
		await handlePageRight();
		return true;
	}

	if (action in SLIDESHOW_ACTION_HANDLERS) {
		SLIDESHOW_ACTION_HANDLERS[action]();
		return true;
	}

	if (isVideoActionName(action)) {
		return true;
	}

	return false;
}
