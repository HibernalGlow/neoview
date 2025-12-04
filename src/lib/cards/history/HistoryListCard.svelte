<script lang="ts">
/**
 * 历史记录卡片 - 完整功能版
 * 使用 VirtualizedFileListV2，支持列表和网格视图
 */
import { Grid3x3, List, Clock, Trash2 } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { Checkbox } from '$lib/components/ui/checkbox';
import { historyStore, type HistoryEntry } from '$lib/stores/history.svelte';
import { historySettingsStore } from '$lib/stores/historySettings.svelte';
import SearchBar from '$lib/components/ui/SearchBar.svelte';
import VirtualizedFileListV2 from '$lib/components/panels/file/components/VirtualizedFileListV2.svelte';
import FolderContextMenu from '$lib/components/panels/folderPanel/components/FolderContextMenu.svelte';
import PanelToolbar, { type SortField, type SortOrder, type ViewMode } from '$lib/components/panels/shared/PanelToolbar.svelte';
import { requestVisibleThumbnails, useThumbnails } from '$lib/utils/thumbnailManager';
import type { FsItem } from '$lib/types';
import { FileSystemAPI } from '$lib/api';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import { openFileSystemItem } from '$lib/utils/navigationUtils';
import { folderRatingStore } from '$lib/stores/emm/folderRating';
import { getDefaultRating } from '$lib/stores/emm/storage';
import { loadPanelViewMode, savePanelViewMode } from '$lib/utils/panelViewMode';
import { isVideoFile } from '$lib/utils/videoUtils';

let history = $state<HistoryEntry[]>([]);
let viewMode = $state<'list' | 'grid'>(loadPanelViewMode('history', 'list') as 'list' | 'grid');

const thumbStore = useThumbnails();
let thumbnails = $derived(thumbStore.thumbnails);
let contextMenu = $state<{ x: number; y: number; item: FsItem | null; visible: boolean }>({
	x: 0, y: 0, item: null, visible: false
});
let contextMenuEntry = $state<HistoryEntry | null>(null);
let searchQuery = $state('');
let filteredHistory = $derived(
	searchQuery.trim()
		? history.filter((entry) =>
				entry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				entry.path.toLowerCase().includes(searchQuery.toLowerCase())
			)
		: history
);
let syncFileTreeOnHistorySelect = $state(historySettingsStore.syncFileTreeOnHistorySelect);
let showSearchBar = $state(false);
let sortField = $state<SortField>('timestamp');
let sortOrder = $state<SortOrder>('desc');
let selectedIndex = $state(-1);
let scrollToSelectedToken = $state(0);

