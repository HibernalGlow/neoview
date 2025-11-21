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
		FolderOpen
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import BookmarkSortPanel from '$lib/components/ui/sort/BookmarkSortPanel.svelte';
	import SearchBar from '$lib/components/ui/SearchBar.svelte';
	import { bookmarkStore } from '$lib/stores/bookmark.svelte';
	import FileItemCard from './file/components/FileItemCard.svelte';
	import type { FsItem } from '$lib/types';
	import { FileSystemAPI } from '$lib/api';
	import { bookStore } from '$lib/stores/book.svelte';
	import { thumbnailManager } from '$lib/utils/thumbnailManager';
	import { readable } from 'svelte/store';
	import { appState, type StateSelector } from '$lib/core/state/appState';
	import { taskScheduler } from '$lib/core/tasks/taskScheduler';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
	import { setActivePanelTab } from '$lib/stores';

	let bookmarks: any[] = $state([]);
	let searchQuery = $state('');
	let viewMode = $state<'list' | 'grid'>('list');
	let thumbnails = $state<Map<string, string>>(new Map());
	const thumbnailJobs = new Map<string, string>();
	let contextMenu = $state<{ x: number; y: number; bookmark: any | null }>({
		x: 0,
		y: 0,
		bookmark: null
	});
	let syncFileTreeOnBookmarkSelect = $state(false);

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
						const thumbnail = await thumbnailManager.getThumbnail(
							bookmark.path,
							undefined,
							isArchive,
							'normal'
						);
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
			// 计算目标路径：如果是文件，则定位到其父目录
			let targetPath = bookmark.path;
			if (bookmark.type !== 'folder') {
				const lastSeparator = Math.max(
					bookmark.path.lastIndexOf('/'),
					bookmark.path.lastIndexOf('\\')
				);
				if (lastSeparator > 0) {
					targetPath = bookmark.path.substring(0, lastSeparator);
				}
			}

			// 同步文件树逻辑
			if (syncFileTreeOnBookmarkSelect) {
				try {
					console.log('🌳 同步文件树到:', targetPath);
					// 静默同步
					await fileBrowserStore.navigateToPath(targetPath);
				} catch (err) {
					console.debug('同步文件树失败:', err);
				}
			}

			if (bookmark.type === 'folder') {
				// 如果是文件夹
				if (!syncFileTreeOnBookmarkSelect) {
					// 如果没有开启静默同步，则跳转到文件浏览器并打开该文件夹
					await fileBrowserStore.navigateToPath(targetPath);
					setActivePanelTab('folder');
				}
				// 如果开启了静默同步，上面已经导航了，且不切换 Tab
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

	// 显示右键菜单
	function showContextMenu(e: MouseEvent, bookmark: any) {
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

		contextMenu = { x: menuX, y: menuY, bookmark };
	}

	// 隐藏右键菜单
	function hideContextMenu() {
		contextMenu = { x: 0, y: 0, bookmark: null };
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

	/**
	 * 处理书签排序
	 */
	function handleBookmarkSort(sortedBookmarks: any[]) {
		// 更新 bookmarkStore 中的顺序
		const allBookmarks = bookmarkStore.getAll();
		const newOrder = sortedBookmarks
			.map((sorted) => allBookmarks.find((b) => b.id === sorted.id))
			.filter((b): b is NonNullable<typeof b> => b !== undefined);

		// 清空并重新添加以保持新顺序
		bookmarkStore.clear();
		newOrder.forEach((bookmark) => {
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

<div class="bg-background flex h-full flex-col overflow-hidden">
	<div
		class="border-border bg-background/95 supports-backdrop-filter:bg-background/70 sticky top-0 z-20 flex flex-col border-b backdrop-blur"
	>
		<!-- 标题栏 -->
		<div class="border-b p-4">
			<div class="mb-3 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<Bookmark class="h-5 w-5" />
					<h3 class="font-semibold">书签</h3>
					<span class="text-muted-foreground text-sm">({filteredBookmarks.length})</span>
				</div>
				<div class="flex items-center gap-3">
					<div class="text-muted-foreground flex items-center gap-1 text-xs">
						<Checkbox
							bind:checked={syncFileTreeOnBookmarkSelect}
							aria-label="选中书签时同步文件树"
						/>
						<span>同步文件树</span>
					</div>
					<Button variant="ghost" size="sm" onclick={toggleViewMode} title="切换视图">
						{#if viewMode === 'list'}
							<Grid3x3 class="h-4 w-4" />
						{:else}
							<List class="h-4 w-4" />
						{/if}
					</Button>
					<BookmarkSortPanel {bookmarks} onSort={handleBookmarkSort} />
				</div>
			</div>
			<div class="border-border bg-background/95 border-b px-4 pb-4">
				<SearchBar
					placeholder="搜索书签..."
					onSearchChange={(query: string) => {
						searchQuery = query;
					}}
					storageKey="neoview-bookmark-search-history"
				/>
			</div>
		</div>
	</div>

	<div class="min-h-0 flex-1 overflow-hidden">
		<!-- 书签列表 -->
		<div class="flex-1 overflow-auto">
			{#if filteredBookmarks.length === 0 || !filteredBookmarks}
				<div class="text-muted-foreground flex flex-col items-center justify-center py-12">
					<div class="relative mb-4">
						<Bookmark class="h-16 w-16 opacity-30" />
						{#if !searchQuery}
							<div class="absolute -right-1 -top-1">
								<Star class="h-4 w-4 animate-pulse fill-yellow-400 text-yellow-400" />
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
			{:else if viewMode === 'list'}
				<!-- 列表视图 -->
				<div class="space-y-2 p-2">
					{#each filteredBookmarks as bookmark (bookmark?.id || bookmark.path)}
						{#if bookmark}
							<div class="group relative">
								<FileItemCard
									item={bookmarkToFsItem(bookmark)}
									thumbnail={thumbnails.get(bookmark.path)}
									viewMode="list"
									showReadMark={false}
									showBookmarkMark={true}
									onClick={() => openBookmark(bookmark)}
									onDoubleClick={() => openBookmark(bookmark)}
									onContextMenu={(e) => showContextMenu(e, bookmark)}
								/>
								<Button
									variant="ghost"
									size="icon"
									class="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
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
								<div class="group relative">
									<FileItemCard
										item={bookmarkToFsItem(bookmark)}
										thumbnail={thumbnails.get(bookmark.path)}
										viewMode="grid"
										showReadMark={false}
										showBookmarkMark={true}
										onClick={() => openBookmark(bookmark)}
										onDoubleClick={() => openBookmark(bookmark)}
										onContextMenu={(e) => showContextMenu(e, bookmark)}
									/>
									<Button
										variant="ghost"
										size="icon"
										class="bg-background/80 absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
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

	<!-- 右键菜单 -->
	{#if contextMenu.bookmark}
		<ContextMenu.Root
			open={true}
			onOpenChange={(open) => {
				if (!open) hideContextMenu();
			}}
		>
			<ContextMenu.Trigger />
			<ContextMenu.Content
				style="position: fixed; left: {contextMenu.x}px; top: {contextMenu.y}px; z-index: 10000;"
			>
				<ContextMenu.Item onclick={() => openBookmark(contextMenu.bookmark!)}>
					<FolderOpen class="mr-2 h-4 w-4" />
					打开
				</ContextMenu.Item>
				<ContextMenu.Separator />
				<ContextMenu.Item onclick={() => openInExplorer(contextMenu.bookmark!)}>
					<ExternalLink class="mr-2 h-4 w-4" />
					在资源管理器中打开
				</ContextMenu.Item>
				<ContextMenu.Item onclick={() => openWithExternalApp(contextMenu.bookmark!)}>
					<ExternalLink class="mr-2 h-4 w-4" />
					在外部应用中打开
				</ContextMenu.Item>
				<ContextMenu.Separator />
				<ContextMenu.Item onclick={() => copyPath(contextMenu.bookmark!)}>
					复制路径
				</ContextMenu.Item>
				<ContextMenu.Separator />
				<ContextMenu.Item
					onclick={() => removeBookmark(contextMenu.bookmark!.id)}
					class="text-red-600 focus:text-red-600"
				>
					<Trash2 class="mr-2 h-4 w-4" />
					删除
				</ContextMenu.Item>
			</ContextMenu.Content>
		</ContextMenu.Root>
	{/if}
</div>
