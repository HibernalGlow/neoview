/**
 * NeoView - UI Store
 * UI 状态管理 Store (Svelte 5 Runes)
 */

import { appState, type AppStateSnapshot } from '$lib/core/state/appState';
import { bookStore } from './book.svelte';
import { bookContextManager } from './bookContext.svelte';
import { settingsManager, type ZoomMode } from '$lib/settings/settingsManager';
import { windowManager } from '$lib/core/windows/windowManager';
import { dispatchApplyZoomMode } from '$lib/utils/zoomMode';
import { createPersistedState, createState, type PersistedState } from './utils/createPersistedState.svelte';
import { pageDistributionStore } from './pageDistributionStore.svelte';
import { showInfoToast } from '$lib/utils/toast';

// ============================================================================
// 类型定义
// ============================================================================

export type RightPanelType = 'info' | 'properties' | 'upscale' | 'insights' | null;
export type PanelType = 'folder' | 'history' | 'bookmark' | 'info' | 'thumbnails' | 'playlist' | 'thumbnail' | null;
export type ThemeMode = 'light' | 'dark' | 'system';
export type ViewMode = 'single' | 'double' | 'panorama';
export type ReadingDirection = 'left-to-right' | 'right-to-left';
export type ViewOrientation = 'horizontal' | 'vertical';
export type SidebarLockState = boolean | null;
export type LayoutMode = 'classic' | 'flow';
export type LayoutSwitchMode = 'seamless' | 'cold';

// ============================================================================
// 持久化状态（使用 createPersistedState）
// ============================================================================

// 左侧边栏状态
export const leftSidebarOpen = createPersistedState({ key: 'leftSidebarOpen', defaultValue: false });
export const leftSidebarWidth = createPersistedState({ key: 'leftSidebarWidth', defaultValue: 250 });

// 右侧边栏状态
export const rightSidebarOpen = createPersistedState({ key: 'rightSidebarOpen', defaultValue: false });
export const rightSidebarWidth = createPersistedState({ key: 'rightSidebarWidth', defaultValue: 250 });
export const activeRightPanel = createPersistedState<RightPanelType>({ key: 'activeRightPanel', defaultValue: null });

// 全屏状态
export const isFullscreen = createPersistedState({ key: 'isFullscreen', defaultValue: false });

// 当前激活的面板
export const activeUIPanel = createPersistedState<PanelType>({ key: 'activeUIPanel', defaultValue: 'folder' });

// 主题模式
export const themeMode = createPersistedState<ThemeMode>({ key: 'themeMode', defaultValue: 'system' });

// 缩放级别
export const zoomLevel = createPersistedState({
	key: 'zoomLevel',
	defaultValue: 1.0,
	onChange: (value) => {
		updateViewerSlice({ zoom: value });
	}
});

// 旋转角度
export const rotationAngle = createPersistedState({ key: 'rotationAngle', defaultValue: 0 });

// 视图模式（特殊处理：panorama 不持久化）
const _viewModeRaw = createPersistedState<ViewMode>({ key: 'viewMode', defaultValue: 'single' });
const initialViewMode = _viewModeRaw.value === 'panorama' ? 'single' : _viewModeRaw.value;
export const viewMode = createPersistedState<ViewMode>({
	key: 'viewMode',
	defaultValue: initialViewMode,
	onChange: (value) => {
		updateViewerSlice({ viewMode: value });
	}
});

// 锁定的视图模式
const _lockedViewModeRaw = createPersistedState<ViewMode | null>({ key: 'lockedViewMode', defaultValue: null });
const initialLockedViewMode = _lockedViewModeRaw.value === 'panorama' ? null : _lockedViewModeRaw.value;
export const lockedViewMode = createPersistedState<ViewMode | null>({
	key: 'lockedViewMode',
	defaultValue: initialLockedViewMode,
	onChange: (value) => {
		updateViewerSlice({ lockedViewMode: value });
	}
});

// 锁定的缩放模式
export const lockedZoomMode = createPersistedState<ZoomMode | null>({
	key: 'lockedZoomMode',
	defaultValue: null,
	onChange: (value) => {
		updateViewerSlice({ lockedZoomMode: value });
		if (value) {
			applyZoomModeWithTracking(value);
			lastZoomModeBeforeTemporaryFit = null;
		}
	}
});

// 锁定的阅读方向
export const lockedReadingDirection = createPersistedState<ReadingDirection | null>({
	key: 'lockedReadingDirection',
	defaultValue: null,
	onChange: (value) => {
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
	}
});

// 视图方向
export const orientation = createPersistedState<ViewOrientation>({
	key: 'orientation',
	defaultValue: 'horizontal',
	onChange: (value) => {
		updateViewerSlice({ orientation: value });
	}
});

