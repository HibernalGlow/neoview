/**
 * App Action Handlers
 * 应用级动作处理器映射
 *
 * 将 App.svelte 中的 switch-case 逻辑提取为可配置的处理器映射，
 * 大幅减少 App.svelte 的代码量并提高可维护性。
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
	toggleViewMode,
	pageLeft,
	pageRight,
	topToolbarPinned,
	bottomThumbnailBarPinned,
	toggleReadingDirection,
	toggleSinglePanoramaView,
	toggleTemporaryFitZoom
} from '$lib/stores';
import { settingsManager } from '$lib/settings/settingsManager';
import { dispatchApplyZoomMode } from '$lib/utils/zoomMode';
import { updateUpscaleSettings } from '$lib/utils/upscale/settings';
import { slideshowStore } from '$lib/stores/slideshow.svelte';
import { dispatchViewerAction } from '$lib/utils/viewerActionDispatcher';

/**
 * 动作处理器上下文
 * 包含执行动作时可能需要的外部依赖
 */
export interface ActionHandlerContext {
	/** 删除当前压缩包页面的回调 */
	handleDeleteCurrentArchivePage: () => Promise<void>;
}

/**
 * 动作处理器类型
 */
export type ActionHandler = (ctx: ActionHandlerContext) => void | Promise<void>;

/**
 * 简单动作处理器映射（不需要上下文的同步操作）
 */
export const SIMPLE_ACTION_HANDLERS: Record<string, () => void> = {
	zoomIn: () => {
		console.log('执行放大操作');
		zoomIn();
	},
	zoomOut: () => {
		console.log('执行缩小操作');
		zoomOut();
	},
	fitWindow: () => {
		console.log('执行适应窗口操作');
		dispatchApplyZoomMode('fit');
	},
	actualSize: () => {
		console.log('执行实际大小操作');
		dispatchApplyZoomMode('original');
	},
	fullscreen: () => {
		console.log('执行全屏操作');
		toggleFullscreen();
	},
	toggleLeftSidebar: () => {
		console.log('执行切换左侧边栏操作');
		toggleLeftSidebar();
	},
	toggleRightSidebar: () => {
		console.log('执行切换右侧边栏操作');
		toggleRightSidebar();
	},
	toggleBookMode: () => {
		console.log('执行切换书籍模式操作');
		toggleViewMode();
	},
	toggleSinglePanoramaView: () => {
		console.log('执行全景/单页视图互切操作');
		toggleSinglePanoramaView();
	},
	toggleTemporaryFitZoom: () => {
		console.log('执行临时适应窗口缩放操作');
		toggleTemporaryFitZoom();
	},
	rotate: () => {
		console.log('执行旋转操作');
		rotateClockwise();
	},
	toggleTopToolbarPin: () => {
		console.log('执行顶部工具栏钉住切换');
		topToolbarPinned.update((p) => !p);
	},
	toggleBottomThumbnailBarPin: () => {
		console.log('执行底部缩略图栏钉住切换');
		bottomThumbnailBarPinned.update((p) => !p);
	},
	toggleReadingDirection: () => {
		console.log('执行阅读方向切换');
		toggleReadingDirection();
	},
	toggleLayoutMode: () => {
		console.log('布局模式切换已禁用');
	}
};

/**
 * 自动超分切换处理器
 */
export function handleToggleAutoUpscale(): void {
	console.log('执行自动超分开关切换');
	const settings = settingsManager.getSettings();
	const current = settings.image.enableSuperResolution ?? false;
	const next = !current;
	settingsManager.updateNestedSettings('image', {
		enableSuperResolution: next
	});
	updateUpscaleSettings({
		autoUpscaleEnabled: next,
		globalUpscaleEnabled: next,
		currentImageUpscaleEnabled: next
	});
}

/**
 * 异步动作处理器映射
 */
