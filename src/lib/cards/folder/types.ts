/**
 * FolderMainCard 类型定义
 * 集中管理所有相关类型，便于模块间共享
 */

import type { FsItem } from '$lib/types';
import type { Writable } from 'svelte/store';

// ============ Props ============

export interface FolderMainCardProps {
	/** 初始路径（可选，用于虚拟路径实例） */
	initialPath?: string;
}

// ============ 本地页签状态 ============

export interface LocalTabState {
	id: string;
	title: string;
	currentPath: string;
	homePath: string;
}

// ============ 导航命令 ============

export interface NavigationCommand {
	type: 'init' | 'push' | 'pop' | 'goto' | 'history';
	path?: string;
	index?: number;
	/** 目标标签页 ID（用于本地多标签页导航） */
	targetTabId?: string;
}

// ============ 右键菜单 ============

export interface ContextMenuState {
	x: number;
	y: number;
	item: FsItem | null;
	visible: boolean;
}

// ============ 确认对话框 ============

export interface ConfirmDialogConfig {
	title: string;
	description: string;
	confirmText?: string;
	variant?: 'default' | 'destructive' | 'warning';
	onConfirm: () => void;
}

// ============ 剪贴板 ============

export interface ClipboardState {
	paths: string[];
	operation: 'copy' | 'cut';
}

// ============ 搜索设置 ============

export interface SearchSettings {
	includeSubfolders: boolean;
	showHistoryOnFocus: boolean;
	searchInPath: boolean;
}

// ============ 实例状态 ============

export interface FolderInstanceState {
	/** 是否为虚拟路径实例 */
	isVirtual: boolean;
	/** 实例拥有的页签 ID */
	ownTabId: string | null;
	/** 本地页签状态（虚拟实例使用） */
	localTabState: LocalTabState | null;
	/** 主页路径 */
	homePath: string;
}

// ============ 操作回调 ============

export interface FolderActions {
	handleRefresh: () => void;
	handleNavigate: (path: string) => void;
	handleGoBack: () => void;
	handleGoForward: () => void;
	handleGoUp: () => void;
	handleGoHome: () => void;
	handleItemOpen: (item: FsItem) => Promise<void>;
	handleDelete: (item: FsItem) => void;
	handleBatchDelete: () => void;
	handleContextMenu: (event: MouseEvent, item: FsItem) => void;
	closeContextMenu: () => void;
}

// ============ 导出工具类型 ============

export type NavigationCommandStore = Writable<NavigationCommand | null>;
