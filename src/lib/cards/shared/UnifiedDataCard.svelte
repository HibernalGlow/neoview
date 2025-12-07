<script lang="ts">
/**
 * UnifiedDataCard - 统一数据列表卡片
 * 支持 bookmark 和 history 两种模式，复用相同的UI结构
 * 作为 FolderMainCard 的简化子集
 */
import { Bookmark, Clock, Trash2 } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { Checkbox } from '$lib/components/ui/checkbox';
import SearchBar from '$lib/components/ui/SearchBar.svelte';
import VirtualizedFileListV2 from '$lib/components/panels/file/components/VirtualizedFileListV2.svelte';
import FolderContextMenu from '$lib/components/panels/folderPanel/components/FolderContextMenu.svelte';
import PanelToolbar, {
	type SortField,
	type SortOrder,
	type ViewMode
} from '$lib/components/panels/shared/PanelToolbar.svelte';
import type { FsItem } from '$lib/types';
import { FileSystemAPI } from '$lib/api';
import { requestVisibleThumbnails, useThumbnails } from '$lib/utils/thumbnailManager';
import { historySettingsStore } from '$lib/stores/historySettings.svelte';
import { openFileSystemItem } from '$lib/utils/navigationUtils';
import { loadPanelViewMode, savePanelViewMode } from '$lib/utils/panelViewMode';
import { folderRatingStore } from '$lib/stores/emm/folderRating';
import { getDefaultRating } from '$lib/stores/emm/storage';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import { historyStore, type HistoryEntry } from '$lib/stores/history.svelte';
import { isVideoFile } from '$lib/utils/videoUtils';

// ==================== 类型定义 ====================
type DataMode = 'bookmark' | 'history';

interface BookmarkEntry {
	id: string;
	path: string;
	name: string;
	type: 'folder' | 'file';
	starred?: boolean;
	createdAt?: number;
}

interface Props {
	/** 数据模式 */
	mode: DataMode;
}

let { mode }: Props = $props();

// ==================== 状态 ====================
let rawData = $state<(BookmarkEntry | HistoryEntry)[]>([]);
let searchQuery = $state('');
let viewMode = $state<'list' | 'grid'>(loadPanelViewMode(mode, 'list') as 'list' | 'grid');
let showSearchBar = $state(false);
let sortField = $state<SortField>('timestamp');
let sortOrder = $state<SortOrder>('desc');
let selectedIndex = $state(-1);
let scrollToSelectedToken = $state(0);

// 同步设置
let syncFileTree = $state(
	mode === 'bookmark'
		? historySettingsStore.syncFileTreeOnBookmarkSelect
		: historySettingsStore.syncFileTreeOnHistorySelect
);

// 缩略图
const thumbStore = useThumbnails();
let thumbnails = $derived(thumbStore.thumbnails);

// 右键菜单
let contextMenu = $state<{ x: number; y: number; item: FsItem | null; visible: boolean }>({
	x: 0,
	y: 0,
	item: null,
	visible: false
});
let contextMenuEntry = $state<BookmarkEntry | HistoryEntry | null>(null);

// ==================== 派生数据 ====================
// 配置常量
const config = $derived({
	emptyIcon: mode === 'bookmark' ? Bookmark : Clock,
	emptyText: mode === 'bookmark' ? '暂无书签' : '暂无历史记录',
	searchEmptyText: mode === 'bookmark' ? '未找到匹配的书签' : '未找到匹配的历史记录',
	searchPlaceholder: mode === 'bookmark' ? '搜索书签...' : '搜索历史记录...',
	storageKey: mode === 'bookmark' ? 'neoview-bookmark-search-history' : 'neoview-history-search-history',
	showClearButton: mode === 'history',
	showCurrentFolderOption: mode === 'history'
});

// 过滤数据
let filteredData = $derived(
	rawData.filter((item) =>
		item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
		item.path.toLowerCase().includes(searchQuery.toLowerCase())
	)
);