let sortedHistory = $derived(() => {
	const filtered = filteredHistory;
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
			case 'timestamp': cmp = a.timestamp - b.timestamp; break;
			case 'type': {
				const extA = a.name.split('.').pop()?.toLowerCase() || '';
				const extB = b.name.split('.').pop()?.toLowerCase() || '';
				cmp = extA.localeCompare(extB);
				break;
			}
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
	savePanelViewMode('history', mode);
}

$effect(() => {
	historySettingsStore.setSyncFileTreeOnHistorySelect(syncFileTreeOnHistorySelect);
});

function loadThumbnails(entries: HistoryEntry[]) {
	const paths = entries.map(e => e.path);
	if (paths.length > 0) requestVisibleThumbnails(paths, 'history');
}

async function openHistory(entry: HistoryEntry) {
	const isVideo = isVideoFile(entry.path);
	if (isVideo) {
		await openFileSystemItem(entry.path, false, { syncFileTree: historySettingsStore.syncFileTreeOnHistorySelect });
	} else {
		await openFileSystemItem(entry.path, false, {
			syncFileTree: historySettingsStore.syncFileTreeOnHistorySelect,
			page: entry.currentPage,
			totalPages: entry.totalPages,
			forceBookOpen: true
		});
	}
}

function removeHistory(id: string) { historyStore.remove(id); }
function clearHistory() { if (confirm('确定要清除所有历史记录吗？')) historyStore.clear(); }

function isArchivePath(path: string): boolean {
	const ext = path.toLowerCase();
	return ext.endsWith('.zip') || ext.endsWith('.cbz') || ext.endsWith('.rar') || ext.endsWith('.cbr') || ext.endsWith('.7z') || ext.endsWith('.cb7');
}

function historyToFsItem(entry: HistoryEntry): FsItem {
	const isArchive = isArchivePath(entry.path);
	return { path: entry.path, name: entry.name, isDir: !isArchive, isImage: false, size: 0, modified: entry.timestamp };
}

let historyItems = $derived(sortedHistory().map(historyToFsItem));
let historyMap = $derived(new Map(sortedHistory().map(e => [e.path, e])));

function showContextMenu(e: MouseEvent, entry: HistoryEntry) {
	e.preventDefault();
	e.stopPropagation();
	contextMenuEntry = entry;
	contextMenu = { x: e.clientX, y: e.clientY, item: historyToFsItem(entry), visible: true };
}

function hideContextMenu() {
	contextMenu = { ...contextMenu, visible: false, item: null };
	contextMenuEntry = null;
}

function addToBookmark(entry: HistoryEntry) {
	bookmarkStore.add(historyToFsItem(entry));
	hideContextMenu();
}

async function openInExplorer(entry: HistoryEntry) {
	try { await FileSystemAPI.showInFileManager(entry.path); } catch (err) { console.error('在资源管理器中打开失败:', err); }
	hideContextMenu();
}

async function openWithExternalApp(entry: HistoryEntry) {
	try { await FileSystemAPI.openWithSystem(entry.path); } catch (err) { console.error('在外部应用中打开失败:', err); }
	hideContextMenu();
}

function copyPath(entry: HistoryEntry) {
	navigator.clipboard.writeText(entry.path);
	hideContextMenu();
}

$effect(() => {
	const unsubscribe = historyStore.subscribe((newHistory) => {
		history = newHistory;
		if (newHistory.length > 0) {
			try { loadThumbnails(newHistory); } catch (err) { console.debug('调度历史缩略图失败:', err); }
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
			<span>({history.length})</span>
			<Checkbox bind:checked={syncFileTreeOnHistorySelect} aria-label="同步文件树" />
			<span>同步</span>
		</div>
		<div class="flex items-center gap-1">
			<PanelToolbar
				{viewMode}
				{showSearchBar}
				{sortField}
				{sortOrder}
				showGroupOption={true}
				showCurrentFolderOption={true}
				onViewModeChange={handleViewModeChange}
				onSearchToggle={() => (showSearchBar = !showSearchBar)}
				onSortChange={handleSortChange}
			/>
			<Button variant="ghost" size="sm" class="h-6 text-xs px-2" onclick={clearHistory}>
				<Trash2 class="h-3 w-3 mr-1" />清除
			</Button>
		</div>
	</div>

	<!-- 搜索栏 -->
	{#if showSearchBar}
		<div class="py-1">
			<SearchBar
				placeholder="搜索历史记录..."
				onSearchChange={(query) => { searchQuery = query; }}
				storageKey="neoview-history-search-history"
			/>
		</div>
	{/if}

	<!-- 列表区 -->
	<div class="min-h-0 flex-1 overflow-hidden">
		{#if sortedHistory().length === 0 && searchQuery.trim()}
			<div class="text-muted-foreground flex flex-col items-center justify-center py-8 h-full text-xs">
				<p>未找到匹配的历史记录</p>
				<p class="opacity-70">搜索词: "{searchQuery}"</p>
			</div>
		{:else if sortedHistory().length === 0}
			<div class="text-muted-foreground flex flex-col items-center justify-center py-8 h-full text-xs">
				<Clock class="h-8 w-8 opacity-30 mb-2" />
				<p>暂无历史记录</p>
			</div>
		{:else}
			<VirtualizedFileListV2
				items={historyItems}
				currentPath="history"
				{thumbnails}
				{selectedIndex}
				{scrollToSelectedToken}
				viewMode={viewMode === 'grid' ? 'grid' : 'list'}
				onSelectedIndexChange={({ index }) => { selectedIndex = index; }}
				onItemSelect={({ item, index }) => {
					selectedIndex = index;
					const entry = historyMap.get(item.path);
					if (entry) openHistory(entry);
				}}
				onItemDoubleClick={({ item }) => {
					const entry = historyMap.get(item.path);
					if (entry) openHistory(entry);
				}}
				on:contextmenu={(e) => {
					const item = e.detail?.item;
					if (item) {
						const entry = historyMap.get(item.path);
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
		onOpenAsBook={(item) => contextMenuEntry && openHistory(contextMenuEntry)}
		onAddBookmark={(item) => contextMenuEntry && addToBookmark(contextMenuEntry)}
		onCopyPath={(item) => contextMenuEntry && copyPath(contextMenuEntry)}
		onOpenInExplorer={(item) => contextMenuEntry && openInExplorer(contextMenuEntry)}
		onOpenWithSystem={(item) => contextMenuEntry && openWithExternalApp(contextMenuEntry)}
		onDelete={(item) => contextMenuEntry && removeHistory(contextMenuEntry.id)}
	/>
</div>
