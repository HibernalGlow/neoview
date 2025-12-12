/**
 * NeoView - UI Store
 * UI 状态管理 Store
 */

import { writable, get } from 'svelte/store';
import { appState, type AppStateSnapshot } from '$lib/core/state/appState';
import { bookStore } from './book.svelte';
import { bookContextManager } from './bookContext.svelte';
import { settingsManager, type ZoomMode } from '$lib/settings/settingsManager';
import { windowManager } from '$lib/core/windows/windowManager';
import { dispatchApplyZoomMode } from '$lib/utils/zoomMode';

// 从本地存储加载状态
function loadFromStorage<T>(key: string, defaultValue: T): T {
	try {
		const saved = localStorage.getItem(`neoview-ui-${key}`);
		if (saved) {
			return JSON.parse(saved);
		}
	} catch (e) {
		console.error(`Failed to load ${key} from storage:`, e);
	}
	return defaultValue;
}

// 保存状态到本地存储
function saveToStorage<T>(key: string, value: T) {
	try {
		localStorage.setItem(`neoview-ui-${key}`, JSON.stringify(value));
	} catch (e) {
		console.error(`Failed to save ${key} to storage:`, e);
	}
}

// 左侧边栏状态 - 默认隐藏
export const leftSidebarOpen = writable<boolean>(loadFromStorage('leftSidebarOpen', false));
export const leftSidebarWidth = writable<number>(loadFromStorage('leftSidebarWidth', 250));

// 右侧边栏状态
export const rightSidebarOpen = writable<boolean>(loadFromStorage('rightSidebarOpen', false));
export const rightSidebarWidth = writable<number>(loadFromStorage('rightSidebarWidth', 250));
export type RightPanelType = 'info' | 'properties' | 'upscale' | 'insights' | null;
export const activeRightPanel = writable<RightPanelType>(loadFromStorage('activeRightPanel', null));

// 全屏状态
export const isFullscreen = writable<boolean>(loadFromStorage('isFullscreen', false));

// 加载状态
export const isLoading = writable<boolean>(false);

// 当前激活的面板
export type PanelType = 'folder' | 'history' | 'bookmark' | 'info' | 'thumbnails' | 'playlist' | 'thumbnail' | null;
export const activeUIPanel = writable<PanelType>(loadFromStorage('activeUIPanel', 'folder'));

// 主题模式
export type ThemeMode = 'light' | 'dark' | 'system';
export const themeMode = writable<ThemeMode>(loadFromStorage('themeMode', 'system'));

// 缩放级别
export const zoomLevel = writable<number>(loadFromStorage('zoomLevel', 1.0));

// 旋转角度 (0, 90, 180, 270)
export const rotationAngle = writable<number>(loadFromStorage('rotationAngle', 0));

// 视图模式（仅描述单页/双页/全景）
export type ViewMode = 'single' | 'double' | 'panorama';

const initialViewMode = (() => {
	const saved = loadFromStorage<ViewMode>('viewMode', 'single');
	if (saved === 'panorama') return 'single';
	return saved;
})();

const initialLockedViewMode = (() => {
	const saved = loadFromStorage<ViewMode | null>('lockedViewMode', null) as ViewMode | null;
	if (saved === 'panorama') return null;
	return saved;
})();

const initialLockedZoomMode = loadFromStorage<ZoomMode | null>('lockedZoomMode', null) as ZoomMode | null;

// 阅读方向锁定
export type ReadingDirection = 'left-to-right' | 'right-to-left';
const initialLockedReadingDirection = loadFromStorage<ReadingDirection | null>('lockedReadingDirection', null) as ReadingDirection | null;

export const viewMode = writable<ViewMode>(initialViewMode);
export const lockedViewMode = writable<ViewMode | null>(initialLockedViewMode);
export const lockedZoomMode = writable<ZoomMode | null>(initialLockedZoomMode);
export const lockedReadingDirection = writable<ReadingDirection | null>(initialLockedReadingDirection);

// 视图方向（横向/纵向），主要影响全景模式的填充方向
export type ViewOrientation = 'horizontal' | 'vertical';
export const orientation = writable<ViewOrientation>(
	loadFromStorage('orientation', 'horizontal')
);

