<script lang="ts">
	/**
	 * NeoView - Bookmark Panel Component
	 * 书签面板 - 使用 bookmarkStore 和 FileItemCard
	 * 支持列表和网格视图
	 */
import { Bookmark, X, Star, Grid3x3, List, Activity } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import BookmarkSortPanel from '$lib/components/ui/sort/BookmarkSortPanel.svelte';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import FileItemCard from './file/components/FileItemCard.svelte';
import type { FsItem } from '$lib/types';
import { FileSystemAPI } from '$lib/api';
import { bookStore } from '$lib/stores/book.svelte';
import { thumbnailManager } from '$lib/utils/thumbnailManager';
import { readable } from 'svelte/store';
import { appState, type StateSelector } from '$lib/core/state/appState';
import { taskScheduler } from '$lib/core/tasks/taskScheduler';

let bookmarks: any[] = $state([]);
let searchQuery = $state('');
let viewMode = $state<'list' | 'grid'>('list');
let thumbnails = $state<Map<string, string>>(new Map());
const thumbnailJobs = new Map<string, string>();

function createAppStateStore<T>(selector: StateSelector<T>) {
	const initial = selector(appState.getSnapshot());
	return readable(initial, (set) => appState.subscribe(selector, (value) => set(value)));
}

const bookState = createAppStateStore((state) => state.book);
const viewerState = createAppStateStore((state) => state.viewer);

	let filteredBookmarks = $derived(bookmarks.filter(
		(b) =>
			b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			b.path.toLowerCase().includes(searchQuery.toLowerCase())
	));

	// 加载缩略图（异步，不阻塞）
