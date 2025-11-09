/**
 * NeoView - UI Store
 * UI 状态管理 Store
 */

import { writable } from 'svelte/store';

// 侧边栏状态
export const sidebarOpen = writable<boolean>(true);
export const sidebarWidth = writable<number>(250);

// 右侧边栏状态
export const rightSidebarOpen = writable<boolean>(false);
export const rightSidebarWidth = writable<number>(250);
export type RightPanelType = 'info' | 'properties' | null;
export const activeRightPanel = writable<RightPanelType>(null);

// 全屏状态
export const isFullscreen = writable<boolean>(false);

// 加载状态
export const isLoading = writable<boolean>(false);

// 当前激活的面板
export type PanelType = 'folder' | 'history' | 'bookmark' | 'info' | 'thumbnails' | 'playlist' | 'thumbnail' | null;
export const activeUIPanel = writable<PanelType>('folder');

// 主题模式
export type ThemeMode = 'light' | 'dark' | 'system';
export const themeMode = writable<ThemeMode>('system');

// 缩放级别
export const zoomLevel = writable<number>(1.0);

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