// 边栏锁定状态类型：null = 自动模式，true = 锁定展开，false = 锁定隐藏
export type SidebarLockState = boolean | null;

// 边栏钉住状态（钉住时不自动隐藏）- 保持兼容性
export const topToolbarPinned = writable<boolean>(loadFromStorage('topToolbarPinned', false));
export const bottomThumbnailBarPinned = writable<boolean>(loadFromStorage('bottomThumbnailBarPinned', false));
export const leftSidebarPinned = writable<boolean>(loadFromStorage('leftSidebarPinned', false));
export const rightSidebarPinned = writable<boolean>(loadFromStorage('rightSidebarPinned', false));

// 边栏锁定状态（三态：null = 自动，true = 锁定展开，false = 锁定隐藏）
export const topToolbarLockState = writable<SidebarLockState>(loadFromStorage('topToolbarLockState', null));
export const bottomBarLockState = writable<SidebarLockState>(loadFromStorage('bottomBarLockState', null));
export const leftSidebarLockState = writable<SidebarLockState>(loadFromStorage('leftSidebarLockState', null));
export const rightSidebarLockState = writable<SidebarLockState>(loadFromStorage('rightSidebarLockState', null));

// 上下边栏打开状态（与左右边栏的 open 状态类似）
export const topToolbarOpen = writable<boolean>(loadFromStorage('topToolbarOpen', false));
export const bottomBarOpen = writable<boolean>(loadFromStorage('bottomBarOpen', false));

// 边栏高度（用于上下边栏）
export const topToolbarHeight = writable<number>(loadFromStorage('topToolbarHeight', 60));
export const bottomThumbnailBarHeight = writable<number>(loadFromStorage('bottomThumbnailBarHeight', 120));

// 布局模式：传统布局 vs Flow 画布布局
export type LayoutMode = 'classic' | 'flow';
export const layoutMode = writable<LayoutMode>(loadFromStorage('layoutMode', 'classic'));

// 布局切换模式：无缝切换（保持两个布局加载）vs 冷切换（销毁非活动布局节省性能）
// 默认使用冷切换以避免性能问题
export type LayoutSwitchMode = 'seamless' | 'cold';
export const layoutSwitchMode = writable<LayoutSwitchMode>(loadFromStorage('layoutSwitchMode', 'cold'));

// Viewer 页码信息显示
export const viewerPageInfoVisible = writable<boolean>(loadFromStorage('viewerPageInfoVisible', true));

// 子页索引（用于单页模式下的横页分割：0=前半部分, 1=后半部分）
export const subPageIndex = writable<number>(0);

// 【新增】当前页面是否应该分割（由 StackView 根据实际加载的图片尺寸设置）
// 这个 store 解决了元数据中没有尺寸信息时无法判断分割的问题
export const currentPageShouldSplit = writable<boolean>(false);

/**
 * 检查指定页面是否应该启用分割模式
 * 对于当前页面，优先使用 currentPageShouldSplit（基于实际加载的图片尺寸）
 * 对于其他页面，使用元数据中的尺寸
 */
function shouldSplitPage(index: number): boolean {
	const settings = settingsManager.getSettings();
	const splitEnabled = settings.view.pageLayout.splitHorizontalPages;
	if (!splitEnabled) return false;

	const mode = get(viewMode);
	// 仅在单页模式下启用分割
	if (mode !== 'single') return false;

	if (!bookStore.hasBook) return false;
	const book = bookStore.currentBook;
	if (!book || !book.pages) return false;

	if (index < 0 || index >= book.pages.length) return false;

	// 【关键修复】对于当前页面，使用 currentPageShouldSplit（基于实际加载的图片尺寸）
	if (index === bookStore.currentPageIndex) {
		return get(currentPageShouldSplit);
	}

	const page = book.pages[index];
	if (!page) return false;

	// 对于其他页面，使用元数据中的尺寸
	const w = page.width || 0;
	const h = page.height || 0;
	return w > 0 && h > 0 && w > h;
}

