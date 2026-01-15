<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { FsItem } from '$lib/types';
	import {
		ContextMenuItem,
		ContextMenuSeparator,
		ContextMenuItemRow,
		ContextMenuItemIcon
	} from '$lib/components/ui/context-menu';
	import {
		Folder,
		Bookmark,
		Trash2,
		ExternalLink,
		Scissors,
		Copy as CopyIcon,
		ClipboardPaste,
		Pencil,
		RefreshCw
	} from '@lucide/svelte';

	type FileContextMenuEvents = {
		open: { item: FsItem };
		addBookmark: { item: FsItem };
		cut: { item: FsItem };
		copy: { item: FsItem };
		paste: { item: FsItem };
		delete: { item: FsItem };
		rename: { item: FsItem };
		openInExplorer: { item: FsItem };
		openWithExternal: { item: FsItem };
		reloadThumbnail: { item: FsItem };
	};

	const dispatch = createEventDispatcher<FileContextMenuEvents>();

	let { item, canPaste = false }: { item: FsItem; canPaste?: boolean } = $props();

	function emit<T extends keyof FileContextMenuEvents>(type: T) {
		dispatch(type, { item } as FileContextMenuEvents[T]);
	}
</script>

<ContextMenuItem on:click={() => emit('open')}>
	<Folder class="mr-2 h-4 w-4" />
	<span>打开</span>
</ContextMenuItem>

<ContextMenuSeparator />

<ContextMenuItem on:click={() => emit('addBookmark')}>
	<Bookmark class="mr-2 h-4 w-4" />
	<span>添加到书签</span>
</ContextMenuItem>

<ContextMenuItemRow>
	<ContextMenuItemIcon label="剪切" on:click={() => emit('cut')}>
		<Scissors />
	</ContextMenuItemIcon>
	<ContextMenuItemIcon label="复制" on:click={() => emit('copy')}>
		<CopyIcon />
	</ContextMenuItemIcon>
	<ContextMenuItemIcon disabled={!canPaste} label="粘贴" on:click={() => emit('paste')}>
		<ClipboardPaste />
	</ContextMenuItemIcon>
	<ContextMenuItemIcon variant="destructive" label="删除" on:click={() => emit('delete')}>
		<Trash2 />
	</ContextMenuItemIcon>
	<ContextMenuItemIcon label="重命名" on:click={() => emit('rename')}>
		<Pencil />
	</ContextMenuItemIcon>
</ContextMenuItemRow>

<ContextMenuSeparator />

<ContextMenuItem on:click={() => emit('openInExplorer')}>
	<ExternalLink class="mr-2 h-4 w-4" />
	<span>在资源管理器中打开</span>
</ContextMenuItem>

<ContextMenuItem on:click={() => emit('openWithExternal')}>
	<ExternalLink class="mr-2 h-4 w-4" />
	<span>在外部应用中打开</span>
</ContextMenuItem>

<ContextMenuSeparator />

<ContextMenuItem on:click={() => emit('reloadThumbnail')}>
	<RefreshCw class="mr-2 h-4 w-4" />
	<span>重载缩略图</span>
</ContextMenuItem>
