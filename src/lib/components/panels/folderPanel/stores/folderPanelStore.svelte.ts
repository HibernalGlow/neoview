/**
 * FolderPanel Store - 文件面板状态管理
 * 参考 NeeView 的 FolderListViewModel 设计
 */

import { writable, derived, get } from 'svelte/store';
import type { FsItem } from '$lib/types';
import { browseDirectory } from '$lib/api/filesystem';
import { folderRatingStore } from '$lib/stores/emm/folderRating';
import { getDefaultRating } from '$lib/stores/emm/storage';

// ============ Types ============

export type FolderViewStyle = 'list' | 'content' | 'banner' | 'thumbnail';
export type FolderSortField = 'name' | 'date' | 'size' | 'type' | 'random' | 'rating' | 'path';
export type FolderSortOrder = 'asc' | 'desc';
export type DeleteStrategy = 'trash' | 'permanent';

export interface FolderHistoryEntry {
	path: string;
	displayName: string;
	timestamp: number;
	// 滚动位置（用于恢复视图状态）
	scrollTop: number;
	// 选中的文件路径（用于恢复选中状态）
	selectedItemPath: string | null;
	// 排序配置（保存当时的排序状态）
	sortField: FolderSortField;
	sortOrder: FolderSortOrder;
}

export interface FolderPanelState {
	// 当前路径
	currentPath: string;
	// 文件列表
	items: FsItem[];
	// 选中项
	selectedItems: Set<string>;
	// 当前选中项（单选）
	focusedItem: FsItem | null;
	// 加载状态
	loading: boolean;
	// 错误信息
	error: string | null;
	// 视图样式
	viewStyle: FolderViewStyle;
	// 排序字段
	sortField: FolderSortField;
	// 排序顺序
	sortOrder: FolderSortOrder;
	// 评分版本号（用于触发重新排序）
	ratingVersion: number;
	// 多选模式
	multiSelectMode: boolean;
	// 删除模式
	deleteMode: boolean;
	// 递归模式
	recursiveMode: boolean;
	// 搜索关键词
	searchKeyword: string;
	// 搜索结果
	searchResults: FsItem[];
	// 是否正在搜索
	isSearching: boolean;
	// 文件夹树可见
	folderTreeVisible: boolean;
	// 文件夹树布局
	folderTreeLayout: 'top' | 'left';
	// 文件夹树宽度/高度
	folderTreeSize: number;
	// 搜索栏可见
	showSearchBar: boolean;
	// 迁移栏可见
	showMigrationBar: boolean;
	// 穿透模式（当文件夹只有一个子文件时直接打开）
	penetrateMode: boolean;
	// 删除策略
	deleteStrategy: DeleteStrategy;
	// 搜索历史
	searchHistory: { query: string; timestamp: number }[];
	// 搜索设置
	searchSettings: {
		includeSubfolders: boolean;
		showHistoryOnFocus: boolean;
		searchInPath: boolean;
	};
	// 主视图树模式
	inlineTreeMode: boolean;
	// 展开的文件夹路径集合
	expandedFolders: Set<string>;
}

// ============ Initial State ============

const STORAGE_KEY = 'neoview-folder-panel';

function loadState(): Partial<FolderPanelState> {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			return JSON.parse(saved);
		}
	} catch (e) {
		console.error('[FolderPanelStore] Failed to load state:', e);
	}
	return {};
}