// 订阅并保存变化
leftSidebarOpen.subscribe((value) => saveToStorage('leftSidebarOpen', value));
leftSidebarWidth.subscribe((value) => saveToStorage('leftSidebarWidth', value));
rightSidebarOpen.subscribe((value) => saveToStorage('rightSidebarOpen', value));
rightSidebarWidth.subscribe((value) => saveToStorage('rightSidebarWidth', value));
activeRightPanel.subscribe((value) => saveToStorage('activeRightPanel', value));
isFullscreen.subscribe((value) => saveToStorage('isFullscreen', value));
activeUIPanel.subscribe((value) => saveToStorage('activeUIPanel', value));
themeMode.subscribe((value) => saveToStorage('themeMode', value));
rotationAngle.subscribe((value) => saveToStorage('rotationAngle', value));
topToolbarPinned.subscribe((value) => saveToStorage('topToolbarPinned', value));
bottomThumbnailBarPinned.subscribe((value) => saveToStorage('bottomThumbnailBarPinned', value));
leftSidebarPinned.subscribe((value) => saveToStorage('leftSidebarPinned', value));
rightSidebarPinned.subscribe((value) => saveToStorage('rightSidebarPinned', value));
viewerPageInfoVisible.subscribe((value) => saveToStorage('viewerPageInfoVisible', value));
topToolbarHeight.subscribe((value) => saveToStorage('topToolbarHeight', value));
bottomThumbnailBarHeight.subscribe((value) => saveToStorage('bottomThumbnailBarHeight', value));
layoutMode.subscribe((value) => saveToStorage('layoutMode', value));
layoutSwitchMode.subscribe((value) => saveToStorage('layoutSwitchMode', value));
topToolbarLockState.subscribe((value) => saveToStorage('topToolbarLockState', value));
bottomBarLockState.subscribe((value) => saveToStorage('bottomBarLockState', value));
leftSidebarLockState.subscribe((value) => saveToStorage('leftSidebarLockState', value));
rightSidebarLockState.subscribe((value) => saveToStorage('rightSidebarLockState', value));
topToolbarOpen.subscribe((value) => saveToStorage('topToolbarOpen', value));
bottomBarOpen.subscribe((value) => saveToStorage('bottomBarOpen', value));

const updateViewerSlice = (partial: Partial<AppStateSnapshot['viewer']>) => {
	const snapshot = appState.getSnapshot();
	appState.update({
		viewer: {
			...snapshot.viewer,
			...partial
		}
	});
};

function applyZoomModeWithTracking(mode?: ZoomMode) {
	const fallbackMode = settingsManager.getSettings().view.defaultZoomMode ?? 'fit';
	const targetMode = (mode ?? fallbackMode) as ZoomMode;
	updateViewerSlice({ currentZoomMode: targetMode });
	dispatchApplyZoomMode(mode);
}

let lastZoomModeBeforeTemporaryFit: ZoomMode | null = null;

zoomLevel.subscribe((value) => {
	saveToStorage('zoomLevel', value);
	updateViewerSlice({ zoom: value });
});

viewMode.subscribe((value) => {
	saveToStorage('viewMode', value);
	updateViewerSlice({ viewMode: value });
});

lockedViewMode.subscribe((value) => {
	saveToStorage('lockedViewMode', value);
	updateViewerSlice({ lockedViewMode: value });
});

lockedZoomMode.subscribe((value) => {
	saveToStorage('lockedZoomMode', value);
	updateViewerSlice({ lockedZoomMode: value });
	if (value) {
		applyZoomModeWithTracking(value);
		lastZoomModeBeforeTemporaryFit = null;
	}
});

lockedReadingDirection.subscribe((value) => {
	saveToStorage('lockedReadingDirection', value);
	// 当锁定时，立即应用锁定的阅读方向
	if (value) {
		const settings = settingsManager.getSettings();
		if (settings.book.readingDirection !== value) {
			settingsManager.updateSettings({
				book: {
					...settings.book,
					readingDirection: value
				}
			});
		}
	}
});

orientation.subscribe((value) => {
	saveToStorage('orientation', value);
	updateViewerSlice({ orientation: value });
});

isLoading.subscribe((value) => {
	updateViewerSlice({ loading: value });
});

/**
 * 切换左侧边栏
 */
export function toggleLeftSidebar() {
	leftSidebarOpen.update((open) => !open);
}

