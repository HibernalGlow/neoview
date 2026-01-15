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
		RefreshCw,
		BookOpen,
		FolderOpen,
		Play,
		Undo2
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
		undoDelete: { item: FsItem };
	};

	const dispatch = createEventDispatcher<FileContextMenuEvents>();

	let { item, canPaste = false }: { item: FsItem; canPaste?: boolean } = $props();

	function emit<T extends keyof FileContextMenuEvents>(type: T) {
		dispatch(type, { item } as FileContextMenuEvents[T]);
	}
</script>

<ContextMenuItemRow>
	<ContextMenuItemIcon label="剪切" onclick={() => emit('cut')}>
		<Scissors />
	</ContextMenuItemIcon>
	<ContextMenuItemIcon label="复制" onclick={() => emit('copy')}>
		<CopyIcon />
	</ContextMenuItemIcon>
	<ContextMenuItemIcon disabled={!canPaste} label="粘贴" onclick={() => emit('paste')}>
		<ClipboardPaste />
	</ContextMenuItemIcon>
	<ContextMenuItemIcon variant="destructive" label="删除" onclick={() => emit('delete')}>
		<Trash2 />
	</ContextMenuItemIcon>
	<ContextMenuItemIcon label="重命名" onclick={() => emit('rename')}>
		<Pencil />
	</ContextMenuItemIcon>
</ContextMenuItemRow>

<ContextMenuItemRow>
	<ContextMenuItemIcon label="打开" onclick={() => emit('open')}>
		<BookOpen />
	</ContextMenuItemIcon>
	<ContextMenuItemIcon label="在资源管理器中打开" onclick={() => emit('openInExplorer')}>
		<FolderOpen />
	</ContextMenuItemIcon>
	<ContextMenuItemIcon label="在外部应用中打开" onclick={() => emit('openWithExternal')}>
		<Play />
	</ContextMenuItemIcon>
	<ContextMenuItemIcon label="撤回上一次删除" onclick={() => emit('undoDelete')}>
		<Undo2 />
	</ContextMenuItemIcon>
</ContextMenuItemRow>

<ContextMenuSeparator />

<ContextMenuItem onclick={() => emit('addBookmark')}>
	<Bookmark class="mr-2 h-4 w-4" />
	<span>添加到书签</span>
</ContextMenuItem>

<ContextMenuSeparator />

<ContextMenuItem onclick={() => emit('reloadThumbnail')}>
	<RefreshCw class="mr-2 h-4 w-4" />
	<span>重载缩略图</span>
</ContextMenuItem>