function saveState(state: Partial<FolderPanelState>) {
	try {
		const toSave = {
			viewStyle: state.viewStyle,
			sortField: state.sortField,
			sortOrder: state.sortOrder,
			folderTreeVisible: state.folderTreeVisible,
			folderTreeLayout: state.folderTreeLayout,
			folderTreeSize: state.folderTreeSize,
			recursiveMode: state.recursiveMode,
			deleteStrategy: state.deleteStrategy
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
	} catch (e) {
		console.error('[FolderPanelStore] Failed to save state:', e);
	}
}

const savedState = loadState();

const initialState: FolderPanelState = {
	currentPath: '',
	items: [],
	selectedItems: new Set(),
	focusedItem: null,
	loading: false,
	error: null,
	viewStyle: savedState.viewStyle ?? 'list',
	sortField: savedState.sortField ?? 'name',
	sortOrder: savedState.sortOrder ?? 'asc',
	ratingVersion: 0,
	multiSelectMode: false,
	deleteMode: false,
	recursiveMode: savedState.recursiveMode ?? false,
	searchKeyword: '',
	searchResults: [],
	isSearching: false,
	folderTreeVisible: savedState.folderTreeVisible ?? false,
	folderTreeLayout: savedState.folderTreeLayout ?? 'left',
	folderTreeSize: savedState.folderTreeSize ?? 200,
	showSearchBar: false,
	showMigrationBar: false,
	penetrateMode: false,
	deleteStrategy: savedState.deleteStrategy ?? 'trash',
	searchHistory: [],
	searchSettings: {
		includeSubfolders: true,
		showHistoryOnFocus: true,
		searchInPath: false
	},
	inlineTreeMode: false,
	expandedFolders: new Set<string>()
};

// ============ Stores ============

// 主状态
const state = writable<FolderPanelState>(initialState);

// 导航历史
const historyStack = writable<FolderHistoryEntry[]>([]);
const historyIndex = writable<number>(-1);

// Home 路径
const homePath = writable<string>('');

// 外部导航请求（供历史面板、书签面板等外部组件触发导航）
const externalNavigationRequest = writable<{ path: string; timestamp: number } | null>(null);

// 导出外部导航请求 store
export { externalNavigationRequest };

// ============ 文件系统缓存（参考 NeeView 的 FolderEntryCollection）============
// 缓存已加载的目录内容，避免重复从磁盘读取
const directoryCache = new Map<string, { items: FsItem[]; timestamp: number }>();
const CACHE_TTL = 30000; // 缓存有效期 30 秒

// 获取缓存的目录内容
function getCachedDirectory(path: string): FsItem[] | null {
	const key = normalizePath(path);
	const cached = directoryCache.get(key);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return cached.items;
	}
	return null;
}

// 设置目录缓存
function setCachedDirectory(path: string, items: FsItem[]) {
	const key = normalizePath(path);
	directoryCache.set(key, { items, timestamp: Date.now() });
}

// 清除目录缓存
function clearDirectoryCache(path?: string) {
	if (path) {
		const key = normalizePath(path);
		directoryCache.delete(key);
	} else {
		directoryCache.clear();
	}
}

// 路径状态字典 - 按路径保存选中项位置（参考 NeeView 的 _lastPlaceDictionary 和 FolderItemPosition）
interface FolderItemPosition {
	// 选中项的路径
	path: string | null;
	// 选中项在列表中的索引
	index: number;
}

// 导出类型供外部使用
export type { FolderItemPosition };

const lastPlaceDictionary = new Map<string, FolderItemPosition>();

// 规范化路径用于字典 key
function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').toLowerCase();
}

// ============ Derived Stores ============

// 当前路径
export const currentPath = derived(state, ($state) => $state.currentPath);

// 文件列表
export const items = derived(state, ($state) => $state.items);

// 排序后的文件列表
export const sortedItems = derived(state, ($state) => {
	return sortItems($state.items, $state.sortField, $state.sortOrder);
});

// 选中项
export const selectedItems = derived(state, ($state) => $state.selectedItems);

// 加载状态
export const loading = derived(state, ($state) => $state.loading);

// 错误信息
export const error = derived(state, ($state) => $state.error);

// 视图样式
export const viewStyle = derived(state, ($state) => $state.viewStyle);

// 排序配置
export const sortConfig = derived(state, ($state) => ({
	field: $state.sortField,
	order: $state.sortOrder
}));

// 多选模式
export const multiSelectMode = derived(state, ($state) => $state.multiSelectMode);

// 删除模式
export const deleteMode = derived(state, ($state) => $state.deleteMode);

// 递归模式
export const recursiveMode = derived(state, ($state) => $state.recursiveMode);

// 搜索关键词
export const searchKeyword = derived(state, ($state) => $state.searchKeyword);

// 搜索结果
export const searchResults = derived(state, ($state) => $state.searchResults);

// 是否正在搜索
export const isSearching = derived(state, ($state) => $state.isSearching);

// 搜索设置
export const searchSettings = derived(state, ($state) => $state.searchSettings);

// 文件夹树配置
export const folderTreeConfig = derived(state, ($state) => ({
	visible: $state.folderTreeVisible,
	layout: $state.folderTreeLayout,
	size: $state.folderTreeSize
}));

// 搜索栏可见
export const showSearchBar = derived(state, ($state) => $state.showSearchBar);