/**
 * 切换右侧边栏
 */
export function toggleRightSidebar() {
	rightSidebarOpen.update((open) => !open);
}

/**
 * 设置右侧激活面板
 */
export function setActiveRightPanel(panel: RightPanelType) {
	activeRightPanel.set(panel);
	if (panel) {
		rightSidebarOpen.set(true);
	}
}

/**
 * 设置全屏状态（不触发原生窗口更新）
 * 用于外部状态同步，当原生窗口状态变化时更新 UI 状态
 * Requirements: 4.1
 */
export function setFullscreenState(fullscreen: boolean): void {
	isFullscreen.set(fullscreen);
}

/**
 * 初始化全屏状态
 * 查询原生窗口状态并同步到 UI，同时注册状态变化监听器
 * Requirements: 1.1, 1.2
 */
export async function initFullscreenState(): Promise<void> {
	try {
		// 1. 查询当前原生窗口的全屏状态
		const nativeState = await windowManager.syncFullscreenState();
		
		// 2. 设置 UI 状态以匹配原生窗口状态
		setFullscreenState(nativeState);
		
		// 3. 注册事件监听器，当原生窗口状态变化时更新 UI
		await windowManager.initFullscreenSync((newState: boolean) => {
			setFullscreenState(newState);
		});
	} catch (error) {
		console.error('初始化全屏状态失败:', error);
	}
}

/**
 * 切换全屏
 * 确保 UI 状态和原生窗口状态的一致性
 * Requirements: 1.3, 4.2
 */
export async function toggleFullscreen(): Promise<void> {
	const previousState = get(isFullscreen);
	const newState = !previousState;
	
	// 先更新 UI 状态以提供即时反馈
	isFullscreen.set(newState);
	
	try {
		// 同步到原生窗口全屏状态
		await windowManager.setFullscreen(newState);
	} catch (error) {
		console.error('切换全屏状态失败:', error);
		// 回滚 UI 状态
		isFullscreen.set(previousState);
		
		// 尝试从原生窗口获取实际状态并同步
		try {
			const actualState = await windowManager.isFullscreen();
			isFullscreen.set(actualState);
		} catch (syncError) {
			console.error('同步全屏状态失败:', syncError);
		}
	}
}

/**
 * 设置激活的面板
 */
export function setActivePanel(panel: PanelType) {
	activeUIPanel.set(panel);
}

/**
 * 设置加载状态
 */
export function setLoading(loading: boolean) {
	isLoading.set(loading);
}

/**
 * 设置缩放级别
 */
export function setZoomLevel(level: number) {
	zoomLevel.set(Math.max(0.1, Math.min(5.0, level)));
}

/**
 * 缩放增加
 */
export function zoomIn() {
	zoomLevel.update((level) => Math.min(5.0, level * 1.2));
}

/**
 * 缩放减少
 */
export function zoomOut() {
	zoomLevel.update((level) => Math.max(0.1, level / 1.2));
}

/**
 * 重置缩放
 */
export function resetZoom() {
	zoomLevel.set(1.0);
}

/**
 * 旋转图片 (顺时针90度)
 */
export function rotateClockwise() {
	rotationAngle.update((angle) => (angle + 90) % 360);
}

/**
 * 重置旋转
 */
export function resetRotation() {
	rotationAngle.set(0);
}

/**
 * 切换视图方向（横/竖）
 */
export function toggleOrientation() {
	orientation.update((value) => (value === 'horizontal' ? 'vertical' : 'horizontal'));
}

/**
 * 切换视图模式
 */
export function toggleViewMode() {
	const snapshot = appState.getSnapshot();
	const currentMode = snapshot.viewer.viewMode;
	const locked = snapshot.viewer.lockedViewMode;

	if (locked) {
		const alt: ViewMode = locked === 'single' ? 'panorama' : 'single';
		const next: ViewMode = currentMode === locked ? alt : locked;
		viewMode.set(next);
		return;
	}

	viewMode.update((mode) => {
		if (mode === 'single') return 'double';
		if (mode === 'double') return 'panorama';
		return 'single';
	});
}

/**
 * 设置视图模式
 */
