/**
 * FolderToolbar 共享类型定义
 */
import type { FolderViewStyle, FolderSortField } from '../../stores/folderPanelStore';
import type { TreePosition } from '$lib/stores/virtualPanelSettings.svelte';

/** 排序配置 */
export interface SortConfig {
	field: FolderSortField;
	order: 'asc' | 'desc';
}

/** 文件树配置 */
export interface FolderTreeConfig {
	visible: boolean;
	layout: TreePosition;
	size: number;
}

/** 排序锁定设置 */
export interface SortLockSettings {
	defaultScope: 'global' | 'tab';
	globalDefaultSortField: FolderSortField;
	globalDefaultSortOrder: 'asc' | 'desc';
	tabDefaultSortField: FolderSortField;
	tabDefaultSortOrder: 'asc' | 'desc';
	hasTemporaryRule: boolean;
	temporaryRulePath: string | null;
	sortSource: 'temporary' | 'memory' | 'tab-default' | 'global-default';
}

/** 视图样式定义 */
export interface ViewStyleDef {
	value: FolderViewStyle;
	icon: any;
	label: string;
}

/** 排序字段定义 */
export interface SortFieldDef {
	value: FolderSortField;
	label: string;
	icon: any;
}

/** 虚拟模式类型 */
export type VirtualMode = 'bookmark' | 'history' | null;