// 迁移栏可见
export const showMigrationBar = derived(state, ($state) => $state.showMigrationBar);

// 穿透模式
export const penetrateMode = derived(state, ($state) => $state.penetrateMode);

// 删除策略
export const deleteStrategy = derived(state, ($state) => $state.deleteStrategy);

// 主视图树模式
export const inlineTreeMode = derived(state, ($state) => $state.inlineTreeMode);

// 展开的文件夹
export const expandedFolders = derived(state, ($state) => $state.expandedFolders);

// 可以后退
export const canGoBack = derived(
	[historyStack, historyIndex],
	([_stack, $index]) => $index > 0
);

// 可以前进
export const canGoForward = derived(
	[historyStack, historyIndex],
	([$stack, $index]) => $index < $stack.length - 1
);

// 可以向上
export const canGoUp = derived(state, ($state) => {
	if (!$state.currentPath) return false;
	// 检查是否已经是根路径
	const normalized = $state.currentPath.replace(/\\/g, '/');
	return normalized.split('/').filter(Boolean).length > 1;
});

// 文件数量
export const itemCount = derived(state, ($state) => $state.items.length);

// ============ Helper Functions ============

function sortItems(items: FsItem[], field: FolderSortField, order: FolderSortOrder): FsItem[] {
	// 随机排序特殊处理
	if (field === 'random') {
		const shuffled = [...items];
		// Fisher-Yates 洗牌算法
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		return shuffled;
	}

	// rating 排序：使用 folderRatingStore.getEffectiveRating 获取评分
	// 规则：文件夹在前，无 rating 使用默认评分，手动评分优先
	if (field === 'rating') {
		const defaultRating = getDefaultRating();
		const sorted = [...items].sort((a, b) => {
			// 文件夹优先
			if (a.isDir !== b.isDir) {
				return a.isDir ? -1 : 1;
			}

			// 从 folderRatingStore 获取有效评分
			const ratingA = folderRatingStore.getEffectiveRating(a.path) ?? defaultRating;
			const ratingB = folderRatingStore.getEffectiveRating(b.path) ?? defaultRating;

			// 评分相同则按名称排序
			if (ratingA === ratingB) {
				return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
			}

			const comparison = ratingA - ratingB;
			return order === 'asc' ? comparison : -comparison;
		});
		return sorted;
	}

	const sorted = [...items].sort((a, b) => {
		// 文件夹优先
		if (a.isDir !== b.isDir) {
			return a.isDir ? -1 : 1;
		}

		let comparison = 0;
		switch (field) {
			case 'name':
				comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
				break;
			case 'date':
				comparison = (a.modified || 0) - (b.modified || 0);
				break;
			case 'size':
				comparison = (a.size || 0) - (b.size || 0);
				break;
			case 'type': {
				const extA = a.name.split('.').pop()?.toLowerCase() || '';
				const extB = b.name.split('.').pop()?.toLowerCase() || '';
				comparison = extA.localeCompare(extB);
				break;
			}
		}

		return order === 'asc' ? comparison : -comparison;
	});

	return sorted;
}

function getDisplayName(path: string): string {
	if (!path) return '';
	const normalized = path.replace(/\\/g, '/');
	const parts = normalized.split('/').filter(Boolean);
	return parts[parts.length - 1] || path;
}

function getParentPath(path: string): string | null {
	if (!path) return null;
	const normalized = path.replace(/\\/g, '/');
	const parts = normalized.split('/').filter(Boolean);
	if (parts.length <= 1) return null;
	parts.pop();
	// 保持原始路径格式（Windows 盘符）
	if (path.includes(':')) {
		return parts.join('/');
	}
	return '/' + parts.join('/');
}

// 书籍候选判断函数
const archiveExtensions = ['.zip', '.cbz', '.rar', '.cbr', '.7z', '.cb7', '.tar', '.tar.gz', '.tgz'];
const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', 'nov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg'];

function isArchiveFile(path: string): boolean {
	const lower = path.toLowerCase();
	return archiveExtensions.some((ext) => lower.endsWith(ext)) || lower.endsWith('.pdf');
}

function isVideoFile(path: string): boolean {
	const lower = path.toLowerCase();
	return videoExtensions.some((ext) => lower.endsWith(ext));
}

function isBookCandidate(item: FsItem): boolean {
	return isArchiveFile(item.path) || isVideoFile(item.path);
}

// ============ Actions ============

