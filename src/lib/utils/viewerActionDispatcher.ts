/**
 * Viewer Action Dispatcher
 * 用于分发视频和查看器操作的工具函数
 */

/**
 * 向查看器组件分发操作
 */
export function dispatchViewerAction(action: string): void {
	if (typeof window !== 'undefined') {
		window.dispatchEvent(
			new CustomEvent('neoview-viewer-action', { detail: { action } })
		);
	}
}

/**
 * 视频操作列表
 */
export const VIDEO_ACTIONS = [
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

export type VideoAction = typeof VIDEO_ACTIONS[number];

/**
 * 检查是否是视频操作
 */
export function isVideoAction(action: string): action is VideoAction {
	return VIDEO_ACTIONS.includes(action as VideoAction);
}

/**
 * 处理视频操作 - 直接分发到查看器
 * @returns true 如果操作被处理
 */
export function handleVideoAction(action: string): boolean {
	if (isVideoAction(action)) {
		console.log(`执行视频操作: ${action}`);
		dispatchViewerAction(action);
		return true;
	}
	return false;
}

/**
 * 视频快进模式下的翻页操作重映射
 * 将翻页操作映射为快进/快退
 */
export function remapPageActionForVideoSeekMode(action: string): string {
	switch (action) {
		case 'nextPage':
		case 'pageRight':
			return 'videoSeekForward';
		case 'prevPage':
		case 'pageLeft':
			return 'videoSeekBackward';
		default:
			return action;
	}
}

/**
 * 幻灯片操作列表
 */
export const SLIDESHOW_ACTIONS = [
	'slideshowToggle',
	'slideshowPlayPause',
	'slideshowStop',
	'slideshowSkip'
] as const;

export type SlideshowAction = typeof SLIDESHOW_ACTIONS[number];

/**
 * 检查是否是幻灯片操作
 */
export function isSlideshowAction(action: string): action is SlideshowAction {
	return SLIDESHOW_ACTIONS.includes(action as SlideshowAction);
}