// 排序数据
let sortedData = $derived(() => {
	const filtered = filteredData;
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
			case 'timestamp': {
				const timeA = mode === 'bookmark' ? (a as BookmarkEntry).createdAt || 0 : (a as HistoryEntry).timestamp;
				const timeB = mode === 'bookmark' ? (b as BookmarkEntry).createdAt || 0 : (b as HistoryEntry).timestamp;
				cmp = timeA - timeB;
				break;
			}
			case 'type': {
				const extA = a.name.split('.').pop()?.toLowerCase() || '';
				const extB = b.name.split('.').pop()?.toLowerCase() || '';
				cmp = extA.localeCompare(extB);
				break;
			}
			case 'starred':
				if (mode === 'bookmark') {
					const aStarred = (a as BookmarkEntry).starred || false;
					const bStarred = (b as BookmarkEntry).starred || false;
					if (aStarred !== bStarred) cmp = aStarred ? -1 : 1;
					else cmp = a.name.localeCompare(b.name);
				}
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

// 转换为 FsItem
function entryToFsItem(entry: BookmarkEntry | HistoryEntry): FsItem {
	if (mode === 'bookmark') {
		const b = entry as BookmarkEntry;
		return {
			path: b.path,
			name: b.name,
			isDir: b.type === 'folder',
			isImage: false,
			size: 0,
			modified: b.createdAt ? new Date(b.createdAt).getTime() : 0
		};
	} else {
		const h = entry as HistoryEntry;
		const isArchive = isArchivePath(h.path);
		return {
			path: h.path,
			name: h.name,
			isDir: !isArchive,
			isImage: false,
			size: 0,
			modified: h.timestamp
		};
	}
}

function isArchivePath(path: string): boolean {
	const ext = path.toLowerCase();
	return ext.endsWith('.zip') || ext.endsWith('.cbz') || ext.endsWith('.rar') || 
		   ext.endsWith('.cbr') || ext.endsWith('.7z') || ext.endsWith('.cb7');
}

let items = $derived(sortedData().map(entryToFsItem));
let entryMap = $derived(new Map(sortedData().map((e) => [e.path, e])));

// ==================== 事件处理 ====================
function handleSortChange(field: SortField, order: SortOrder) {
	sortField = field;
	sortOrder = order;
}

function handleViewModeChange(newMode: ViewMode) {
	viewMode = newMode;
	savePanelViewMode(mode, newMode);
}

function loadThumbnails(entries: (BookmarkEntry | HistoryEntry)[]) {
	const paths = entries.map((e) => e.path);
	if (paths.length > 0) requestVisibleThumbnails(paths, mode);
}

async function openEntry(entry: BookmarkEntry | HistoryEntry) {
	if (mode === 'bookmark') {
		const b = entry as BookmarkEntry;
		const isDir = b.type === 'folder';
		await openFileSystemItem(b.path, isDir, { syncFileTree, folderSyncMode: 'select' });
	} else {
		const h = entry as HistoryEntry;
		const isVideo = isVideoFile(h.path);
		if (isVideo) {
			await openFileSystemItem(h.path, false, { syncFileTree });
		} else {
			await openFileSystemItem(h.path, false, {
				syncFileTree,
				page: h.currentPage,
				totalPages: h.totalPages,
				forceBookOpen: true
			});
		}
	}
}

function removeEntry(id: string) {
	if (mode === 'bookmark') {
		bookmarkStore.remove(id);
	} else {
		historyStore.remove(id);
	}
}

function clearHistory() {
	if (mode === 'history' && confirm('确定要清除所有历史记录吗？')) {
		historyStore.clear();
	}
}

// 右键菜单处理
function showContextMenu(e: MouseEvent, entry: BookmarkEntry | HistoryEntry) {
	e.preventDefault();
	e.stopPropagation();
	contextMenuEntry = entry;
	contextMenu = { x: e.clientX, y: e.clientY, item: entryToFsItem(entry), visible: true };
}

function hideContextMenu() {
	contextMenu = { ...contextMenu, visible: false, item: null };
	contextMenuEntry = null;
}

async function openInExplorer(entry: BookmarkEntry | HistoryEntry) {
	try {
		await FileSystemAPI.showInFileManager(entry.path);
	} catch (err) {
		console.error('在资源管理器中打开失败:', err);
	}
	hideContextMenu();
}

async function openWithExternalApp(entry: BookmarkEntry | HistoryEntry) {
	try {
		await FileSystemAPI.openWithSystem(entry.path);
	} catch (err) {
		console.error('在外部应用中打开失败:', err);
	}
	hideContextMenu();
}

function copyPath(entry: BookmarkEntry | HistoryEntry) {
	navigator.clipboard.writeText(entry.path);
	hideContextMenu();
}

function addToBookmark(entry: HistoryEntry) {
	if (mode === 'history') {
		bookmarkStore.add(entryToFsItem(entry));
		hideContextMenu();
	}
}

// ==================== 副作用 ====================
$effect(() => {
	if (mode === 'bookmark') {
		historySettingsStore.setSyncFileTreeOnBookmarkSelect(syncFileTree);
	} else {
		historySettingsStore.setSyncFileTreeOnHistorySelect(syncFileTree);
	}
});

$effect(() => {
	const store = mode === 'bookmark' ? bookmarkStore : historyStore;
	const unsubscribe = store.subscribe((newData: any[]) => {
		rawData = newData;
		if (newData.length > 0) {
			try {
				loadThumbnails(newData);
			} catch (err) {
				console.debug(`调度${mode === 'bookmark' ? '书签' : '历史'}缩略图失败:`, err);
			}
		}
	});
	return unsubscribe;
});
</script>

<div class="flex flex-col" style="height: 100%; min-height: 300px;">
	<!-- 工具栏 -->
	<div class="flex items-center justify-between py-1 gap-2 flex-wrap">
		<div class="flex items-center gap-2 text-xs text-muted-foreground">
			<span>({filteredData.length})</span>
			<Checkbox bind:checked={syncFileTree} aria-label="同步文件树" />
			<span>同步</span>
		</div>
		<div class="flex items-center gap-1">
			<PanelToolbar
				{viewMode}
				{showSearchBar}
				{sortField}
				{sortOrder}
				showGroupOption={true}
				showCurrentFolderOption={config.showCurrentFolderOption}
				onViewModeChange={handleViewModeChange}
				onSearchToggle={() => (showSearchBar = !showSearchBar)}
				onSortChange={handleSortChange}
			/>
			{#if config.showClearButton}
				<Button variant="ghost" size="sm" class="h-6 text-xs px-2" onclick={clearHistory}>
					<Trash2 class="h-3 w-3 mr-1" />清除
				</Button>
			{/if}
		</div>
	</div>

	<!-- 搜索栏 -->
	{#if showSearchBar}
		<div class="py-1">
			<SearchBar
				placeholder={config.searchPlaceholder}
				onSearchChange={(query: string) => {
					searchQuery = query;
				}}
				storageKey={config.storageKey}
			/>
		</div>
	{/if}

	<!-- 列表区 -->
	<div class="min-h-0 flex-1 overflow-hidden">
		{#if sortedData().length === 0}
			<div
				class="text-muted-foreground flex flex-col items-center justify-center py-8 h-full text-xs"
			>
				{@const Icon = config.emptyIcon}
				<Icon class="h-8 w-8 opacity-30 mb-2" />
				<p>{searchQuery ? config.searchEmptyText : config.emptyText}</p>
				{#if searchQuery}
					<p class="opacity-70">搜索词: "{searchQuery}"</p>
				{/if}
			</div>
		{:else}
			<VirtualizedFileListV2
				{items}
				currentPath={mode}
				{thumbnails}
				{selectedIndex}
				{scrollToSelectedToken}
				viewMode={viewMode === 'grid' ? 'thumbnail' : 'list'}
				onSelectedIndexChange={({ index }) => {
					selectedIndex = index;
				}}
				onItemSelect={({ item, index }) => {
					selectedIndex = index;
					const entry = entryMap.get(item.path);
					if (entry) openEntry(entry);
				}}
				onItemDoubleClick={({ item }) => {
					const entry = entryMap.get(item.path);
					if (entry) openEntry(entry);
				}}
				on:contextmenu={(e) => {
					const item = e.detail?.item;
					if (item) {
						const entry = entryMap.get(item.path);
						if (entry) showContextMenu(e.detail.event, entry);
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
		onOpenAsBook={(item) => contextMenuEntry && openEntry(contextMenuEntry)}
		onAddBookmark={mode === 'history' ? (item) => contextMenuEntry && addToBookmark(contextMenuEntry as HistoryEntry) : undefined}
		onCopyPath={(item) => contextMenuEntry && copyPath(contextMenuEntry)}
		onOpenInExplorer={(item) => contextMenuEntry && openInExplorer(contextMenuEntry)}
		onOpenWithSystem={(item) => contextMenuEntry && openWithExternalApp(contextMenuEntry)}
		onDelete={(item) => contextMenuEntry && removeEntry(contextMenuEntry.id)}
	/>
</div>