// 边栏钉住状态
export const topToolbarPinned = createPersistedState({ key: 'topToolbarPinned', defaultValue: false });
export const bottomThumbnailBarPinned = createPersistedState({ key: 'bottomThumbnailBarPinned', defaultValue: false });
export const leftSidebarPinned = createPersistedState({ key: 'leftSidebarPinned', defaultValue: false });
export const rightSidebarPinned = createPersistedState({ key: 'rightSidebarPinned', defaultValue: false });

// 边栏锁定状态
export const topToolbarLockState = createPersistedState<SidebarLockState>({ key: 'topToolbarLockState', defaultValue: null });
export const bottomBarLockState = createPersistedState<SidebarLockState>({ key: 'bottomBarLockState', defaultValue: null });
export const leftSidebarLockState = createPersistedState<SidebarLockState>({ key: 'leftSidebarLockState', defaultValue: null });
export const rightSidebarLockState = createPersistedState<SidebarLockState>({ key: 'rightSidebarLockState', defaultValue: null });

// 上下边栏打开状态
export const topToolbarOpen = createPersistedState({ key: 'topToolbarOpen', defaultValue: false });
export const bottomBarOpen = createPersistedState({ key: 'bottomBarOpen', defaultValue: false });

// 边栏高度
export const topToolbarHeight = createPersistedState({ key: 'topToolbarHeight', defaultValue: 60 });
export const bottomThumbnailBarHeight = createPersistedState({ key: 'bottomThumbnailBarHeight', defaultValue: 120 });

// 布局模式
export const layoutMode = createPersistedState<LayoutMode>({ key: 'layoutMode', defaultValue: 'classic' });
export const layoutSwitchMode = createPersistedState<LayoutSwitchMode>({ key: 'layoutSwitchMode', defaultValue: 'cold' });

// Viewer 页码信息显示
export const viewerPageInfoVisible = createPersistedState({ key: 'viewerPageInfoVisible', defaultValue: true });

// ============================================================================
// 非持久化状态（使用 createState）
// ============================================================================

// 加载状态
export const isLoading = createState(false);

// 子页索引
export const subPageIndex = createState(0);

// 当前页面是否应该分割
export const currentPageShouldSplit = createState(false);

// ============================================================================
// 内部辅助函数
// ============================================================================

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
let lastViewModeBeforeSingleToggle: ViewMode | null = null;

/**
 * 检查指定页面是否应该启用分割模式
 */
function shouldSplitPage(index: number): boolean {
	const settings = settingsManager.getSettings();
	const splitEnabled = settings.view.pageLayout.splitHorizontalPages;
	if (!splitEnabled) return false;

	const mode = viewMode.value;
	if (mode !== 'single') return false;

	if (!bookStore.hasBook) return false;
	const book = bookStore.currentBook;
	if (!book || !book.pages) return false;

	if (index < 0 || index >= book.pages.length) return false;

	if (index === bookStore.currentPageIndex) {
		return currentPageShouldSplit.value;
	}

	const page = book.pages[index];
	if (!page) return false;

	const w = page.width || 0;
	const h = page.height || 0;
	return w > 0 && h > 0 && w > h;
}

function getPageDimensions(book: typeof bookStore.currentBook, pageIndex: number): { width: number; height: number } | null {
	if (!book || !book.pages || pageIndex < 0 || pageIndex >= book.pages.length) {
		return null;
	}
	
	const page = book.pages[pageIndex];
	if (!page) return null;
	
	const width = page.width ?? 0;
	const height = page.height ?? 0;
	
	if (width > 0 && height > 0) {
		return { width, height };
	}
	
	return null;
}

