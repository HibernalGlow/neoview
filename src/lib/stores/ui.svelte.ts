/**
 * NeoView - UI Store
 * UI 状态管理 Store
 */

import { writable } from 'svelte/store';
import { appState, type AppStateSnapshot } from '$lib/core/state/appState';
import { bookStore } from './book.svelte';
import { settingsManager } from '$lib/settings/settingsManager';
import { windowManager } from '$lib/core/windows/windowManager';

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

// 侧边栏状态 - 默认隐藏
export const sidebarOpen = writable<boolean>(loadFromStorage('sidebarOpen', false));
export const sidebarWidth = writable<number>(loadFromStorage('sidebarWidth', 250));

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

export const viewMode = writable<ViewMode>(initialViewMode);
export const lockedViewMode = writable<ViewMode | null>(initialLockedViewMode);

// 视图方向（横向/纵向），主要影响全景模式的填充方向
export type ViewOrientation = 'horizontal' | 'vertical';
export const orientation = writable<ViewOrientation>(
	loadFromStorage('orientation', 'horizontal')
);

// 边栏钉住状态（钉住时不自动隐藏）
export const topToolbarPinned = writable<boolean>(loadFromStorage('topToolbarPinned', false));
export const bottomThumbnailBarPinned = writable<boolean>(loadFromStorage('bottomThumbnailBarPinned', false));
export const sidebarPinned = writable<boolean>(loadFromStorage('sidebarPinned', false));
export const rightSidebarPinned = writable<boolean>(loadFromStorage('rightSidebarPinned', false));

// 边栏高度（用于上下边栏）
export const topToolbarHeight = writable<number>(loadFromStorage('topToolbarHeight', 60));
export const bottomThumbnailBarHeight = writable<number>(loadFromStorage('bottomThumbnailBarHeight', 120));

// 订阅并保存变化
sidebarOpen.subscribe((value) => saveToStorage('sidebarOpen', value));
sidebarWidth.subscribe((value) => saveToStorage('sidebarWidth', value));
rightSidebarOpen.subscribe((value) => saveToStorage('rightSidebarOpen', value));
rightSidebarWidth.subscribe((value) => saveToStorage('rightSidebarWidth', value));
activeRightPanel.subscribe((value) => saveToStorage('activeRightPanel', value));
isFullscreen.subscribe((value) => saveToStorage('isFullscreen', value));
activeUIPanel.subscribe((value) => saveToStorage('activeUIPanel', value));
themeMode.subscribe((value) => saveToStorage('themeMode', value));
rotationAngle.subscribe((value) => saveToStorage('rotationAngle', value));
topToolbarPinned.subscribe((value) => saveToStorage('topToolbarPinned', value));
bottomThumbnailBarPinned.subscribe((value) => saveToStorage('bottomThumbnailBarPinned', value));
sidebarPinned.subscribe((value) => saveToStorage('sidebarPinned', value));
rightSidebarPinned.subscribe((value) => saveToStorage('rightSidebarPinned', value));
topToolbarHeight.subscribe((value) => saveToStorage('topToolbarHeight', value));
bottomThumbnailBarHeight.subscribe((value) => saveToStorage('bottomThumbnailBarHeight', value));

const updateViewerSlice = (partial: Partial<AppStateSnapshot['viewer']>) => {
	const snapshot = appState.getSnapshot();
	appState.update({
		viewer: {
			...snapshot.viewer,
			...partial
		}
	});
};

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

orientation.subscribe((value) => {
	saveToStorage('orientation', value);
	updateViewerSlice({ orientation: value });
});

isLoading.subscribe((value) => {
	updateViewerSlice({ loading: value });
});

/**
 * 切换侧边栏
 */
export function toggleSidebar() {
	sidebarOpen.update((open) => !open);
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
 * 切换全屏
 */
export function toggleFullscreen() {
	isFullscreen.update((fullscreen) => !fullscreen);
	// 同步到原生窗口全屏状态（不阻塞 UI）
	void windowManager.toggleFullscreen();
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
export function toggleSinglePanoramaView() {
	const snapshot = appState.getSnapshot();
	const locked = snapshot.viewer.lockedViewMode as ViewMode | null;
	if (locked) {
		return;
	}

	const current = snapshot.viewer.viewMode as ViewMode;
	let next: ViewMode | null = null;

	if (current === 'panorama') {
		next = 'single';
	} else if (current === 'single') {
		next = 'panorama';
	}

	if (next) {
		viewMode.set(next);
	}
}

/**
 * 切换阅读方向
 */
export function toggleReadingDirection() {
	const settings = settingsManager.getSettings();
	const newDirection = settings.book.readingDirection === 'left-to-right' ? 'right-to-left' : 'left-to-right';
	settingsManager.updateSettings({
		book: {
			...settings.book,
			readingDirection: newDirection
		}
	});
}

/**
 * 向左翻页（方向性翻页，不受阅读方向影响）
 */
export async function pageLeft() {
	try {
		const snapshot = appState.getSnapshot();
		const currentIndex = bookStore.currentPageIndex;
		const step = snapshot.viewer.viewMode === 'double' ? 2 : 1;
		const targetIndex = Math.max(currentIndex - step, 0);
		await bookStore.navigateToPage(targetIndex);
	} catch (err) {
		console.error('Failed to turn page left:', err);
	}
}

/**
 * 向右翻页（方向性翻页，不受阅读方向影响）
 */
export async function pageRight() {
	try {
		const snapshot = appState.getSnapshot();
		const currentIndex = bookStore.currentPageIndex;
		const step = snapshot.viewer.viewMode === 'double' ? 2 : 1;
		const targetIndex = Math.min(currentIndex + step, bookStore.totalPages - 1);
		await bookStore.navigateToPage(targetIndex);
	} catch (err) {
		console.error('Failed to turn page right:', err);
	}
}
