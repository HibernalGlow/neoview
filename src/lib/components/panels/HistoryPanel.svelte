<script lang="ts">
	/**
	 * NeoView - History Panel Component
	 * 历史记录面板 - 参考 NeeView HistoryPanel.cs
	 * 使用 FileItemCard 组件，支持列表和网格视图
	 */
	import {
		Clock,
		X,
		Grid3x3,
		List,
		Activity,
		Bookmark,
		Trash2,
		ExternalLink,
		Copy,
		FolderOpen,
		Search
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { historyStore, type HistoryEntry } from '$lib/stores/history.svelte';
	import { historySettingsStore } from '$lib/stores/historySettings.svelte';
	import SearchBar from '$lib/components/ui/SearchBar.svelte';
	import FileItemCard from './file/components/FileItemCard.svelte';
	import FolderContextMenu from './folderPanel/components/FolderContextMenu.svelte';
	import PanelToolbar, { type SortField, type SortOrder, type ViewMode } from './shared/PanelToolbar.svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
	import { thumbnailManager } from '$lib/utils/thumbnailManager';
	import type { FsItem } from '$lib/types';
	import { readable } from 'svelte/store';
	import { appState, type StateSelector } from '$lib/core/state/appState';
	import { taskScheduler } from '$lib/core/tasks/taskScheduler';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import { FileSystemAPI } from '$lib/api';
	import { bookmarkStore } from '$lib/stores/bookmark.svelte';
	import { setActivePanelTab } from '$lib/stores';
	import { openFileSystemItem } from '$lib/utils/navigationUtils';
	import { loadPanelViewMode, savePanelViewMode } from '$lib/utils/panelViewMode';
	import { isVideoFile } from '$lib/utils/videoUtils';

	let history = $state<HistoryEntry[]>([]);
	let viewMode = $state<'list' | 'grid'>(loadPanelViewMode('history', 'list') as 'list' | 'grid');
	let thumbnails = $state<Map<string, string>>(new Map());
	const thumbnailJobs = new Map<string, string>();
	let contextMenu = $state<{ x: number; y: number; item: FsItem | null; visible: boolean }>({
		x: 0,
		y: 0,
		item: null,
		visible: false
	});
	let contextMenuEntry = $state<HistoryEntry | null>(null);
	let searchQuery = $state('');
	let filteredHistory = $derived(
		searchQuery.trim()
			? history.filter(
					(entry) =>
						entry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
						entry.path.toLowerCase().includes(searchQuery.toLowerCase())
				)
			: history
	);
	let syncFileTreeOnHistorySelect = $state(historySettingsStore.syncFileTreeOnHistorySelect);
	let showSearchBar = $state(false);
	let sortField = $state<SortField>('timestamp');
	let sortOrder = $state<SortOrder>('desc');

	// 排序后的历史记录
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
				case 'name':
					cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
					break;
				case 'path':
					cmp = a.path.localeCompare(b.path, undefined, { numeric: true });
					break;
				case 'timestamp':
					cmp = a.timestamp - b.timestamp;
					break;
				case 'type': {
					const extA = a.name.split('.').pop()?.toLowerCase() || '';
					const extB = b.name.split('.').pop()?.toLowerCase() || '';
					cmp = extA.localeCompare(extB);
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

	function createAppStateStore<T>(selector: StateSelector<T>) {
		const initial = selector(appState.getSnapshot());
		return readable(initial, (set) => appState.subscribe(selector, (value) => set(value)));
	}

	const bookState = createAppStateStore((state) => state.book);
	const viewerState = createAppStateStore((state) => state.viewer);

	// 加载缩略图（异步，不阻塞）
	function loadThumbnails(entries: HistoryEntry[]) {
		for (const entry of entries) {
			if (thumbnailJobs.has(entry.path)) {
				continue;
			}
			const snapshot = taskScheduler.enqueue({
				type: 'history-thumbnail-load',
				priority: 'low',
				bucket: 'background',
				source: 'history-panel',
				executor: async () => {
					try {
						const thumbnail = await thumbnailManager.getThumbnail(
							entry.path,
							undefined,
							false,
							'normal'
						);
						if (thumbnail) {
							thumbnails = new Map(thumbnails).set(entry.path, thumbnail);
						}
					} catch (err) {
						console.debug('加载缩略图失败:', entry.path, err);
					} finally {
						thumbnailJobs.delete(entry.path);
					}
				}
			});
			thumbnailJobs.set(entry.path, snapshot.id);
		}
	}

	// 打开历史记录
	async function openHistory(entry: HistoryEntry) {
		const isVideo = isVideoFile(entry.path);
		if (isVideo) {
			// 视频历史：按文件浏览器逻辑打开所在文件夹 book，并定位到该视频
			await openFileSystemItem(entry.path, false, {
				syncFileTree: historySettingsStore.syncFileTreeOnHistorySelect
			});
		} else {
			// 书籍历史（文件夹/压缩包）：保持原有行为，直接按 book 打开并跳转到对应页
			await openFileSystemItem(entry.path, false, {
				syncFileTree: historySettingsStore.syncFileTreeOnHistorySelect,
				page: entry.currentPage,
				totalPages: entry.totalPages,
				forceBookOpen: true
			});
		}
	}

	// 移除历史记录
	function removeHistory(id: string) {
		historyStore.remove(id);
		// 状态会通过 store 订阅自动更新
	}

	// 清空历史记录
	function clearHistory() {
		if (confirm('确定要清除所有历史记录吗？')) {
			historyStore.clear();
			// 状态会通过 store 订阅自动更新
		}
	}

	// 判断是否为压缩包
	function isArchivePath(path: string): boolean {
		const ext = path.toLowerCase();
		return ext.endsWith('.zip') || ext.endsWith('.cbz') || ext.endsWith('.rar') || ext.endsWith('.cbr') || ext.endsWith('.7z') || ext.endsWith('.cb7');
	}

	// 将历史记录转换为 FsItem
	function historyToFsItem(entry: HistoryEntry): FsItem {
		// 历史记录可能是文件夹或压缩包，通过路径判断
		const isArchive = isArchivePath(entry.path);
		const isDir = !isArchive; // 非压缩包的历史记录通常是文件夹
		return {
			path: entry.path,
			name: entry.name,
			isDir: isDir,
			isImage: false,
			size: 0,
			modified: entry.timestamp
		};
	}

	// 显示右键菜单
	function showContextMenu(e: MouseEvent, entry: HistoryEntry) {
		e.preventDefault();
		e.stopPropagation();
		contextMenuEntry = entry;
		contextMenu = {
			x: e.clientX,
			y: e.clientY,
			item: historyToFsItem(entry),
			visible: true
		};
	}

	// 隐藏右键菜单
	function hideContextMenu() {
		contextMenu = { ...contextMenu, visible: false, item: null };
		contextMenuEntry = null;
	}

	// 添加到书签
	function addToBookmark(entry: HistoryEntry) {
		const fsItem = historyToFsItem(entry);
		bookmarkStore.add(fsItem);
		hideContextMenu();
	}

	// 在资源管理器中打开
	async function openInExplorer(entry: HistoryEntry) {
		try {
			await FileSystemAPI.showInFileManager(entry.path);
		} catch (err) {
			console.error('在资源管理器中打开失败:', err);
		}
		hideContextMenu();
	}

	// 在外部应用中打开
	async function openWithExternalApp(entry: HistoryEntry) {
		try {
			await FileSystemAPI.openWithSystem(entry.path);
		} catch (err) {
			console.error('在外部应用中打开失败:', err);
		}
		hideContextMenu();
	}

	// 复制路径
	function copyPath(entry: HistoryEntry) {
		navigator.clipboard.writeText(entry.path);
		hideContextMenu();
	}

	// 订阅历史记录变化（避免无限循环）
	$effect(() => {
		// 只在 store 更新时更新状态，不在 effect 中直接调用 loadHistory
		const unsubscribe = historyStore.subscribe((newHistory) => {
			history = newHistory;
			// 异步加载缩略图，不阻塞
			if (newHistory.length > 0) {
				try {
					loadThumbnails(newHistory);
				} catch (err) {
					console.debug('调度历史缩略图失败:', err);
				}
			} else {
				thumbnails = new Map();
			}
		});
		return unsubscribe;
	});
</script>

<div class="bg-background flex h-full flex-col">
	<div
		class="border-border bg-background/95 supports-backdrop-filter:bg-background/70 sticky top-0 z-20 flex flex-col border-b backdrop-blur"
	>
		<!-- 标题栏 -->
		<div class="flex items-center justify-between border-b p-4">
			<div class="flex items-center gap-2">
				<Clock class="h-5 w-5" />
				<h3 class="font-semibold">历史记录</h3>
				<span class="text-muted-foreground text-sm">({history.length})</span>
			</div>
			<div class="flex items-center gap-3">
				<div class="text-muted-foreground flex items-center gap-1 text-xs">
					<Checkbox
						bind:checked={syncFileTreeOnHistorySelect}
						aria-label="选中历史记录时同步文件树"
					/>
					<span>同步文件树</span>
				</div>
				<PanelToolbar
					{viewMode}
					{showSearchBar}
					{sortField}
					{sortOrder}
					onViewModeChange={handleViewModeChange}
					onSearchToggle={() => (showSearchBar = !showSearchBar)}
					onSortChange={handleSortChange}
				/>
				<Button variant="ghost" size="sm" onclick={clearHistory}>清除全部</Button>
			</div>
		</div>

		<!-- 搜索栏 -->
		{#if showSearchBar}
			<div class="border-border bg-background/95 border-b px-4 py-3">
				<SearchBar
					placeholder="搜索历史记录..."
					onSearchChange={(query) => {
						searchQuery = query;
					}}
					storageKey="neoview-history-search-history"
				/>
			</div>
		{/if}
	</div>

	<div class="min-h-0 flex-1 overflow-hidden">
		<!-- 历史列表 -->
		<div class="flex-1 overflow-auto">
			{#if sortedHistory().length === 0 && searchQuery.trim()}
				<div class="text-muted-foreground flex flex-col items-center justify-center py-12">
					<div class="space-y-2 text-center">
						<p class="text-lg font-medium">未找到匹配的历史记录</p>
						<p class="text-sm opacity-70">搜索词: "{searchQuery}"</p>
					</div>
				</div>
			{:else if sortedHistory().length === 0}
				<div class="text-muted-foreground flex flex-col items-center justify-center py-12">
					<div class="relative mb-4">
						<Clock class="h-16 w-16 opacity-30" />
						<div class="absolute inset-0 flex items-center justify-center">
							<div class="bg-muted-foreground h-2 w-2 animate-pulse rounded-full"></div>
						</div>
					</div>
					<div class="space-y-2 text-center">
						<p class="text-lg font-medium">暂无历史记录</p>
						<p class="text-sm opacity-70">浏览过的文件将在这里显示</p>
					</div>
				</div>
			{:else if viewMode === 'list'}
				<!-- 列表视图 -->
				<div class="space-y-2 p-2">
					{#each sortedHistory() as entry (entry.id)}
						<div class="group relative">
							<FileItemCard
								item={historyToFsItem(entry)}
								thumbnail={thumbnails.get(entry.path)}
								viewMode="list"
								showReadMark={true}
								showBookmarkMark={true}
								currentPage={entry.currentPage}
								totalPages={entry.totalPages}
								timestamp={entry.timestamp}
								onClick={() => openHistory(entry)}
								onDoubleClick={() => openHistory(entry)}
								onContextMenu={(e) => showContextMenu(e, entry)}
							/>
							<Button
								variant="ghost"
								size="icon"
								class="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
								onclick={(e) => {
									e.stopPropagation();
									removeHistory(entry.id);
								}}
							>
								<X class="h-4 w-4" />
							</Button>
						</div>
					{/each}
				</div>
			{:else}
				<!-- 网格视图 -->
				<div class="p-2">
					<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
						{#each sortedHistory() as entry (entry.id)}
							<div class="group relative">
								<FileItemCard
									item={historyToFsItem(entry)}
									thumbnail={thumbnails.get(entry.path)}
									viewMode="grid"
									showReadMark={true}
									showBookmarkMark={true}
									currentPage={entry.currentPage}
									totalPages={entry.totalPages}
									timestamp={entry.timestamp}
									onClick={() => openHistory(entry)}
									onDoubleClick={() => openHistory(entry)}
									onContextMenu={(e) => showContextMenu(e, entry)}
								/>
								<Button
									variant="ghost"
									size="icon"
									class="bg-background/80 absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
									onclick={(e) => {
										e.stopPropagation();
										removeHistory(entry.id);
									}}
								>
									<X class="h-4 w-4" />
								</Button>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- 右键菜单 -->
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