function getPageStep(): number {
	const snapshot = appState.getSnapshot();
	const currentViewMode = snapshot.viewer.viewMode;
	
	let pageMode: 'single' | 'double' = 'single';
	if (currentViewMode === 'panorama') {
		const ctx = bookContextManager.current;
		pageMode = ctx?.pageMode ?? 'single';
	} else {
		pageMode = currentViewMode === 'double' ? 'double' : 'single';
	}
	
	// 单页模式固定步进 1
	if (pageMode !== 'double') {
		return 1;
	}
	
	// 【优化】使用预计算的页面分布，O(1) 查表
	const currentIndex = bookStore.currentPageIndex;
	const step = pageDistributionStore.getPageStepForIndex(currentIndex);
	if (step > 0) {
		return step;
	}
	
	// 降级：使用原有的实时计算逻辑
	const settings = settingsManager.getSettings();
	const treatHorizontalAsDoublePage = settings.view.pageLayout?.treatHorizontalAsDoublePage ?? false;
	const singleFirstPageMode = settings.view.pageLayout?.singleFirstPageMode ?? 'restoreOrDefault';
	const singleLastPageMode = settings.view.pageLayout?.singleLastPageMode ?? 'restoreOrDefault';
	
	const singleFirstPage = singleFirstPageMode === 'default' ? true :
		singleFirstPageMode === 'continue' ? false : true;
	const singleLastPage = singleLastPageMode === 'default' ? false :
		singleLastPageMode === 'continue' ? true : false;
	
	if (!bookStore.hasBook) return 2;
	const book = bookStore.currentBook;
	if (!book || !book.pages) return 2;
	
	const currentPage = book.pages[currentIndex];
	if (!currentPage) return 1;
	
	const currentDims = getPageDimensions(book, currentIndex);
	const isCurrentLandscape = currentDims ? currentDims.width > currentDims.height : false;
	
	if (treatHorizontalAsDoublePage && isCurrentLandscape) {
		return 1;
	}
	
	const nextIndex = currentIndex + 1;
	if (nextIndex >= book.pages.length) {
		return 1;
	}
	
	const nextPage = book.pages[nextIndex];
	if (!nextPage) {
		return 1;
	}
	
	const nextDims = getPageDimensions(book, nextIndex);
	const isNextLandscape = nextDims ? nextDims.width > nextDims.height : false;
	
	if (treatHorizontalAsDoublePage && isNextLandscape) {
		return 1;
	}
	
	const totalPages = book.pages.length;
	const isFirst = currentIndex === 0 || nextIndex === 0;
	const isLast = currentIndex === totalPages - 1 || nextIndex === totalPages - 1;
	
	if ((singleFirstPage && isFirst) || (singleLastPage && isLast)) {
		return 1;
	}
	
	return 2;
}

function getCurrentDefaultZoomMode(): ZoomMode {
	return settingsManager.getSettings().view.defaultZoomMode ?? 'fit';
}

// ============================================================================
// 导出的 Actions
// ============================================================================

export function toggleLeftSidebar() {
	leftSidebarOpen.update((open) => !open);
}

export function toggleRightSidebar() {
	rightSidebarOpen.update((open) => !open);
}

export function setActiveRightPanel(panel: RightPanelType) {
	activeRightPanel.set(panel);
	if (panel) {
		rightSidebarOpen.set(true);
	}
}

export function setFullscreenState(fullscreen: boolean): void {
	isFullscreen.set(fullscreen);
}

export async function initFullscreenState(): Promise<void> {
	try {
		const nativeState = await windowManager.syncFullscreenState();
		setFullscreenState(nativeState);
		await windowManager.initFullscreenSync((newState: boolean) => {
			setFullscreenState(newState);
		});
	} catch (error) {
		console.error('初始化全屏状态失败:', error);
	}
}

export async function toggleFullscreen(): Promise<void> {
	const previousState = isFullscreen.value;
	const newState = !previousState;
	
	isFullscreen.set(newState);
	
	try {
		await windowManager.setFullscreen(newState);
	} catch (error) {
		console.error('切换全屏状态失败:', error);
		isFullscreen.set(previousState);
		
		try {
			const actualState = await windowManager.isFullscreen();
			isFullscreen.set(actualState);
		} catch (syncError) {
			console.error('同步全屏状态失败:', syncError);
		}
	}
}

export function setActivePanel(panel: PanelType) {
	activeUIPanel.set(panel);
}

export function setLoading(loading: boolean) {
	isLoading.set(loading);
}

export function setZoomLevel(level: number) {
	zoomLevel.set(Math.max(0.1, Math.min(5.0, level)));
}

export function zoomIn() {
	zoomLevel.update((level) => Math.min(5.0, level * 1.2));
}

export function zoomOut() {
	zoomLevel.update((level) => Math.max(0.1, level / 1.2));
}

export function resetZoom() {
	zoomLevel.set(1.0);
}

export function rotateClockwise() {
	rotationAngle.update((angle) => (angle + 90) % 360);
}

export function resetRotation() {
	rotationAngle.set(0);
}

export function toggleOrientation() {
	orientation.update((value) => (value === 'horizontal' ? 'vertical' : 'horizontal'));
}

export function toggleViewMode() {
	const snapshot = appState.getSnapshot();
	const currentMode = snapshot.viewer.viewMode;
	const locked = snapshot.viewer.lockedViewMode;

	if (locked) {
		const alt: ViewMode = locked === 'single' ? 'panorama' : 'single';
		const next: ViewMode = currentMode === locked ? alt : locked;
		viewMode.set(next);
		// 【优化】同步更新预计算页面分布
		pageDistributionStore.setDoublePage(next === 'double');
		return;
	}

	viewMode.update((mode) => {
		const next = mode === 'single' ? 'double' : mode === 'double' ? 'panorama' : 'single';
		// 【优化】同步更新预计算页面分布
		pageDistributionStore.setDoublePage(next === 'double');
		return next;
	});
}

