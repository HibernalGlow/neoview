/**
 * FolderPanel Store - 类型定义
 * 包含所有面板状态相关的类型定义
 */

import type { FsItem } from '$lib/types';

// ============ 基础类型 ============

/** 文件夹视图样式 */
export type FolderViewStyle = 'list' | 'content' | 'banner' | 'thumbnail';

/** 文件夹排序字段 */
export type FolderSortField = 'name' | 'date' | 'size' | 'type' | 'random' | 'rating' | 'path' | 'collectTagCount';

/** 文件夹排序顺序 */
export type FolderSortOrder = 'asc' | 'desc';

/** 删除策略 */
export type DeleteStrategy = 'trash' | 'permanent';

// ============ 历史记录类型 ============

/** 文件夹历史记录条目 */
export interface FolderHistoryEntry {
	/** 路径 */
	path: string;
	/** 显示名称 */
	displayName: string;
	/** 时间戳 */
	timestamp: number;
	/** 滚动位置（用于恢复视图状态） */
	scrollTop: number;
	/** 选中的文件路径（用于恢复选中状态） */
	selectedItemPath: string | null;
	/** 排序字段（保存当时的排序状态） */
	sortField: FolderSortField;
	/** 排序顺序 */
	sortOrder: FolderSortOrder;
}

// ============ 位置状态类型 ============

/** 文件夹项位置（参考 NeeView 的 FolderItemPosition） */
export interface FolderItemPosition {
	/** 选中项的路径 */
	path: string | null;
	/** 选中项在列表中的索引 */
	index: number;
}

// ============ 搜索设置类型 ============

/** 搜索设置 */
export interface SearchSettings {
	/** 是否包含子文件夹 */
	includeSubfolders: boolean;
	/** 聚焦时是否显示历史 */
	showHistoryOnFocus: boolean;
	/** 是否在路径中搜索 */
	searchInPath: boolean;
}

/** 排序配置 */
export interface SortConfig {
	field: FolderSortField;
	order: FolderSortOrder;
}

/** 文件夹树配置 */
export interface FolderTreeConfig {
	visible: boolean;
	layout: 'top' | 'left';
	size: number;
}

/** 历史记录列表（用于前进/后退面板） */
export interface HistoryRecord {
	previous: FolderHistoryEntry[];
	next: FolderHistoryEntry[];
}

// ============ 主状态类型 ============

/** 文件夹面板状态 */
export interface FolderPanelState {
	/** 当前路径 */
	currentPath: string;
	/** 文件列表 */
	items: FsItem[];
	/** 选中项集合 */
	selectedItems: Set<string>;
	/** 当前焦点项（单选） */
	focusedItem: FsItem | null;
	/** 加载状态 */
	loading: boolean;
	/** 错误信息 */
	error: string | null;
	/** 视图样式 */
	viewStyle: FolderViewStyle;
	/** 排序字段 */
	sortField: FolderSortField;
	/** 排序顺序 */
	sortOrder: FolderSortOrder;
	/** 评分版本号（用于触发重新排序） */
	ratingVersion: number;
	/** 多选模式 */
	multiSelectMode: boolean;
	/** 删除模式 */
	deleteMode: boolean;
	/** 递归模式 */
	recursiveMode: boolean;
	/** 搜索关键词 */
	searchKeyword: string;
	/** 搜索结果 */
	searchResults: FsItem[];
	/** 是否正在搜索 */
	isSearching: boolean;
	/** 文件夹树可见 */
	folderTreeVisible: boolean;
	/** 文件夹树布局 */
	folderTreeLayout: 'top' | 'left';
	/** 文件夹树宽度/高度 */
	folderTreeSize: number;
	/** 搜索栏可见 */
	showSearchBar: boolean;
	/** 迁移栏可见 */
	showMigrationBar: boolean;
	/** 穿透模式（当文件夹只有一个子文件时直接打开） */
	penetrateMode: boolean;
	/** 删除策略 */
	deleteStrategy: DeleteStrategy;
	/** 搜索历史 */
	searchHistory: { query: string; timestamp: number }[];
	/** 搜索设置 */
	searchSettings: SearchSettings;
	/** 主视图树模式 */
	inlineTreeMode: boolean;
	/** 展开的文件夹路径集合 */
	expandedFolders: Set<string>;
}

// ============ 导出 FsItem 类型 ============

export type { FsItem };
