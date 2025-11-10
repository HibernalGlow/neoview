<script lang="ts">
	/**
	 * NeoView - Bookmark Panel Component
	 * 书签面板 - 使用 bookmarkStore
	 */
	import { Bookmark, X, Star, Folder as FolderIcon, FileArchive, File } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import BookmarkSortPanel from '$lib/components/ui/sort/BookmarkSortPanel.svelte';
	import { bookmarkStore } from '$lib/stores/bookmark.svelte';
	import type { FsItem } from '$lib/types';
	import { FileSystemAPI } from '$lib/api';

	let bookmarks: any[] = $state([]);
	let searchQuery = $state('');

	let filteredBookmarks = $derived(bookmarks.filter(
		(b) =>
			b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			b.path.toLowerCase().includes(searchQuery.toLowerCase())
	));

	function removeBookmark(id: string) {
		bookmarkStore.remove(id);
		loadBookmarks();
	}

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
					console.log('打开压缩包:', bookmark.path);
					// TODO: 集成到书籍查看器
				} else {
					console.log('打开文件:', bookmark.path);
					// 使用系统默认应用打开
					await FileSystemAPI.openWithSystem(bookmark.path);
				}
			}
		} catch (err) {
			console.error('打开书签失败:', err);
		}
	}

	function getFileName(path: string): string {
		return path.split(/[\/\\]/).pop() || path;
	}

	/**
	 * 处理书签排序
	 */
	function handleBookmarkSort(sortedBookmarks: any[]) {
		// 更新 bookmarkStore 中的顺序
		const allBookmarks = bookmarkStore.getAll();
		const newOrder = sortedBookmarks.map(sorted => 
			allBookmarks.find(b => b.id === sorted.id)
		).filter(Boolean);
		
		// 清空并重新添加以保持新顺序
		bookmarkStore.clear();
		newOrder.forEach(bookmark => {
			bookmarkStore.add({
				name: bookmark.name,
				path: bookmark.path,
				isDir: bookmark.type === 'folder',
				isImage: false,
				size: 0,
				modified: 0
			} as FsItem);
		});
		
		loadBookmarks();
	}

	function loadBookmarks() {
		bookmarks = bookmarkStore.getAll();
	}

	// 加载书签并订阅更新
	$effect(() => {
		loadBookmarks();
		const unsubscribe = bookmarkStore.subscribe(loadBookmarks);
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
			</div>
			<div class="flex items-center gap-2">
				<BookmarkSortPanel 
					bookmarks={bookmarks} 
					onSort={handleBookmarkSort}
				/>
				<!-- 添加按钮已移除，通过文件浏览器右键菜单添加 -->
			</div>
		</div>
		<Input
			type="search"
			placeholder="搜索书签..."
			bind:value={searchQuery}
			class="w-full"
		/>
	</div>

	<!-- 书签列表 -->
	<div class="flex-1 overflow-auto">
		<div class="p-2 space-y-2">
			{#if filteredBookmarks.length === 0}
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
						{#if !searchQuery}
							<div class="mt-4 p-3 bg-muted/50 rounded-lg text-xs space-y-1">
								<p class="font-medium text-foreground">提示：</p>
								<p>• 右键点击文件或文件夹添加到书签</p>
								<p>• 使用搜索功能快速定位书签</p>
								<p>• 点击书签快速访问收藏内容</p>
							</div>
						{/if}
					</div>
				</div>
			{:else}
				{#each filteredBookmarks as bookmark (bookmark.id)}
					<button
						class="group relative w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors cursor-pointer"
						onclick={() => openBookmark(bookmark)}
					>
						<div class="flex items-start gap-3">
							<!-- 图标 -->
							<div class="flex-shrink-0 w-12 h-12 bg-secondary rounded flex items-center justify-center">
								{#if bookmark.type === 'folder'}
									<FolderIcon class="h-6 w-6 text-blue-500" />
								{:else if bookmark.name.endsWith('.zip') || bookmark.name.endsWith('.cbz')}
									<FileArchive class="h-6 w-6 text-purple-500" />
								{:else}
									<File class="h-6 w-6 text-gray-400" />
								{/if}
							</div>

							<!-- 信息 -->
							<div class="flex-1 min-w-0">
								<div class="font-medium truncate" title={bookmark.name}>
									{bookmark.name}
								</div>
								<div class="text-xs text-muted-foreground truncate mt-1" title={bookmark.path}>
									{getFileName(bookmark.path)}
								</div>
								<div class="text-xs text-muted-foreground mt-1">
									{bookmark.createdAt ? new Date(bookmark.createdAt).toLocaleDateString() : ''}
								</div>
							</div>

							<!-- 删除按钮 -->
							<Button
								variant="ghost"
								size="icon"
								class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
								onclick={(e) => {
									e.stopPropagation();
									removeBookmark(bookmark.id);
								}}
							>
								<X class="h-4 w-4" />
							</Button>
						</div>
					</button>
				{/each}
			{/if}
		</div>
	</div>
</div>