export function setViewMode(mode: ViewMode) {
	viewMode.set(mode);
	// 【优化】同步更新预计算页面分布
	pageDistributionStore.setDoublePage(mode === 'double');
}

export function toggleViewModeLock(mode: ViewMode) {
	lockedViewMode.update((current) => (current === mode ? null : mode));
}

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

export function toggleZoomModeLock(mode: ZoomMode) {
	const current = appState.getSnapshot().viewer.lockedZoomMode;
	const newMode = current === mode ? null : mode;
	lockedZoomMode.set(newMode);
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

export function toggleReadingDirection() {
	const settings = settingsManager.getSettings();
	const locked = lockedReadingDirection.value;

	if (locked) {
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

export function toggleReadingDirectionLock(direction: ReadingDirection) {
	lockedReadingDirection.update((current) => (current === direction ? null : direction));
}

export async function pageLeft() {
	try {
		const currentIndex = bookStore.currentPageIndex;
		const currentSub = subPageIndex.value;

		if (shouldSplitPage(currentIndex)) {
			if (currentSub === 1) {
				subPageIndex.set(0);
				return;
			}
		}

		const step = getPageStep();
		const targetIndex = Math.max(currentIndex - step, 0);

		if (targetIndex === currentIndex) {
			// 已在第一页，检查是否显示边界提示
			const settings = settingsManager.getSettings();
			const enableBoundaryToast = settings.view.switchToast?.enableBoundaryToast ?? true;
			if (enableBoundaryToast) {
				showInfoToast('已是第一页');
			}
			return;
		}

		await bookStore.navigateToPage(targetIndex);

		if (shouldSplitPage(targetIndex)) {
			subPageIndex.set(1);
		} else {
			subPageIndex.set(0);
		}
	} catch (err) {
		console.error('Failed to turn page left:', err);
	}
}

export async function pageRight() {
	try {
		const currentIndex = bookStore.currentPageIndex;
		const currentSub = subPageIndex.value;
		const shouldSplit = shouldSplitPage(currentIndex);
		const currentViewModeValue = viewMode.value;

		const book = bookStore.currentBook;
		const currentPage = book?.pages?.[currentIndex];
		const nextPage = book?.pages?.[currentIndex + 1];
		
		console.log('📖 pageRight:', {
			currentIndex,
			currentSub,
			shouldSplit,
			splitEnabled: settingsManager.getSettings().view.pageLayout.splitHorizontalPages,
			treatHorizontalAsDoublePage: settingsManager.getSettings().view.pageLayout?.treatHorizontalAsDoublePage,
			viewMode: currentViewModeValue,
			currentPageSize: currentPage ? `${currentPage.width}x${currentPage.height}` : 'N/A',
			nextPageSize: nextPage ? `${nextPage.width}x${nextPage.height}` : 'N/A',
			isCurrentLandscape: currentPage ? (currentPage.width ?? 0) > (currentPage.height ?? 0) : false,
			isNextLandscape: nextPage ? (nextPage.width ?? 0) > (nextPage.height ?? 0) : false
		});

		if (shouldSplit) {
			if (currentSub === 0) {
				console.log('📖 pageRight: 切换到后半部分(1)');
				subPageIndex.set(1);
				return;
			}
			console.log('📖 pageRight: 已在后半部分，继续翻到下一页');
		}

		const step = getPageStep();
		const maxIndex = Math.max(0, bookStore.totalPages - 1);
		const targetIndex = Math.min(currentIndex + step, maxIndex);

		if (targetIndex === currentIndex) {
			console.log('📖 pageRight: 已是最后一页');
			// 已在最后一页，检查是否显示边界提示
			const settings = settingsManager.getSettings();
			const enableBoundaryToast = settings.view.switchToast?.enableBoundaryToast ?? true;
			if (enableBoundaryToast) {
				showInfoToast('已是最后一页');
			}
			return;
		}

		console.log('📖 pageRight: 导航到页面', targetIndex);
		await bookStore.navigateToPage(targetIndex);

		subPageIndex.set(0);
	} catch (err) {
		console.error('Failed to turn page right:', err);
	}
}

export async function jumpToPage(index: number) {
	try {
		subPageIndex.set(0);
		await bookStore.navigateToPage(index);
	} catch (err) {
		console.error('Failed to jump to page:', err);
	}
}

export function toggleLayoutMode() {
	layoutMode.update((mode) => (mode === 'classic' ? 'flow' : 'classic'));
}

export function setLayoutMode(mode: LayoutMode) {
	layoutMode.set(mode);
}

export function toggleLayoutSwitchMode() {
	layoutSwitchMode.update((mode) => (mode === 'seamless' ? 'cold' : 'seamless'));
}

export function setLayoutSwitchMode(mode: LayoutSwitchMode) {
	layoutSwitchMode.set(mode);
}