export function setViewMode(mode: ViewMode) {
	viewMode.set(mode);
}

export function toggleViewModeLock(mode: ViewMode) {
	lockedViewMode.update((current) => (current === mode ? null : mode));
}

/**
 * 在单页和全景视图之间互相切换
 * 当 lockedViewMode 有值时，不执行任何切换（尊重视图锁定状态）
 */
let lastViewModeBeforeSingleToggle: ViewMode | null = null;
export function toggleSinglePanoramaView() {
	const snapshot = appState.getSnapshot();
	const locked = snapshot.viewer.lockedViewMode as ViewMode | null;
	if (locked) {
		return;
	}

	const current = snapshot.viewer.viewMode as ViewMode;

	if (lastViewModeBeforeSingleToggle === null) {
		lastViewModeBeforeSingleToggle = current;
		if (current !== 'single') {
			viewMode.set('single');
		}
		return;
	}

	const restore = lastViewModeBeforeSingleToggle;
	lastViewModeBeforeSingleToggle = null;

	if (restore !== current) {
		viewMode.set(restore);
	}
}

function getCurrentDefaultZoomMode(): ZoomMode {
	return settingsManager.getSettings().view.defaultZoomMode ?? 'fit';
}

export function toggleZoomModeLock(mode: ZoomMode) {
	const current = appState.getSnapshot().viewer.lockedZoomMode;
	const newMode = current === mode ? null : mode;
	lockedZoomMode.set(newMode);
	// 立即更新 appState 以确保同步
	updateViewerSlice({ lockedZoomMode: newMode });
}

export function requestZoomMode(mode: ZoomMode): boolean {
	const locked = appState.getSnapshot().viewer.lockedZoomMode as ZoomMode | null;
	if (locked && locked !== mode) {
		applyZoomModeWithTracking(locked);
		return false;
	}
	applyZoomModeWithTracking(mode);
	return true;
}

export function toggleTemporaryFitZoom() {
	const locked = appState.getSnapshot().viewer.lockedZoomMode as ZoomMode | null;
	if (locked) {
		return;
	}

	if (lastZoomModeBeforeTemporaryFit === null) {
		lastZoomModeBeforeTemporaryFit = getCurrentDefaultZoomMode();
		if (lastZoomModeBeforeTemporaryFit !== 'fit') {
			applyZoomModeWithTracking('fit');
		}
		return;
	}

	const restore = lastZoomModeBeforeTemporaryFit;
	lastZoomModeBeforeTemporaryFit = null;
	applyZoomModeWithTracking(restore);
}

/**
 * 切换阅读方向
 * 如果锁定了某个方向，切换时会在锁定方向和另一个方向之间切换
 */
export function toggleReadingDirection() {
	const settings = settingsManager.getSettings();
	let locked: ReadingDirection | null = null;
	lockedReadingDirection.subscribe(v => locked = v)();

	if (locked) {
		// 如果当前是锁定方向，切换到另一个；否则切换回锁定方向
		const alt: ReadingDirection = locked === 'left-to-right' ? 'right-to-left' : 'left-to-right';
		const newDirection = settings.book.readingDirection === locked ? alt : locked;
		settingsManager.updateSettings({
			book: {
				...settings.book,
				readingDirection: newDirection
			}
		});
		return;
	}

	const newDirection = settings.book.readingDirection === 'left-to-right' ? 'right-to-left' : 'left-to-right';
	settingsManager.updateSettings({
		book: {
			...settings.book,
			readingDirection: newDirection
		}
	});
}

/**
 * 切换阅读方向锁定
 */
export function toggleReadingDirectionLock(direction: ReadingDirection) {
	lockedReadingDirection.update((current) => (current === direction ? null : direction));
}

/**
 * 计算翻页步进：双页模式（包括全景+双页）翻 2 页，否则翻 1 页
 */
function getPageStep(): number {
	const snapshot = appState.getSnapshot();
	const viewMode = snapshot.viewer.viewMode;
	// 全景模式下从 bookContextManager 获取实际的 pageMode
	if (viewMode === 'panorama') {
		const ctx = bookContextManager.current;
		return ctx?.pageMode === 'double' ? 2 : 1;
	}
	return viewMode === 'double' ? 2 : 1;
}

