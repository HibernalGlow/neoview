<script lang="ts">
	/**
	 * NeoView - Bookmark Panel Component
	 * 书签面板 - 使用 bookmarkStore 和 FileItemCard
	 * 支持列表和网格视图
	 */
	import {
		Bookmark,
		X,
		Star,
		Grid3x3,
		List,
		Activity,
		Trash2,
		ExternalLink,
		Copy,
		FolderOpen,
		Search
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import SearchBar from '$lib/components/ui/SearchBar.svelte';
	import { bookmarkStore } from '$lib/stores/bookmark.svelte';
	import VirtualizedFileListV2 from './file/components/VirtualizedFileListV2.svelte';
	import FolderContextMenu from './folderPanel/components/FolderContextMenu.svelte';
	import PanelToolbar, { type SortField, type SortOrder, type ViewMode } from './shared/PanelToolbar.svelte';
	import type { FsItem } from '$lib/types';
	import { FileSystemAPI } from '$lib/api';
	import { bookStore } from '$lib/stores/book.svelte';
	import { requestVisibleThumbnails, useThumbnails } from '$lib/utils/thumbnailManager';
	import { readable } from 'svelte/store';
	import { appState, type StateSelector } from '$lib/core/state/appState';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import * as Switch from '$lib/components/ui/switch';
	import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
	import { historySettingsStore } from '$lib/stores/historySettings.svelte';
	import { setActivePanelTab } from '$lib/stores';
	import { openFileSystemItem } from '$lib/utils/navigationUtils';
	import { loadPanelViewMode, savePanelViewMode } from '$lib/utils/panelViewMode';
	import { folderRatingStore } from '$lib/stores/emm/folderRating';
	import { getDefaultRating } from '$lib/stores/emm/storage';

	let bookmarks: any[] = $state([]);
	let searchQuery = $state('');
	let viewMode = $state<'list' | 'grid'>(loadPanelViewMode('bookmark', 'list') as 'list' | 'grid');
	
	// V3 缩略图系统
	const thumbStore = useThumbnails();
	let thumbnails = $derived(thumbStore.thumbnails);
	let contextMenu = $state<{ x: number; y: number; item: FsItem | null; visible: boolean }>({
		x: 0,
		y: 0,
		item: null,
		visible: false
	});
	let contextMenuBookmark = $state<any>(null);
	let syncFileTreeOnBookmarkSelect = $state(historySettingsStore.syncFileTreeOnBookmarkSelect);
	let showSearchBar = $state(false);
	let sortField = $state<SortField>('timestamp');
	let sortOrder = $state<SortOrder>('desc');
	let selectedIndex = $state(-1);
	let scrollToSelectedToken = $state(0);

	// 排序后的书签
	let sortedBookmarks = $derived(() => {
		const filtered = filteredBookmarks;
		if (sortField === 'random') {
			const shuffled = [...filtered];
			for (let i = shuffled.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
			}
			return shuffled;
		}
		return [...filtered].sort((a, b) => {
			let cmp = 0;
			switch (sortField) {
				case 'name':
					cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
					break;
				case 'path':
					cmp = a.path.localeCompare(b.path, undefined, { numeric: true });
					break;
				case 'timestamp':
					cmp = (a.createdAt || 0) - (b.createdAt || 0);
					break;
				case 'type': {
					const extA = a.name.split('.').pop()?.toLowerCase() || '';
					const extB = b.name.split('.').pop()?.toLowerCase() || '';
					cmp = extA.localeCompare(extB);
					break;
				}
				case 'starred':
					if (a.starred !== b.starred) {
						cmp = a.starred ? -1 : 1;
					} else {
						cmp = a.name.localeCompare(b.name);
					}
					break;
				case 'rating': {
					// 规则：无 rating 使用默认评分，用户自定义 rating 优先
					const defaultRating = getDefaultRating();
					const ratingA = folderRatingStore.getEffectiveRating(a.path) ?? defaultRating;
					const ratingB = folderRatingStore.getEffectiveRating(b.path) ?? defaultRating;
					cmp = ratingA - ratingB;
					break;
				}
			}
			return sortOrder === 'asc' ? cmp : -cmp;
		});
	});

	function handleSortChange(field: SortField, order: SortOrder) {
		sortField = field;
		sortOrder = order;
	}

	function handleViewModeChange(mode: ViewMode) {
		viewMode = mode;
		savePanelViewMode('bookmark', mode);
	}

	$effect(() => {
		historySettingsStore.setSyncFileTreeOnBookmarkSelect(syncFileTreeOnBookmarkSelect);
	});

	function createAppStateStore<T>(selector: StateSelector<T>) {
		const initial = selector(appState.getSnapshot());
		return readable(initial, (set) => appState.subscribe(selector, (value) => set(value)));
	}

	const bookState = createAppStateStore((state) => state.book);
	const viewerState = createAppStateStore((state) => state.viewer);

	let filteredBookmarks = $derived(
		bookmarks.filter(
			(b) =>
				b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				b.path.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	// V3: 请求缩略图（由后端异步生成，通过响应式状态更新）
	function loadThumbnails(bookmarkList: any[]) {
		const paths = bookmarkList.map(b => b.path);
		if (paths.length > 0) {
			requestVisibleThumbnails(paths, 'bookmarks');
		}
	}

	// 移除书签
	function removeBookmark(id: string) {
		bookmarkStore.remove(id);
		// 状态会通过 store 订阅自动更新
	}

	// 打开书签
	async function openBookmark(bookmark: any) {
		const isDir = bookmark.type === 'folder';
		await openFileSystemItem(bookmark.path, isDir, {
			syncFileTree: syncFileTreeOnBookmarkSelect,
			folderSyncMode: 'select'
		});
	}

	// 将书签转换为 FsItem
	function bookmarkToFsItem(bookmark: any): FsItem {
		return {
			path: bookmark.path,
			name: bookmark.name,
			isDir: bookmark.type === 'folder',
			isImage: false,
			size: 0,
			modified: bookmark.createdAt ? new Date(bookmark.createdAt).getTime() : 0
		};
	}

	// 转换为 FsItem 数组（用于虚拟列表）
	let bookmarkItems = $derived(sortedBookmarks().map(bookmarkToFsItem));

	// 书签路径到书签对象的映射
	let bookmarkMap = $derived(new Map(sortedBookmarks().map(b => [b.path, b])));

	// 显示右键菜单
	function showContextMenu(e: MouseEvent, bookmark: any) {
		e.preventDefault();
		e.stopPropagation();
		contextMenuBookmark = bookmark;
		contextMenu = {
			x: e.clientX,
			y: e.clientY,
			item: bookmarkToFsItem(bookmark),
			visible: true
		};
	}

	// 隐藏右键菜单
	function hideContextMenu() {
		contextMenu = { ...contextMenu, visible: false, item: null };
		contextMenuBookmark = null;
	}

	// 在资源管理器中打开
	async function openInExplorer(bookmark: any) {
		try {
			await FileSystemAPI.showInFileManager(bookmark.path);
		} catch (err) {
			console.error('在资源管理器中打开失败:', err);
		}
		hideContextMenu();
	}

	// 在外部应用中打开
	async function openWithExternalApp(bookmark: any) {
		try {
			await FileSystemAPI.openWithSystem(bookmark.path);
		} catch (err) {
			console.error('在外部应用中打开失败:', err);
		}
		hideContextMenu();
	}

	// 复制路径
	function copyPath(bookmark: any) {
		navigator.clipboard.writeText(bookmark.path);
		hideContextMenu();
	}

	// 订阅书签变化（避免无限循环）
	$effect(() => {
		// 只在 store 更新时更新状态，不在 effect 中直接调用 loadBookmarks
		const unsubscribe = bookmarkStore.subscribe((newBookmarks) => {
			bookmarks = newBookmarks;
			// 异步加载缩略图，不阻塞
			if (newBookmarks.length > 0) {
				try {
					loadThumbnails(newBookmarks);
				} catch (err) {
					console.debug('调度书签缩略图失败:', err);
				}
			} else {
				thumbnails = new Map();
			}
		});
		return unsubscribe;
	});
</script>

<div class="flex h-full flex-col">
	<div
		class="border-border sticky top-0 z-20 flex flex-col"
	>
		<!-- 标题栏 -->
		<div class="p-4">
			<div class="mb-3 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<Bookmark class="h-5 w-5" />
					<h3 class="font-semibold">书签</h3>
					<span class="text-muted-foreground text-sm">({filteredBookmarks.length})</span>
				</div>
				<div class="flex items-center gap-3">
					<div class="text-muted-foreground flex items-center gap-2 text-xs">
						<span>同步文件树</span>
						<Switch.Root
							checked={syncFileTreeOnBookmarkSelect}
							onCheckedChange={(v) => (syncFileTreeOnBookmarkSelect = v)}
							class="scale-75"
							aria-label="选中书签时同步文件树"
						/>
					</div>
					<PanelToolbar
						{viewMode}
						{showSearchBar}
						{sortField}
						{sortOrder}
						showGroupOption={true}
						onViewModeChange={handleViewModeChange}
						onSearchToggle={() => (showSearchBar = !showSearchBar)}
						onSortChange={handleSortChange}
					/>
				</div>
			</div>
			{#if showSearchBar}
				<div class="border-border bg-background/95 border-b px-4 pb-4">
					<SearchBar
						placeholder="搜索书签..."
						onSearchChange={(query: string) => {
							searchQuery = query;
						}}
						storageKey="neoview-bookmark-search-history"
					/>
				</div>
			{/if}
		</div>
		<!-- 渐变过渡 -->
		<div class="h-4 bg-linear-to-b from-transparent to-background"></div>
	</div>

	<div class="min-h-0 flex-1 overflow-hidden bg-background">
		{#if sortedBookmarks().length === 0}
			<div class="text-muted-foreground flex flex-col items-center justify-center py-12 h-full">
				<div class="relative mb-4">
					<Bookmark class="h-16 w-16 opacity-30" />
					{#if !searchQuery}
						<div class="absolute -right-1 -top-1">
							<Star class="h-4 w-4 animate-pulse fill-primary text-primary" />
						</div>
					{/if}
				</div>
				<div class="space-y-2 text-center">
					<p class="text-lg font-medium">
						{searchQuery ? '未找到匹配的书签' : '暂无书签'}
					</p>
					<p class="text-sm opacity-70">
						{searchQuery ? `尝试其他关键词：${searchQuery}` : '标记重要页面，方便快速访问'}
					</p>
				</div>
			</div>
		{:else}
			<VirtualizedFileListV2
				items={bookmarkItems}
				currentPath="bookmarks"
				{thumbnails}
				{selectedIndex}
				{scrollToSelectedToken}
				viewMode={viewMode === 'grid' ? 'grid' : 'list'}
				onSelectedIndexChange={({ index }) => {
					selectedIndex = index;
				}}
				onItemSelect={({ item, index }) => {
					selectedIndex = index;
					const bookmark = bookmarkMap.get(item.path);
					if (bookmark) openBookmark(bookmark);
				}}
				onItemDoubleClick={({ item }) => {
					const bookmark = bookmarkMap.get(item.path);
					if (bookmark) openBookmark(bookmark);
				}}
				on:contextmenu={(e) => {
					const item = e.detail?.item;
					if (item) {
						const bookmark = bookmarkMap.get(item.path);
						if (bookmark) showContextMenu(e.detail.event, bookmark);
					}
				}}
			/>
		{/if}
	</div>

		<!-- 右键菜单 -->
	<FolderContextMenu
		item={contextMenu.item}
		x={contextMenu.x}
		y={contextMenu.y}
		visible={contextMenu.visible}
		onClose={hideContextMenu}
		onOpenAsBook={(item) => contextMenuBookmark && openBookmark(contextMenuBookmark)}
		onCopyPath={(item) => contextMenuBookmark && copyPath(contextMenuBookmark)}
		onOpenInExplorer={(item) => contextMenuBookmark && openInExplorer(contextMenuBookmark)}
		onOpenWithSystem={(item) => contextMenuBookmark && openWithExternalApp(contextMenuBookmark)}
		onDelete={(item) => contextMenuBookmark && removeBookmark(contextMenuBookmark.id)}
	/>
</div>
