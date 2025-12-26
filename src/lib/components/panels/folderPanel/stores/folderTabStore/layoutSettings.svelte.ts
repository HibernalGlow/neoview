/**
 * 布局设置模块
 * 包含标签栏、面包屑、工具栏位置设置
 */

import { writable } from 'svelte/store';
import type {
TabBarLayout,
BreadcrumbPosition,
ToolbarPosition,
PanelMode
} from './types';
import {
getPerPanelLayoutSettings,
setPerPanelLayoutSettings
} from './tabManagement.svelte';
import { savePerPanelLayoutSettings } from './utils.svelte';

// ============ 初始化布局设置 ============

const perPanelLayoutSettings = getPerPanelLayoutSettings();

// ============ 按面板类型的布局设置 Stores ============

// folder 面板
export const folderTabBarLayout = writable<TabBarLayout>(perPanelLayoutSettings.folder.tabBarLayout);
export const folderTabBarWidth = writable<number>(perPanelLayoutSettings.folder.tabBarWidth);
export const folderBreadcrumbPosition = writable<BreadcrumbPosition>(perPanelLayoutSettings.folder.breadcrumbPosition);
export const folderToolbarPosition = writable<ToolbarPosition>(perPanelLayoutSettings.folder.toolbarPosition);

// bookmark 面板
export const bookmarkTabBarLayout = writable<TabBarLayout>(perPanelLayoutSettings.bookmark.tabBarLayout);
export const bookmarkTabBarWidth = writable<number>(perPanelLayoutSettings.bookmark.tabBarWidth);
export const bookmarkBreadcrumbPosition = writable<BreadcrumbPosition>(perPanelLayoutSettings.bookmark.breadcrumbPosition);
export const bookmarkToolbarPosition = writable<ToolbarPosition>(perPanelLayoutSettings.bookmark.toolbarPosition);

// history 面板
export const historyTabBarLayout = writable<TabBarLayout>(perPanelLayoutSettings.history.tabBarLayout);
export const historyTabBarWidth = writable<number>(perPanelLayoutSettings.history.tabBarWidth);
export const historyBreadcrumbPosition = writable<BreadcrumbPosition>(perPanelLayoutSettings.history.breadcrumbPosition);
export const historyToolbarPosition = writable<ToolbarPosition>(perPanelLayoutSettings.history.toolbarPosition);

// 兼容旧代码：默认使用 folder 面板的设置
export const tabBarLayout = folderTabBarLayout;
export const tabBarWidth = folderTabBarWidth;
export const breadcrumbPosition = folderBreadcrumbPosition;
export const toolbarPosition = folderToolbarPosition;

// ============ 获取指定面板的布局设置 Stores ============

export function getPanelLayoutStores(mode: PanelMode) {
switch (mode) {
case 'bookmark':
return {
tabBarLayout: bookmarkTabBarLayout,
tabBarWidth: bookmarkTabBarWidth,
breadcrumbPosition: bookmarkBreadcrumbPosition,
toolbarPosition: bookmarkToolbarPosition
};
case 'history':
return {
tabBarLayout: historyTabBarLayout,
tabBarWidth: historyTabBarWidth,
breadcrumbPosition: historyBreadcrumbPosition,
toolbarPosition: historyToolbarPosition
};
default:
return {
tabBarLayout: folderTabBarLayout,
tabBarWidth: folderTabBarWidth,
breadcrumbPosition: folderBreadcrumbPosition,
toolbarPosition: folderToolbarPosition
};
}
}

// ============ 布局设置操作 ============

/** 设置标签栏位置（按面板类型） */
export function setTabBarLayout(layout: TabBarLayout, mode: PanelMode = 'folder'): void {
const settings = getPerPanelLayoutSettings();
settings[mode].tabBarLayout = layout;
setPerPanelLayoutSettings(settings);
savePerPanelLayoutSettings(settings);
getPanelLayoutStores(mode).tabBarLayout.set(layout);
}

/** 获取标签栏位置（按面板类型） */
export function getTabBarLayout(mode: PanelMode = 'folder'): TabBarLayout {
return getPerPanelLayoutSettings()[mode].tabBarLayout;
}

/** 设置标签栏宽度（左右布局时，按面板类型） */
export function setTabBarWidth(width: number, mode: PanelMode = 'folder'): void {
const settings = getPerPanelLayoutSettings();
settings[mode].tabBarWidth = width;
setPerPanelLayoutSettings(settings);
savePerPanelLayoutSettings(settings);
getPanelLayoutStores(mode).tabBarWidth.set(width);
}

/** 获取标签栏宽度（按面板类型） */
export function getTabBarWidth(mode: PanelMode = 'folder'): number {
return getPerPanelLayoutSettings()[mode].tabBarWidth;
}

/** 设置面包屑位置（按面板类型） */
export function setBreadcrumbPosition(position: BreadcrumbPosition, mode: PanelMode = 'folder'): void {
const settings = getPerPanelLayoutSettings();
settings[mode].breadcrumbPosition = position;
setPerPanelLayoutSettings(settings);
savePerPanelLayoutSettings(settings);
getPanelLayoutStores(mode).breadcrumbPosition.set(position);
}

/** 获取面包屑位置（按面板类型） */
export function getBreadcrumbPosition(mode: PanelMode = 'folder'): BreadcrumbPosition {
return getPerPanelLayoutSettings()[mode].breadcrumbPosition;
}

/** 设置工具栏位置（按面板类型） */
export function setToolbarPosition(position: ToolbarPosition, mode: PanelMode = 'folder'): void {
const settings = getPerPanelLayoutSettings();
settings[mode].toolbarPosition = position;
setPerPanelLayoutSettings(settings);
savePerPanelLayoutSettings(settings);
getPanelLayoutStores(mode).toolbarPosition.set(position);
}

/** 获取工具栏位置（按面板类型） */
export function getToolbarPosition(mode: PanelMode = 'folder'): ToolbarPosition {
return getPerPanelLayoutSettings()[mode].toolbarPosition;
}