// 当前滚动位置（由 FolderList 组件更新）
let currentScrollTop = 0;

export const folderPanelActions = {
	/**
	 * 获取当前状态
	 */
	getState() {
		return get(state);
	},

	/**
	 * 更新当前滚动位置（由列表组件调用）
	 */
	updateScrollPosition(scrollTop: number) {
		currentScrollTop = scrollTop;
	},

	/**
	 * 保存当前路径的状态到字典（参考 NeeView 的 SavePlace）
	 * @param selectedItem 当前选中项
	 * @param selectedIndex 当前选中项索引
	 */
	savePlace(selectedItem: FsItem | null, selectedIndex: number) {
		const currentState = get(state);
		if (!currentState.currentPath) return;
		if (!selectedItem) return;

		const position: FolderItemPosition = {
			path: selectedItem.path,
			index: selectedIndex
		};

		const key = normalizePath(currentState.currentPath);
		lastPlaceDictionary.set(key, position);
	},

	/**
	 * 获取路径的保存位置
	 */
	getSavedPosition(path: string): FolderItemPosition | null {
		const key = normalizePath(path);
		return lastPlaceDictionary.get(key) ?? null;
	},

	/**
	 * 设置当前路径并加载内容
	 * @param path 目标路径
	 * @param addToHistory 是否添加到历史记录
	 * @returns 目标路径的保存状态（如果有）
	 */
	setPath(path: string, addToHistory = true): FolderItemPosition | null {
		// 获取目标路径的保存位置
		const targetPosition = this.getSavedPosition(path);

		state.update((s) => ({ ...s, currentPath: path, loading: true, error: null }));

		if (addToHistory && path) {
			const currentState = get(state);
			const entry: FolderHistoryEntry = {
				path,
				displayName: getDisplayName(path),
				timestamp: Date.now(),
				scrollTop: 0,
				selectedItemPath: targetPosition?.path ?? null,
				sortField: currentState.sortField,
				sortOrder: currentState.sortOrder
			};

			historyStack.update((stack) => {
				const currentIndex = get(historyIndex);
				// 截断当前位置之后的历史
				const newStack = stack.slice(0, currentIndex + 1);
				newStack.push(entry);
				// 限制历史长度
				if (newStack.length > 50) {
					newStack.shift();
				}
				return newStack;
			});

			historyIndex.update(() => {
				const stack = get(historyStack);
				return stack.length - 1;
			});
		}

		return targetPosition;
	},

	/**
	 * 设置文件列表并缓存，同时预加载评分数据
	 */
	setItems(items: FsItem[]) {
		const currentState = get(state);
		// 缓存目录内容
		if (currentState.currentPath) {
			setCachedDirectory(currentState.currentPath, items);
		}
		state.update((s) => ({ ...s, items, loading: false, error: null }));
	},

	/**
	 * 获取缓存的目录内容
	 */
	getCachedItems(path: string): FsItem[] | null {
		return getCachedDirectory(path);
	},

	/**
	 * 清除目录缓存
	 */
	clearCache(path?: string) {
		clearDirectoryCache(path);
	},

	/**
	 * 设置加载状态
	 */
	setLoading(loading: boolean) {
		state.update((s) => ({ ...s, loading }));
	},

	/**
	 * 设置错误
	 */
	setError(error: string | null) {
		state.update((s) => ({ ...s, error, loading: false }));
	},

	/**
	 * 后退 - 返回目标路径和保存的位置
	 */
	goBack(): { path: string; position: FolderItemPosition | null } | null {
		const stack = get(historyStack);
		const index = get(historyIndex);
		if (index > 0) {
			const newIndex = index - 1;
			historyIndex.set(newIndex);
			const entry = stack[newIndex];
			// 获取目标路径的保存位置
			const position = this.getSavedPosition(entry.path);
			state.update((s) => ({ ...s, currentPath: entry.path }));
			return { path: entry.path, position };
		}
		return null;
	},

	/**
	 * 前进 - 返回目标路径和保存的位置
	 */
	goForward(): { path: string; position: FolderItemPosition | null } | null {
		const stack = get(historyStack);
		const index = get(historyIndex);
		if (index < stack.length - 1) {
			const newIndex = index + 1;
			historyIndex.set(newIndex);
			const entry = stack[newIndex];
			// 获取目标路径的保存位置
			const position = this.getSavedPosition(entry.path);
			state.update((s) => ({ ...s, currentPath: entry.path }));
			return { path: entry.path, position };
		}
		return null;
	},

	/**
	 * 向上导航
	 */
	goUp(): string | null {
		const currentState = get(state);
		const parent = getParentPath(currentState.currentPath);
		if (parent) {
			this.setPath(parent);
			return parent;
		}
		return null;
	},

	/**
	 * 回到 Home
	 */
	goHome(): string | null {
		const home = get(homePath);
		if (home) {
			this.setPath(home);
			return home;
		}
		return null;
	},

	/**
	 * 设置 Home 路径
	 */
	setHomePath(path: string) {
		homePath.set(path);
	},

	/**
	 * 导航到指定路径（供外部调用，如历史面板、书签面板同步）
	 * 这个方法会触发 FolderStack 的导航命令
	 */
	async navigateToPath(targetPath: string | null | undefined) {
		if (!targetPath) return;
		
		// 规范化路径
		let normalizedPath = targetPath.replace(/\\/g, '/');
		// 移除末尾的分隔符（除非是根目录）
		if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
			normalizedPath = normalizedPath.slice(0, -1);
		}
		
		// 获取父目录（如果路径指向文件）
		// 通过检查路径是否有扩展名来判断是否是文件
		const lastPart = normalizedPath.split('/').pop() || '';
		const hasExtension = lastPart.includes('.') && !lastPart.startsWith('.');
		
		let dirPath = normalizedPath;
		if (hasExtension) {
			// 可能是文件，获取父目录
			const lastSlash = normalizedPath.lastIndexOf('/');
			if (lastSlash > 0) {
				dirPath = normalizedPath.substring(0, lastSlash);
			}
		}
		
		// 发送外部导航请求（FolderPanel 会监听并处理）
		externalNavigationRequest.set({ path: dirPath, timestamp: Date.now() });
		console.log('[FolderPanelStore] navigateToPath:', dirPath);
	},

	/**
	 * 获取历史记录
	 */
	getHistory(): { previous: FolderHistoryEntry[]; next: FolderHistoryEntry[] } {
		const stack = get(historyStack);
		const index = get(historyIndex);
		return {
			previous: stack.slice(0, index).reverse(),
			next: stack.slice(index + 1)
		};
	},

	/**
	 * 跳转到历史记录
	 */
	goToHistory(targetIndex: number): string | null {
		const stack = get(historyStack);
		if (targetIndex >= 0 && targetIndex < stack.length) {
			historyIndex.set(targetIndex);
			const entry = stack[targetIndex];
			state.update((s) => ({ ...s, currentPath: entry.path }));
			return entry.path;
		}
		return null;
	},

	/**
	 * 设置视图样式
	 */
	setViewStyle(style: FolderViewStyle) {
		state.update((s) => {
			const newState = { ...s, viewStyle: style };
			saveState(newState);
			return newState;
		});
	},

	/**
	 * 设置排序
	 */
	setSort(field: FolderSortField, order?: FolderSortOrder) {
		state.update((s) => {
			const newOrder = order ?? (s.sortField === field && s.sortOrder === 'asc' ? 'desc' : 'asc');
			const newState = { ...s, sortField: field, sortOrder: newOrder };
			saveState(newState);
			return newState;
		});
	},

	/**
	 * 切换多选模式
	 */
	toggleMultiSelectMode() {
		state.update((s) => ({ ...s, multiSelectMode: !s.multiSelectMode }));
	},

	/**
	 * 切换删除模式
	 */
	toggleDeleteMode() {
		state.update((s) => ({ ...s, deleteMode: !s.deleteMode }));
	},

	/**
	 * 切换递归模式
	 */
	toggleRecursiveMode() {
		state.update((s) => {
			const newState = { ...s, recursiveMode: !s.recursiveMode };
			saveState(newState);
			return newState;
		});
	},

	/**
	 * 设置搜索关键词
	 */
	setSearchKeyword(keyword: string) {
		state.update((s) => ({ ...s, searchKeyword: keyword }));
	},

	/**
	 * 设置搜索结果
	 */
	setSearchResults(results: FsItem[]) {
		state.update((s) => ({ ...s, searchResults: results }));
	},

	/**
	 * 设置搜索状态
	 */
	setIsSearching(searching: boolean) {
		state.update((s) => ({ ...s, isSearching: searching }));
	},

	/**
	 * 清除搜索
	 */
	clearSearch() {
		state.update((s) => ({ ...s, searchKeyword: '', searchResults: [], isSearching: false }));
	},

	/**
	 * 设置搜索设置
	 */
	setSearchSettings(settings: { includeSubfolders?: boolean; showHistoryOnFocus?: boolean; searchInPath?: boolean }) {
		state.update((s) => ({
			...s,
			searchSettings: { ...s.searchSettings, ...settings }
		}));
	},

	/**
	 * 切换文件夹树可见性
	 */
	toggleFolderTree() {
		state.update((s) => {
			const newState = { ...s, folderTreeVisible: !s.folderTreeVisible };
			saveState(newState);
			return newState;
		});
	},

	/**
	 * 设置文件夹树布局
	 */
	setFolderTreeLayout(layout: 'top' | 'left') {
		state.update((s) => {
			const newState = { ...s, folderTreeLayout: layout };
			saveState(newState);
			return newState;
		});
	},

	/**
	 * 设置文件夹树大小
	 */
	setFolderTreeSize(size: number) {
		state.update((s) => {
			const newState = { ...s, folderTreeSize: size };
			saveState(newState);
			return newState;
		});
	},

	/**
	 * 切换搜索栏可见性
	 */
	toggleShowSearchBar() {
		state.update((s) => ({ ...s, showSearchBar: !s.showSearchBar }));
	},

	/**
	 * 切换迁移栏可见性
	 */
	toggleShowMigrationBar() {
		state.update((s) => ({ ...s, showMigrationBar: !s.showMigrationBar }));
	},

	/**
	 * 切换穿透模式
	 */
	togglePenetrateMode() {
		state.update((s) => ({ ...s, penetrateMode: !s.penetrateMode }));
	},

	/**
	 * 设置删除策略
	 */
	setDeleteStrategy(strategy: DeleteStrategy) {
		state.update((s) => {
			const newState = { ...s, deleteStrategy: strategy };
			saveState(newState);
			return newState;
		});
	},

	/**
	 * 切换删除策略
	 */
	toggleDeleteStrategy() {
		state.update((s) => {
			const next: DeleteStrategy = s.deleteStrategy === 'trash' ? 'permanent' : 'trash';
			const newState = { ...s, deleteStrategy: next };
			saveState(newState);
			return newState;
		});
	},

	/**
	 * 切换主视图树模式
	 */
	toggleInlineTreeMode() {
		state.update((s) => ({ ...s, inlineTreeMode: !s.inlineTreeMode }));
	},

	/**
	 * 展开文件夹（主视图树）
	 */
	expandFolder(path: string) {
		state.update((s) => {
			const newExpanded = new Set(s.expandedFolders);
			newExpanded.add(path);
			return { ...s, expandedFolders: newExpanded };
		});
	},

	/**
	 * 折叠文件夹（主视图树）
	 */
	collapseFolder(path: string) {
		state.update((s) => {
			const newExpanded = new Set(s.expandedFolders);
			newExpanded.delete(path);
			// 同时折叠所有子文件夹
			for (const p of newExpanded) {
				if (p.startsWith(path + '/') || p.startsWith(path + '\\')) {
					newExpanded.delete(p);
				}
			}
			return { ...s, expandedFolders: newExpanded };
		});
	},

	/**
	 * 切换文件夹展开状态（主视图树）
	 */
	toggleFolderExpand(path: string) {
		const currentState = get(state);
		if (currentState.expandedFolders.has(path)) {
			this.collapseFolder(path);
		} else {
			this.expandFolder(path);
		}
	},

	/**
	 * 清除所有展开状态
	 */
	clearExpandedFolders() {
		state.update((s) => ({ ...s, expandedFolders: new Set<string>() }));
	},

	/**
	 * 选择项
	 */
	selectItem(path: string, toggle = false) {
		state.update((s) => {
			const newSelected = new Set<string>(s.selectedItems);
			if (toggle) {
				if (newSelected.has(path)) {
					newSelected.delete(path);
				} else {
					newSelected.add(path);
				}
			} else {
				newSelected.clear();
				newSelected.add(path);
			}
			return { ...s, selectedItems: newSelected };
		});
	},

	/**
	 * 全选
	 */
	selectAll() {
		state.update((s) => {
			const newSelected = new Set<string>(s.items.map((item) => item.path));
			return { ...s, selectedItems: newSelected };
		});
	},

	/**
	 * 取消全选
	 */
	deselectAll() {
		state.update((s) => ({ ...s, selectedItems: new Set<string>() }));
	},

	/**
	 * 设置焦点项
	 */
	setFocusedItem(item: FsItem | null) {
		state.update((s) => ({ ...s, focusedItem: item }));
	},

	/**
	 * 清除历史
	 */
	clearHistory() {
		const currentState = get(state);
		historyStack.set([{
			path: currentState.currentPath,
			displayName: getDisplayName(currentState.currentPath),
			timestamp: Date.now(),
			scrollTop: 0,
			selectedItemPath: null,
			sortField: currentState.sortField,
			sortOrder: currentState.sortOrder
		}]);
		historyIndex.set(0);
	},

	/**
	 * 恢复历史条目的状态（滚动位置和选中项）
	 * 返回需要恢复的状态信息
	 */
	getRestoreState(entry: FolderHistoryEntry): { scrollTop: number; selectedItemPath: string | null } {
		return {
			scrollTop: entry.scrollTop,
			selectedItemPath: entry.selectedItemPath
		};
	},

	/**
	 * 重置状态
	 */
	reset() {
		state.set(initialState);
		historyStack.set([]);
		historyIndex.set(-1);
	},

	/**
	 * 查找相邻的书籍路径（按当前排序）- 同步版本
	 */
	findAdjacentBookPath(currentBookPath: string | null, direction: 'next' | 'previous'): string | null {
		const currentState = get(state);
		let itemsToUse = currentState.items;
		
		// 如果 items 为空但 currentPath 存在，尝试从缓存加载
		if (itemsToUse.length === 0 && currentState.currentPath) {
			const cached = getCachedDirectory(currentState.currentPath);
			if (cached) {
				itemsToUse = cached;
			}
		}
		
		if (itemsToUse.length === 0) return null;
		
		const sortedItemList = sortItems(itemsToUse, currentState.sortField, currentState.sortOrder);
		const bookItems = sortedItemList.filter(isBookCandidate);
		
		if (bookItems.length === 0) return null;

		const normalizedCurrent = currentBookPath ? normalizePath(currentBookPath) : null;
		
		let currentIndex = bookItems.findIndex(item => 
			normalizedCurrent && normalizePath(item.path) === normalizedCurrent
		);

		if (currentIndex === -1) {
			currentIndex = direction === 'next' ? -1 : bookItems.length;
		}

		const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
		
		if (targetIndex < 0 || targetIndex >= bookItems.length) {
			return null;
		}
		return bookItems[targetIndex].path;
	},

	/**
	 * 查找相邻的书籍路径（按当前排序）- 异步版本
	 */
	async findAdjacentBookPathAsync(currentBookPath: string | null, direction: 'next' | 'previous'): Promise<string | null> {
		const currentState = get(state);
		let itemsToUse = currentState.items;
		
		// 如果 items 为空，尝试从文件系统加载
		if (itemsToUse.length === 0) {
			let dirPath = currentState.currentPath;
			if (!dirPath && currentBookPath) {
				const normalized = currentBookPath.replace(/\\/g, '/');
				const lastSlash = normalized.lastIndexOf('/');
				if (lastSlash > 0) {
					dirPath = normalized.substring(0, lastSlash);
				}
			}
			
			if (dirPath) {
				try {
					itemsToUse = await browseDirectory(dirPath);
					setCachedDirectory(dirPath, itemsToUse);
				} catch (e) {
					console.error(`[FolderPanel] 加载目录失败:`, e);
					return null;
				}
			}
		}
		
		if (itemsToUse.length === 0) return null;
		
		const sortedItemList = sortItems(itemsToUse, currentState.sortField, currentState.sortOrder);
		const bookItems = sortedItemList.filter(isBookCandidate);
		
		if (bookItems.length === 0) return null;

		const normalizedCurrent = currentBookPath ? normalizePath(currentBookPath) : null;
		
		let currentIndex = bookItems.findIndex(item => 
			normalizedCurrent && normalizePath(item.path) === normalizedCurrent
		);

		if (currentIndex === -1) {
			currentIndex = direction === 'next' ? -1 : bookItems.length;
		}

		const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
		
		if (targetIndex < 0 || targetIndex >= bookItems.length) {
			return null;
		}
		return bookItems[targetIndex].path;
	}
};

// 导出 store 订阅
export const folderPanelState = {
	subscribe: state.subscribe
};
