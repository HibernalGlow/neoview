<script lang="ts">
/**
 * 书签卡片 - 完整功能版
 * 使用 VirtualizedFileListV2，支持列表和网格视图
 */
import { Bookmark, Star, Trash2 } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import SearchBar from '$lib/components/ui/SearchBar.svelte';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import VirtualizedFileListV2 from '$lib/components/panels/file/components/VirtualizedFileListV2.svelte';
import FolderContextMenu from '$lib/components/panels/folderPanel/components/FolderContextMenu.svelte';
import PanelToolbar, { type SortField, type SortOrder, type ViewMode } from '$lib/components/panels/shared/PanelToolbar.svelte';
import type { FsItem } from '$lib/types';
import { FileSystemAPI } from '$lib/api';
import { requestVisibleThumbnails, useThumbnails } from '$lib/utils/thumbnailManager';
import { historySettingsStore } from '$lib/stores/historySettings.svelte';
import { openFileSystemItem } from '$lib/utils/navigationUtils';
import { loadPanelViewMode, savePanelViewMode } from '$lib/utils/panelViewMode';
import { folderRatingStore } from '$lib/stores/emm/folderRating';
import { getDefaultRating } from '$lib/stores/emm/storage';
import { Checkbox } from '$lib/components/ui/checkbox';

let bookmarks: any[] = $state([]);
let searchQuery = $state('');
let viewMode = $state<'list' | 'grid'>(loadPanelViewMode('bookmark', 'list') as 'list' | 'grid');

const thumbStore = useThumbnails();
let thumbnails = $derived(thumbStore.thumbnails);
let contextMenu = $state<{ x: number; y: number; item: FsItem | null; visible: boolean }>({
	x: 0, y: 0, item: null, visible: false
});
let contextMenuBookmark = $state<any>(null);
let syncFileTreeOnBookmarkSelect = $state(historySettingsStore.syncFileTreeOnBookmarkSelect);
let showSearchBar = $state(false);
let sortField = $state<SortField>('timestamp');
let sortOrder = $state<SortOrder>('desc');
let selectedIndex = $state(-1);
let scrollToSelectedToken = $state(0);

let filteredBookmarks = $derived(
	bookmarks.filter((b) =>
		b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
		b.path.toLowerCase().includes(searchQuery.toLowerCase())
	)
);

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
			case 'name': cmp = a.name.localeCompare(b.name, undefined, { numeric: true }); break;
			case 'path': cmp = a.path.localeCompare(b.path, undefined, { numeric: true }); break;
			case 'timestamp': cmp = (a.createdAt || 0) - (b.createdAt || 0); break;
			case 'type': {
				const extA = a.name.split('.').pop()?.toLowerCase() || '';
				const extB = b.name.split('.').pop()?.toLowerCase() || '';
				cmp = extA.localeCompare(extB);
				break;
			}
			case 'starred':
				if (a.starred !== b.starred) cmp = a.starred ? -1 : 1;
				else cmp = a.name.localeCompare(b.name);
				break;
			case 'rating': {
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

function loadThumbnails(bookmarkList: any[]) {
	const paths = bookmarkList.map(b => b.path);
	if (paths.length > 0) requestVisibleThumbnails(paths, 'bookmarks');
}

function removeBookmark(id: string) { bookmarkStore.remove(id); }

async function openBookmark(bookmark: any) {
	const isDir = bookmark.type === 'folder';
	await openFileSystemItem(bookmark.path, isDir, { syncFileTree: syncFileTreeOnBookmarkSelect, folderSyncMode: 'select' });
}

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

let bookmarkItems = $derived(sortedBookmarks().map(bookmarkToFsItem));
let bookmarkMap = $derived(new Map(sortedBookmarks().map(b => [b.path, b])));

function showContextMenu(e: MouseEvent, bookmark: any) {
	e.preventDefault();
	e.stopPropagation();
	contextMenuBookmark = bookmark;
	contextMenu = { x: e.clientX, y: e.clientY, item: bookmarkToFsItem(bookmark), visible: true };
}

function hideContextMenu() {
	contextMenu = { ...contextMenu, visible: false, item: null };
	contextMenuBookmark = null;
}

async function openInExplorer(bookmark: any) {
	try { await FileSystemAPI.showInFileManager(bookmark.path); } catch (err) { console.error('在资源管理器中打开失败:', err); }
	hideContextMenu();
}

async function openWithExternalApp(bookmark: any) {
	try { await FileSystemAPI.openWithSystem(bookmark.path); } catch (err) { console.error('在外部应用中打开失败:', err); }
	hideContextMenu();
}

function copyPath(bookmark: any) {
	navigator.clipboard.writeText(bookmark.path);
	hideContextMenu();
}

$effect(() => {
	const unsubscribe = bookmarkStore.subscribe((newBookmarks) => {
		bookmarks = newBookmarks;
		if (newBookmarks.length > 0) {
			try { loadThumbnails(newBookmarks); } catch (err) { console.debug('调度书签缩略图失败:', err); }
		} else {
			thumbnails = new Map();
		}
	});
	return unsubscribe;
});
</script>

<div class="flex flex-col" style="height: 100%; min-height: 300px;">
	<!-- 工具栏 -->
	<div class="flex items-center justify-between py-1 gap-2 flex-wrap">
		<div class="flex items-center gap-2 text-xs text-muted-foreground">
			<span>({filteredBookmarks.length})</span>
			<Checkbox bind:checked={syncFileTreeOnBookmarkSelect} aria-label="同步文件树" />
			<span>同步</span>
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

	<!-- 搜索栏 -->
	{#if showSearchBar}
		<div class="py-1">
			<SearchBar
				placeholder="搜索书签..."
				onSearchChange={(query: string) => { searchQuery = query; }}
				storageKey="neoview-bookmark-search-history"
			/>
		</div>
	{/if}

	<!-- 列表区 -->
	<div class="min-h-0 flex-1 overflow-hidden">
		{#if sortedBookmarks().length === 0}
			<div class="text-muted-foreground flex flex-col items-center justify-center py-8 h-full text-xs">
				<Bookmark class="h-8 w-8 opacity-30 mb-2" />
				<p>{searchQuery ? '未找到匹配的书签' : '暂无书签'}</p>
			</div>
		{:else}
			<VirtualizedFileListV2
				items={bookmarkItems}
				currentPath="bookmarks"
				{thumbnails}
				{selectedIndex}
				{scrollToSelectedToken}
				viewMode={viewMode === 'grid' ? 'grid' : 'list'}
				onSelectedIndexChange={({ index }) => { selectedIndex = index; }}
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