/**
 * 向左翻页（方向性翻页，不受阅读方向影响）
 */
/**
 * 向左翻页（方向性翻页，不受阅读方向影响）
 * 对应：向前翻页 / 上一页 (Decrement Index)
 */
export async function pageLeft() {
	try {
		const currentIndex = bookStore.currentPageIndex;
		const currentSub = get(subPageIndex);

		// 如果当前页面支持分割，且处于后半部分(1)，则翻到前半部分(0)
		if (shouldSplitPage(currentIndex)) {
			if (currentSub === 1) {
				subPageIndex.set(0);
				return;
			}
		}

		const step = getPageStep();
		const targetIndex = Math.max(currentIndex - step, 0);

		// 如果目标只能是当前页（已经是第一页），则不做任何操作
		// 边界提示由 StackView 统一处理
		if (targetIndex === currentIndex) return;

		await bookStore.navigateToPage(targetIndex);

		// 翻到上一页时，如果上一页是分割页，则应该定位到后半部分(1)
		// 这样符合“从后往前”翻阅的逻辑
		if (shouldSplitPage(targetIndex)) {
			subPageIndex.set(1);
		} else {
			subPageIndex.set(0);
		}
	} catch (err) {
		console.error('Failed to turn page left:', err);
	}
}

/**
 * 向右翻页（方向性翻页，不受阅读方向影响）
 * 对应：向后翻页 / 下一页 (Increment Index)
 */
export async function pageRight() {
	try {
		const currentIndex = bookStore.currentPageIndex;
		const currentSub = get(subPageIndex);
		const shouldSplit = shouldSplitPage(currentIndex);

		console.log('📖 pageRight:', {
			currentIndex,
			currentSub,
			shouldSplit,
			splitEnabled: settingsManager.getSettings().view.pageLayout.splitHorizontalPages,
			viewMode: get(viewMode)
		});

		// 如果当前页面支持分割
		if (shouldSplit) {
			// 如果处于前半部分(0)，则翻到后半部分(1)
			if (currentSub === 0) {
				console.log('📖 pageRight: 切换到后半部分(1)');
				subPageIndex.set(1);
				return;
			}
			// 如果处于后半部分(1)，则继续翻到下一页
			console.log('📖 pageRight: 已在后半部分，继续翻到下一页');
		}

		const step = getPageStep();
		const maxIndex = Math.max(0, bookStore.totalPages - 1);
		const targetIndex = Math.min(currentIndex + step, maxIndex);

		// 如果目标只能是当前页（已经是最后一页），则不做任何操作
		// 边界提示由 StackView 统一处理
		if (targetIndex === currentIndex) {
			console.log('📖 pageRight: 已是最后一页');
			return;
		}

		console.log('📖 pageRight: 导航到页面', targetIndex);
		await bookStore.navigateToPage(targetIndex);

		// 翻到下一页，总是从前半部分(0)开始
		subPageIndex.set(0);
	} catch (err) {
		console.error('Failed to turn page right:', err);
	}
}

/**
 * 直接跳转到指定页面（用于滑块、缩略图点击等）
 * 会重置 subPageIndex 为 0，从该页的第一部分开始
 */
export async function jumpToPage(index: number) {
	try {
		subPageIndex.set(0);
		await bookStore.navigateToPage(index);
	} catch (err) {
		console.error('Failed to jump to page:', err);
	}
}

/**
 * 切换布局模式（传统 vs Flow 画布）
 */
export function toggleLayoutMode() {
	layoutMode.update((mode) => (mode === 'classic' ? 'flow' : 'classic'));
}

/**
 * 设置布局模式
 */
export function setLayoutMode(mode: LayoutMode) {
	layoutMode.set(mode);
}

/**
 * 切换布局切换模式（无缝 vs 冷切换）
 */
export function toggleLayoutSwitchMode() {
	layoutSwitchMode.update((mode) => (mode === 'seamless' ? 'cold' : 'seamless'));
}

/**
 * 设置布局切换模式
 */
export function setLayoutSwitchMode(mode: LayoutSwitchMode) {
	layoutSwitchMode.set(mode);
}
