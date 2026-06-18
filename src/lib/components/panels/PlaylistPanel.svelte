<script lang="ts">
	/**
	 * Playlist Panel
	 * 播放列表面板 - 管理多个书籍播放列表
	 */
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { ListMusic, Plus, Trash2, Play, Folder, FileArchive, GripVertical } from '@lucide/svelte';
	import { confirm } from '$lib/stores/confirmDialog.svelte';
	import { showInfoToast } from '$lib/utils/toast';

	interface PlaylistItem {
		path: string;
		name: string;
		type: 'archive' | 'folder';
		pages: number;
	}

	interface Playlist {
		id: string;
		name: string;
		items: PlaylistItem[];
		createdAt: Date;
	}

	const STORAGE_KEY = 'neoview-playlists';
	const ACTIVE_PLAYLIST_KEY = 'neoview-active-playlist';

	// 从 localStorage 加载播放列表
	function loadPlaylists(): Playlist[] {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored);
				return parsed.map((p: any) => ({
					...p,
					createdAt: new Date(p.createdAt)
				}));
			}
		} catch (e) {
			console.error('Failed to load playlists:', e);
		}
		return [];
	}

	// 保存播放列表到 localStorage
	function savePlaylists() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
			if (activePlaylist) {
				localStorage.setItem(ACTIVE_PLAYLIST_KEY, activePlaylist);
			}
		} catch (e) {
			console.error('Failed to save playlists:', e);
		}
	}

	let playlists = $state<Playlist[]>(loadPlaylists());

	let activePlaylist = $state<string | null>(localStorage.getItem(ACTIVE_PLAYLIST_KEY) || null);

	// 初始化时设置默认活跃播放列表
	$effect(() => {
		if (activePlaylist === null && playlists.length > 0) {
			activePlaylist = playlists[0].id;
		}
	});
	let newPlaylistName = $state('');
	let isCreating = $state(false);

	// 获取当前播放列表
	const currentPlaylist = $derived(playlists.find((p) => p.id === activePlaylist) || null);

	function createPlaylist() {
		if (newPlaylistName.trim()) {
			const newList: Playlist = {
				id: Date.now().toString(),
				name: newPlaylistName.trim(),
				items: [],
				createdAt: new Date()
			};
			playlists = [...playlists, newList];
			activePlaylist = newList.id;
			newPlaylistName = '';
			isCreating = false;
			savePlaylists();
		}
	}

	async function deletePlaylist(id: string) {
		const confirmed = await confirm({
			title: '确认删除',
			description: '确定要删除此播放列表吗？',
			confirmText: '删除',
			cancelText: '取消',
			variant: 'destructive'
		});
		if (confirmed) {
			playlists = playlists.filter((p) => p.id !== id);
			if (activePlaylist === id) {
				activePlaylist = playlists[0]?.id || null;
			}
			savePlaylists();
		}
	}

	function removeItem(itemPath: string) {
		if (currentPlaylist) {
			currentPlaylist.items = currentPlaylist.items.filter((item) => item.path !== itemPath);
			playlists = [...playlists];
			savePlaylists();
		}
	}

	async function playItem(item: PlaylistItem) {
		const { bookStore } = await import('$lib/stores/book.svelte');
		await bookStore.openBook(item.path);
	}

	async function addToPlaylist() {
		const { open } = await import('@tauri-apps/plugin-dialog');
		const selected = await open({
			multiple: true,
			directory: false,
			filters: [{ name: '压缩包', extensions: ['zip', 'rar', '7z', 'cbz', 'cbr'] }]
		});
		if (selected && currentPlaylist) {
			const paths = Array.isArray(selected) ? selected : [selected];
			for (const path of paths) {
				const name = path.split(/[\\/]/).pop() || path;
				currentPlaylist.items.push({
					path,
					name,
					type: 'archive',
					pages: 0
				});
			}
			playlists = [...playlists];
			savePlaylists();
		}
	}
