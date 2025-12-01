/**
 * 鼠标自动隐藏工具
 * 在无操作一定时间后自动隐藏鼠标光标
 */

export interface CursorAutoHideOptions {
	/** 隐藏延迟（毫秒），默认 3000 */
	hideDelay?: number;
	/** 要应用隐藏的目标元素 */
	target: HTMLElement;
	/** 是否启用，默认 true */
	enabled?: boolean;
}

export interface CursorAutoHideController {
	/** 启用自动隐藏 */
	enable: () => void;
	/** 禁用自动隐藏 */
	disable: () => void;
	/** 强制显示光标 */
	show: () => void;
	/** 强制隐藏光标 */
	hide: () => void;
	/** 销毁控制器，移除事件监听 */
	destroy: () => void;
	/** 当前是否隐藏 */
	readonly isHidden: boolean;
}

/**
 * 创建鼠标自动隐藏控制器
 */
export function createCursorAutoHide(options: CursorAutoHideOptions): CursorAutoHideController {
	const { target, hideDelay = 3000 } = options;
	let enabled = options.enabled ?? true;
	let isHidden = false;
	let hideTimeout: ReturnType<typeof setTimeout> | null = null;

	function showCursor() {
		if (isHidden) {
			target.style.cursor = '';
			isHidden = false;
		}
	}

	function hideCursor() {
		if (!isHidden && enabled) {
			target.style.cursor = 'none';
			isHidden = true;
		}
	}

	function scheduleHide() {
		if (hideTimeout) {
			clearTimeout(hideTimeout);
		}
		if (enabled) {
			hideTimeout = setTimeout(hideCursor, hideDelay);
		}
	}

	function handleMouseMove() {
		showCursor();
		scheduleHide();
	}

	function handleMouseLeave() {
		if (hideTimeout) {
			clearTimeout(hideTimeout);
			hideTimeout = null;
		}
		showCursor();
	}

	// 添加事件监听
	target.addEventListener('mousemove', handleMouseMove);
	target.addEventListener('mouseleave', handleMouseLeave);

	// 初始化
	if (enabled) {
		scheduleHide();
	}

	return {
		enable() {
			enabled = true;
			scheduleHide();
		},
		disable() {
			enabled = false;
			showCursor();
			if (hideTimeout) {
				clearTimeout(hideTimeout);
				hideTimeout = null;
			}
		},
		show: showCursor,
		hide: hideCursor,
		destroy() {
			target.removeEventListener('mousemove', handleMouseMove);
			target.removeEventListener('mouseleave', handleMouseLeave);
			if (hideTimeout) {
				clearTimeout(hideTimeout);
				hideTimeout = null;
			}
			showCursor();
		},
		get isHidden() {
			return isHidden;
		}
	};
}
