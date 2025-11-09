<script lang="ts">
	/**
	 * NeoView - Bookmark Panel Component
	 * 书签面板 - 参考 NeeView BookmarkPanel.cs
	 */
	import { Bookmark, X, Star, Folder as FolderIcon } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	interface BookmarkEntry {
		id: string;
		path: string;
		name: string;
		page: number;
		timestamp: number;
		starred: boolean;
	}

	let bookmarks = $state<BookmarkEntry[]>([]);
	let searchQuery = $state('');

	let filteredBookmarks = $derived(bookmarks.filter(
		(b) =>
			b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			b.path.toLowerCase().includes(searchQuery.toLowerCase())
	));

	function addBookmark() {
		const name = prompt('输入书签名称:');
		if (!name) return;

		const newBookmark: BookmarkEntry = {
			id: Date.now().toString(),
			path: 'C:\\Path\\To\\File',
			name,
			page: 1,
			timestamp: Date.now(),
			starred: false
		};

		bookmarks = [newBookmark, ...bookmarks];
		saveBookmarks();
	}

	function removeBookmark(id: string) {
		bookmarks = bookmarks.filter((b) => b.id !== id);
		saveBookmarks();
	}

	function toggleStar(id: string) {
		bookmarks = bookmarks.map((b) =>
			b.id === id ? { ...b, starred: !b.starred } : b
		);
		saveBookmarks();
	}

	function openBookmark(bookmark: BookmarkEntry) {
		// TODO: 实现打开书签
		console.log('Opening bookmark:', bookmark);
	}

	function saveBookmarks() {
		localStorage.setItem('neoview-bookmarks', JSON.stringify(bookmarks));
	}

	function getFileName(path: string): string {
		return path.split(/[\\/]/).pop() || path;
	}

	// 加载书签
	$effect(() => {
		const saved = localStorage.getItem('neoview-bookmarks');
		if (saved) {
			try {
				bookmarks = JSON.parse(saved);
			} catch (e) {
				console.error('Failed to load bookmarks:', e);
			}
		} else {
			// 示例数据
			bookmarks = [
				{
					id: '1',
					path: 'C:\\Images\\Favorites\\Collection 1',
					name: '收藏集 1',
					page: 10,
					timestamp: Date.now() - 3600000,
					starred: true
				},
				{
					id: '2',
					path: 'D:\\Manga\\Series\\Volume 5.zip',
					name: '漫画系列 - 第5卷',
					page: 45,
					timestamp: Date.now() - 86400000,
					starred: false
				}
			];
		}
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
			<Button size="sm" onclick={addBookmark}>
				添加
			</Button>
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
								<p>• 按 Ctrl+D 快速添加当前页到书签</p>
								<p>• 为书签添加星标，置顶重要内容</p>
								<p>• 使用搜索功能快速定位书签</p>
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
								<FolderIcon class="h-6 w-6 text-muted-foreground" />
							</div>

							<!-- 信息 -->
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<div class="font-medium truncate" title={bookmark.name}>
										{bookmark.name}
									</div>
									<div
										role="button"
										tabindex="0"
										onclick={(e) => {
											e.stopPropagation();
											toggleStar(bookmark.id);
										}}
										onkeydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.stopPropagation();
												toggleStar(bookmark.id);
											}
										}}
										class="flex-shrink-0 cursor-pointer hover:bg-accent/50 rounded p-1"
									>
										<Star
											class="h-4 w-4 {bookmark.starred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}"
										/>
									</div>
								</div>
								<div class="text-xs text-muted-foreground truncate mt-1" title={bookmark.path}>
									{getFileName(bookmark.path)}
								</div>
								<div class="text-xs text-muted-foreground mt-1">
									页码: {bookmark.page}
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