</script>

<div class="flex h-full flex-col">
	<!-- 头部 -->
	<div class="border-b p-3">
		<div class="mb-2 flex items-center justify-between">
			<h3 class="flex items-center gap-2 text-sm font-semibold">
				<ListMusic class="h-4 w-4" />
				播放列表
			</h3>
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				onclick={() => (isCreating = !isCreating)}
				title="新建播放列表"
			>
				<Plus class="h-3 w-3" />
			</Button>
		</div>

		<!-- 新建播放列表 -->
		{#if isCreating}
			<div class="flex gap-1">
				<Input
					type="text"
					placeholder="播放列表名称"
					bind:value={newPlaylistName}
					class="h-7 text-xs"
					onkeydown={(e) => e.key === 'Enter' && createPlaylist()}
				/>
				<Button variant="default" size="sm" class="h-7 px-2" onclick={createPlaylist}>创建</Button>
			</div>
		{/if}

		<!-- 播放列表标签 -->
		<div class="mt-2 flex gap-1 overflow-x-auto">
			{#each playlists as list}
				<button
					class="rounded-md px-3 py-1 text-xs whitespace-nowrap transition-colors {activePlaylist ===
					list.id
						? 'bg-primary text-primary-foreground'
						: 'bg-muted hover:bg-muted/80'}"
					onclick={() => (activePlaylist = list.id)}
				>
					{list.name} ({list.items.length})
				</button>
			{/each}
		</div>
	</div>

	<!-- 播放列表内容 -->
	{#if currentPlaylist}
		<div class="bg-background flex flex-1 flex-col overflow-hidden">
			<!-- 工具栏 -->
			<div class="flex items-center justify-between border-b p-2">
				<span class="text-muted-foreground text-xs">{currentPlaylist.items.length} 项</span>
				<div class="flex gap-1">
					<Button variant="ghost" size="sm" class="h-6 px-2 text-xs" onclick={addToPlaylist}>
						<Plus class="mr-1 h-3 w-3" />
						添加
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="text-destructive hover:text-destructive h-6 px-2 text-xs"
						onclick={() => deletePlaylist(currentPlaylist.id)}
					>
						<Trash2 class="mr-1 h-3 w-3" />
						删除列表
					</Button>
				</div>
			</div>

			<!-- 项目列表 -->
			<div class="flex-1 overflow-y-auto p-2">
				{#if currentPlaylist.items.length === 0}
					<div class="text-muted-foreground py-8 text-center text-sm">
						<ListMusic class="mx-auto mb-2 h-8 w-8 opacity-50" />
						<p>播放列表为空</p>
						<p class="mt-1 text-xs">点击"添加"按钮添加书籍</p>
					</div>
				{:else}
					<div class="space-y-1">
						{#each currentPlaylist.items as item}
							<div
								class="hover:bg-accent hover:border-border group flex items-center gap-2 rounded-md border border-transparent p-2 transition-colors"
							>
								<!-- 拖动手柄 -->

								<!-- 操作按钮 -->
								<div class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
									<Button
										variant="ghost"
										size="icon"
										class="h-6 w-6"
										onclick={() => playItem(item)}
										title="播放"
									>
										<Play class="h-3 w-3" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										class="text-destructive hover:text-destructive h-6 w-6"
										onclick={() => removeItem(item.path)}
										title="移除"
									>
										<Trash2 class="h-3 w-3" />
									</Button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<div class="text-muted-foreground flex flex-1 items-center justify-center text-sm">
			<div class="text-center">
				<ListMusic class="mx-auto mb-2 h-12 w-12 opacity-30" />
				<p>暂无播放列表</p>
				<Button variant="outline" size="sm" class="mt-3" onclick={() => (isCreating = true)}>
					<Plus class="mr-1 h-3 w-3" />
					创建播放列表
				</Button>
			</div>
		</div>
	{/if}
</div>