function loadThumbnails(bookmarkList: any[]) {
	for (const bookmark of bookmarkList) {
		if (thumbnailJobs.has(bookmark.path)) {
			continue;
		}
		const snapshot = taskScheduler.enqueue({
			type: 'bookmark-thumbnail-load',
			bucket: 'background',
			priority: 'low',
			source: 'bookmark-panel',
			executor: async () => {
				try {
					const isArchive =
						bookmark.name.endsWith('.zip') ||
						bookmark.name.endsWith('.cbz') ||
						bookmark.name.endsWith('.rar') ||
						bookmark.name.endsWith('.cbr');
					const thumbnail = await thumbnailManager.getThumbnail(bookmark.path, undefined, isArchive, 'normal');
					if (thumbnail) {
						thumbnails = new Map(thumbnails).set(bookmark.path, thumbnail);
					}
				} catch (err) {
					console.debug('加载缩略图失败:', bookmark.path, err);
				} finally {
					thumbnailJobs.delete(bookmark.path);
				}
			}
		});
		thumbnailJobs.set(bookmark.path, snapshot.id);
	}
}

	// 移除书签
	function removeBookmark(id: string) {
		bookmarkStore.remove(id);
		// 状态会通过 store 订阅自动更新
	}

	// 打开书签
	async function openBookmark(bookmark: any) {
		try {
			if (bookmark.type === 'folder') {
				// 使用 FileSystemAPI 打开文件夹
				const items = await FileSystemAPI.browseDirectory(bookmark.path);
				console.log('打开文件夹:', bookmark.path, '包含', items.length, '个项目');
				// TODO: 集成到主界面的导航系统
			} else {
				// 检查是否为压缩包
				const isArchive = await FileSystemAPI.isSupportedArchive(bookmark.path);
				if (isArchive) {
					// 使用 bookStore 打开
					await bookStore.openBook(bookmark.path);
				} else {
					// 使用系统默认应用打开
					await FileSystemAPI.openWithSystem(bookmark.path);
				}
			}
		} catch (err) {
			console.error('打开书签失败:', err);
		}
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

	// 切换视图模式
	function toggleViewMode() {
		viewMode = viewMode === 'list' ? 'grid' : 'list';
	}

	/**
	 * 处理书签排序
	 */
	function handleBookmarkSort(sortedBookmarks: any[]) {
		// 更新 bookmarkStore 中的顺序
		const allBookmarks = bookmarkStore.getAll();
		const newOrder = sortedBookmarks.map(sorted => 
			allBookmarks.find(b => b.id === sorted.id)
		).filter((b): b is NonNullable<typeof b> => b !== undefined);
		
		// 清空并重新添加以保持新顺序
		bookmarkStore.clear();
		newOrder.forEach(bookmark => {
			if (bookmark) {
				bookmarkStore.add({
					name: bookmark.name,
					path: bookmark.path,
					isDir: bookmark.type === 'folder',
					isImage: false,
					size: 0,
					modified: 0
				} as FsItem);
			}
		});
		// 状态会通过 store 订阅自动更新
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

<div class="h-full flex flex-col bg-background">
	<!-- 标题栏 -->
	<div class="p-4 border-b">
		<div class="flex items-center justify-between mb-3">
			<div class="flex items-center gap-2">
				<Bookmark class="h-5 w-5" />
				<h3 class="font-semibold">书签</h3>
				<span class="text-sm text-muted-foreground">({filteredBookmarks.length})</span>
			</div>
			<div class="flex items-center gap-2">
				<Button variant="ghost" size="sm" onclick={toggleViewMode} title="切换视图">
					{#if viewMode === 'list'}
						<Grid3x3 class="h-4 w-4" />
					{:else}
						<List class="h-4 w-4" />
					{/if}
				</Button>
				<BookmarkSortPanel 
					bookmarks={bookmarks} 
					onSort={handleBookmarkSort}
				/>
			</div>
		</div>
		<Input
			type="search"
			placeholder="搜索书签..."
			bind:value={searchQuery}
			class="w-full"
		/>
	</div>
	<div class="px-4 py-2 border-b flex flex-wrap gap-3 text-[11px] text-muted-foreground bg-muted/30">
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

	<!-- 书签列表 -->
	<div class="flex-1 overflow-auto">
			{#if filteredBookmarks.length === 0 || !filteredBookmarks}
			<div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
				<div class="relative mb-4">
					<Bookmark class="h-16 w-16 opacity-30" />
					{#if !searchQuery}
						<div class="absolute -top-1 -right-1">
							<Star class="h-4 w-4 text-yellow-400 fill-yellow-400 animate-pulse" />
						</div>
					{/if}
				</div>
				<div class="text-center space-y-2">
					<p class="text-lg font-medium">
						{searchQuery ? '未找到匹配的书签' : '暂无书签'}
					</p>
					<p class="text-sm opacity-70">
						{searchQuery 
							? `尝试其他关键词：${searchQuery}` 
							: '标记重要页面，方便快速访问'}
					</p>
				</div>
			</div>
			{:else if viewMode === 'list'}
			<!-- 列表视图 -->
			<div class="p-2 space-y-2">
				{#each filteredBookmarks as bookmark (bookmark?.id || bookmark.path)}
					{#if bookmark}
						<div class="relative group">
							<FileItemCard
								item={bookmarkToFsItem(bookmark)}
								thumbnail={thumbnails.get(bookmark.path)}
								viewMode="list"
								showReadMark={false}
								showBookmarkMark={true}
								onClick={() => openBookmark(bookmark)}
								onDoubleClick={() => openBookmark(bookmark)}
							/>
							<Button
								variant="ghost"
								size="icon"
								class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
								onclick={(e) => {
									e.stopPropagation();
									removeBookmark(bookmark.id);
								}}
							>
								<X class="h-4 w-4" />
							</Button>
						</div>
					{/if}
				{/each}
			</div>
			{:else}
			<!-- 网格视图 -->
			<div class="p-2">
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{#each filteredBookmarks as bookmark (bookmark?.id || bookmark.path)}
						{#if bookmark}
							<div class="relative group">
								<FileItemCard
									item={bookmarkToFsItem(bookmark)}
									thumbnail={thumbnails.get(bookmark.path)}
									viewMode="grid"
									showReadMark={false}
									showBookmarkMark={true}
									onClick={() => openBookmark(bookmark)}
									onDoubleClick={() => openBookmark(bookmark)}
								/>
								<Button
									variant="ghost"
									size="icon"
									class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80"
									onclick={(e) => {
										e.stopPropagation();
										removeBookmark(bookmark.id);
									}}
								>
									<X class="h-4 w-4" />
								</Button>
							</div>
						{/if}
				{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
