<script lang="ts">
	/**
	 * NeoView - History Panel Component
	 * 历史记录面板 - 参考 NeeView HistoryPanel.cs
	 * 使用 FileItemCard 组件，支持列表和网格视图
	 */
	import { Clock, X, Grid3x3, List } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { historyStore, type HistoryEntry } from '$lib/stores/history.svelte';
	import FileItemCard from './file/components/FileItemCard.svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import { thumbnailManager } from '$lib/utils/thumbnailManager';
	import type { FsItem } from '$lib/types';

	let history = $state<HistoryEntry[]>([]);
	let viewMode = $state<'list' | 'grid'>('list');
	let thumbnails = $state<Map<string, string>>(new Map());

	// 加载历史记录
	function loadHistory() {
		history = historyStore.getAll();
		// 加载缩略图
		loadThumbnails();
	}

	// 加载缩略图
	async function loadThumbnails() {
		const newThumbnails = new Map<string, string>();
		for (const entry of history) {
			try {
				const thumbnail = await thumbnailManager.getThumbnail(entry.path, undefined, false, 'normal');
				if (thumbnail) {
					newThumbnails.set(entry.path, thumbnail);
				}
			} catch (err) {
				console.debug('加载缩略图失败:', entry.path, err);
			}
		}
		thumbnails = newThumbnails;
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
		loadHistory();
	}

	// 清空历史记录
	function clearHistory() {
		if (confirm('确定要清除所有历史记录吗？')) {
			historyStore.clear();
			loadHistory();
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

	// 订阅历史记录变化
	$effect(() => {
		loadHistory();
		const unsubscribe = historyStore.subscribe(() => {
			loadHistory();
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

	<!-- 历史列表 -->
	<div class="flex-1 overflow-auto">
		{#if history.length === 0}
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
				{#each history as entry (entry.id)}
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
					{#each history as entry (entry.id)}
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
</div>
