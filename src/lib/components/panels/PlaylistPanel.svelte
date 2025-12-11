<script lang="ts">
	/**
	 * Playlist Panel
	 * 播放列表面板 - 管理多个书籍播放列表
	 */
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		ListMusic,
		Plus,
		Trash2,
		Play,
		Folder,
		FileArchive,
		GripVertical
	} from '@lucide/svelte';
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

	let activePlaylist = $state<string | null>(
		localStorage.getItem(ACTIVE_PLAYLIST_KEY) || null
	);
	
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

<div class="h-full flex flex-col">
	<!-- 头部 -->
	<div class="p-3 border-b">
		<div class="flex items-center justify-between mb-2">
			<h3 class="text-sm font-semibold flex items-center gap-2">
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
				<Button variant="default" size="sm" class="h-7 px-2" onclick={createPlaylist}>
					创建
				</Button>
			</div>
		{/if}

		<!-- 播放列表标签 -->
		<div class="flex gap-1 overflow-x-auto mt-2">
			{#each playlists as list}
				<button
					class="px-3 py-1 text-xs rounded-md whitespace-nowrap transition-colors {activePlaylist ===
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
		<div class="flex-1 flex flex-col overflow-hidden bg-background">
			<!-- 工具栏 -->
			<div class="p-2 border-b flex items-center justify-between">
				<span class="text-xs text-muted-foreground">{currentPlaylist.items.length} 项</span>
				<div class="flex gap-1">
					<Button variant="ghost" size="sm" class="h-6 px-2 text-xs" onclick={addToPlaylist}>
						<Plus class="h-3 w-3 mr-1" />
						添加
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="h-6 px-2 text-xs text-destructive hover:text-destructive"
						onclick={() => deletePlaylist(currentPlaylist.id)}
					>
						<Trash2 class="h-3 w-3 mr-1" />
						删除列表
					</Button>
				</div>
			</div>

			<!-- 项目列表 -->
			<div class="flex-1 overflow-y-auto p-2">
				{#if currentPlaylist.items.length === 0}
					<div class="text-center py-8 text-sm text-muted-foreground">
						<ListMusic class="h-8 w-8 mx-auto mb-2 opacity-50" />
						<p>播放列表为空</p>
						<p class="text-xs mt-1">点击"添加"按钮添加书籍</p>
					</div>
				{:else}
					<div class="space-y-1">
						{#each currentPlaylist.items as item}
							<div
								class="flex items-center gap-2 p-2 rounded-md hover:bg-accent border border-transparent hover:border-border transition-colors group"
							>
								<!-- 拖动手柄 -->

								<!-- 操作按钮 -->
								<div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
										class="h-6 w-6 text-destructive hover:text-destructive"
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
		<div class="flex-1 flex items-center justify-center text-sm text-muted-foreground">
			<div class="text-center">
				<ListMusic class="h-12 w-12 mx-auto mb-2 opacity-30" />
				<p>暂无播放列表</p>
				<Button variant="outline" size="sm" class="mt-3" onclick={() => (isCreating = true)}>
					<Plus class="h-3 w-3 mr-1" />
					创建播放列表
				</Button>
			</div>
		</div>
	{/if}
</div>
