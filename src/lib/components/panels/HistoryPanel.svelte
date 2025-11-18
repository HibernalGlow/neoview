<script lang="ts">
	/**
	 * NeoView - History Panel Component
	 * 历史记录面板 - 参考 NeeView HistoryPanel.cs
	 * 使用 FileItemCard 组件，支持列表和网格视图
	 */
	import { Clock, X, Grid3x3, List, Activity, Bookmark, Trash2, ExternalLink, FolderOpen } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { historyStore, type HistoryEntry } from '$lib/stores/history.svelte';
	import SearchBar from '$lib/components/ui/SearchBar.svelte';
	import FileItemCard from './file/components/FileItemCard.svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import { thumbnailManager } from '$lib/utils/thumbnailManager';
	import type { FsItem } from '$lib/types';
	import { readable } from 'svelte/store';
	import { appState, type StateSelector } from '$lib/core/state/appState';
	import { taskScheduler } from '$lib/core/tasks/taskScheduler';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import { FileSystemAPI } from '$lib/api';
	import { bookmarkStore } from '$lib/stores/bookmark.svelte';

	let history = $state<HistoryEntry[]>([]);
	let viewMode = $state<'list' | 'grid'>('list');
	let thumbnails = $state<Map<string, string>>(new Map());
	const thumbnailJobs = new Map<string, string>();
	let contextMenu = $state<{ x: number; y: number; entry: HistoryEntry | null }>({ x: 0, y: 0, entry: null });
	let searchQuery = $state('');
	let filteredHistory = $derived(
		searchQuery.trim()
			? history.filter(entry =>
					entry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					entry.path.toLowerCase().includes(searchQuery.toLowerCase())
			  )
			: history
	);

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
						const thumbnail = await thumbnailManager.getThumbnail(entry.path, undefined, false, 'normal');
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
		try {
			// 使用 bookStore 打开
			await bookStore.openBook(entry.path);
			// 如果记录了页码，导航到该页
			if (entry.currentPage > 0 && entry.currentPage < entry.totalPages) {
				// TODO: 导航到指定页码
				console.log('导航到页码:', entry.currentPage);
			}
		} catch (err) {
			console.error('打开历史记录失败:', err);
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

	// 切换视图模式
	function toggleViewMode() {
		viewMode = viewMode === 'list' ? 'grid' : 'list';
	}

	// 将历史记录转换为 FsItem
	function historyToFsItem(entry: HistoryEntry): FsItem {
		return {
			path: entry.path,
			name: entry.name,
			isDir: false,
			isImage: false,
			size: 0,
			modified: entry.timestamp
		};
	}

	// 显示右键菜单
	function showContextMenu(e: MouseEvent, entry: HistoryEntry) {
		e.preventDefault();
		e.stopPropagation();
		
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		
		let menuX = e.clientX;
		let menuY = e.clientY;
		
		const menuWidth = 180;
		if (e.clientX + menuWidth > viewportWidth) {
			menuX = viewportWidth - menuWidth - 10;
		}
		if (menuX < 10) {
			menuX = 10;
		}
		
		const maxMenuHeight = viewportHeight * 0.7;
		if (menuY + maxMenuHeight > viewportHeight) {
			menuY = viewportHeight - maxMenuHeight - 10;
		}
		
		contextMenu = { x: menuX, y: menuY, entry };
	}

	// 隐藏右键菜单
	function hideContextMenu() {
		contextMenu = { x: 0, y: 0, entry: null };
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

<div class="h-full flex flex-col bg-background">
	<!-- 标题栏 -->
	<div class="p-4 border-b flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Clock class="h-5 w-5" />
			<h3 class="font-semibold">历史记录</h3>
			<span class="text-sm text-muted-foreground">({history.length})</span>
		</div>
		<div class="flex items-center gap-2">
			<Button variant="ghost" size="sm" onclick={toggleViewMode} title="切换视图">
				{#if viewMode === 'list'}
					<Grid3x3 class="h-4 w-4" />
				{:else}
					<List class="h-4 w-4" />
				{/if}
			</Button>
			<Button variant="ghost" size="sm" onclick={clearHistory}>
				清除全部
			</Button>
		</div>
	</div>
	<div class="px-4 py-2 border-b text-[11px] text-muted-foreground flex flex-wrap gap-3 items-center bg-muted/30">
		<span>当前书籍：{$bookState.currentBookPath ?? '—'}</span>
		<span>
			页码：
			{#if $bookState.currentBookPath}
				{$bookState.currentPageIndex + 1}/{Math.max($bookState.totalPages, 1)}
			{:else}
				—
			{/if}
		</span>
		<span class="flex items-center gap-1">
			<Activity class="w-3 h-3" />
			任务 {$viewerState.taskCursor.running}/{$viewerState.taskCursor.concurrency}
		</span>
	</div>

	<!-- 搜索栏 -->
	<SearchBar
		placeholder="搜索历史记录..."
		onSearchChange={(query) => {
			searchQuery = query;
		}}
		storageKey="neoview-history-search-history"
	/>

	<!-- 历史列表 -->
	<div class="flex-1 overflow-auto">
		{#if filteredHistory.length === 0 && searchQuery.trim()}
			<div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
				<div class="text-center space-y-2">
					<p class="text-lg font-medium">未找到匹配的历史记录</p>
					<p class="text-sm opacity-70">搜索词: "{searchQuery}"</p>
				</div>
			</div>
		{:else if filteredHistory.length === 0}
			<div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
				<div class="relative mb-4">
					<Clock class="h-16 w-16 opacity-30" />
					<div class="absolute inset-0 flex items-center justify-center">
						<div class="h-2 w-2 bg-muted-foreground rounded-full animate-pulse"></div>
					</div>
				</div>
				<div class="text-center space-y-2">
					<p class="text-lg font-medium">暂无历史记录</p>
					<p class="text-sm opacity-70">浏览过的文件将在这里显示</p>
				</div>
			</div>
		{:else if viewMode === 'list'}
			<!-- 列表视图 -->
			<div class="p-2 space-y-2">
				{#each filteredHistory as entry (entry.id)}
					<div class="relative group">
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
							class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
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
					{#each filteredHistory as entry (entry.id)}
						<div class="relative group">
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
								class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80"
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

	<!-- 右键菜单 -->
	{#if contextMenu.entry}
		<ContextMenu.Root open={true} onOpenChange={(open) => { if (!open) hideContextMenu(); }}>
			<ContextMenu.Trigger />
			<ContextMenu.Content
				style="position: fixed; left: {contextMenu.x}px; top: {contextMenu.y}px; z-index: 10000;"
			>
				<ContextMenu.Item onclick={() => openHistory(contextMenu.entry!)}>
					<FolderOpen class="h-4 w-4 mr-2" />
					打开
				</ContextMenu.Item>
				<ContextMenu.Separator />
				<ContextMenu.Item onclick={() => addToBookmark(contextMenu.entry!)}>
					<Bookmark class="h-4 w-4 mr-2" />
					添加到书签
				</ContextMenu.Item>
				<ContextMenu.Separator />
				<ContextMenu.Item onclick={() => openInExplorer(contextMenu.entry!)}>
					<ExternalLink class="h-4 w-4 mr-2" />
					在资源管理器中打开
				</ContextMenu.Item>
				<ContextMenu.Item onclick={() => openWithExternalApp(contextMenu.entry!)}>
					<ExternalLink class="h-4 w-4 mr-2" />
					在外部应用中打开
				</ContextMenu.Item>
				<ContextMenu.Separator />
				<ContextMenu.Item onclick={() => copyPath(contextMenu.entry!)}>
					复制路径
				</ContextMenu.Item>
				<ContextMenu.Separator />
				<ContextMenu.Item onclick={() => removeHistory(contextMenu.entry!.id)} class="text-red-600 focus:text-red-600">
					<Trash2 class="h-4 w-4 mr-2" />
					删除
				</ContextMenu.Item>
			</ContextMenu.Content>
		</ContextMenu.Root>
	{/if}
</div>