export const ASYNC_ACTION_HANDLERS: Record<string, ActionHandler> = {
	nextPage: async () => {
		console.log('执行下一页操作');
		await pageRight();
	},
	prevPage: async () => {
		console.log('执行上一页操作');
		await pageLeft();
	},
	firstPage: async () => {
		console.log('执行第一页操作');
		await bookStore.firstPage();
	},
	lastPage: async () => {
		console.log('执行最后一页操作');
		await bookStore.lastPage();
	},
	nextBook: async () => {
		console.log('执行下一个书籍操作');
		await bookStore.openNextBook();
	},
	prevBook: async () => {
		console.log('执行上一个书籍操作');
		await bookStore.openPreviousBook();
	},
	openFile: async () => {
		console.log('执行打开文件操作');
		try {
			const selected = await open({ multiple: false });
			if (selected) await bookStore.openBook(selected as string);
		} catch (err) {
			console.error('openFile action failed', err);
		}
	},
	closeFile: async () => {
		console.log('执行关闭文件操作');
		await bookStore.closeFile();
	},
	deleteFile: async () => {
		console.log('执行删除文件操作');
		// 删除需要额外确认/实现，这里调用 bookStore.closeBook() 作为占位
		await bookStore.closeBook();
	},
	deleteCurrentPage: async (ctx) => {
		console.log('执行删除当前页操作');
		await ctx.handleDeleteCurrentArchivePage();
	}
};

/**
 * 带阅读方向的翻页处理器
 */
export async function handlePageLeft(): Promise<void> {
	console.log('执行向左翻页操作');
	const settings = settingsManager.getSettings();
	const readingDirection = settings.book.readingDirection;
	if (readingDirection === 'right-to-left') {
		// 右开模式下，逻辑上的"向左翻页"对应物理向右翻
		await pageRight();
	} else {
		await pageLeft();
	}
}

export async function handlePageRight(): Promise<void> {
	console.log('执行向右翻页操作');
	const settings = settingsManager.getSettings();
	const readingDirection = settings.book.readingDirection;
	if (readingDirection === 'right-to-left') {
		// 右开模式下，逻辑上的"向右翻页"对应物理向左翻
		await pageLeft();
	} else {
		await pageRight();
	}
}

/**
 * 幻灯片动作处理器
 */
export const SLIDESHOW_ACTION_HANDLERS: Record<string, () => void> = {
	slideshowToggle: () => {
		console.log('执行幻灯片开关切换');
		dispatchViewerAction('slideshowToggle');
	},
	slideshowPlayPause: () => {
		console.log('执行幻灯片播放/暂停');
		slideshowStore.toggle();
	},
	slideshowStop: () => {
		console.log('执行幻灯片停止');
		slideshowStore.stop();
	},
	slideshowSkip: () => {
		console.log('执行幻灯片跳过');
		slideshowStore.skip();
	}
};

/**
 * 视频操作列表（已在 isVideoPage 块内处理，这里只是防止 default 警告）
 */
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

/**
 * 检查是否是视频操作（用于跳过警告）
 */
export function isVideoActionName(action: string): boolean {
	return VIDEO_ACTION_NAMES.includes(action as (typeof VIDEO_ACTION_NAMES)[number]);
}

/**
 * 执行应用级动作
 *
 * @param action 动作名称
 * @param ctx 动作处理器上下文
 * @returns 是否成功处理了动作
 */
export async function executeAppAction(
	action: string,
	ctx: ActionHandlerContext
): Promise<boolean> {
	// 检查简单同步动作
	if (action in SIMPLE_ACTION_HANDLERS) {
		SIMPLE_ACTION_HANDLERS[action]();
		return true;
	}

	// 检查异步动作
	if (action in ASYNC_ACTION_HANDLERS) {
		await ASYNC_ACTION_HANDLERS[action](ctx);
		return true;
	}

	// 检查特殊处理器
	if (action === 'toggleAutoUpscale') {
		handleToggleAutoUpscale();
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

	// 检查幻灯片动作
	if (action in SLIDESHOW_ACTION_HANDLERS) {
		SLIDESHOW_ACTION_HANDLERS[action]();
		return true;
	}

	// 检查视频动作（已在别处处理，这里只是跳过警告）
	if (isVideoActionName(action)) {
		return true;
	}

	// 未知动作
	return false;
}
