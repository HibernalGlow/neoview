<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { FsItem } from '$lib/types';
	import {
		ContextMenuItem,
		ContextMenuSeparator
	} from '$lib/components/ui/context-menu';
	import {
		Folder,
		Bookmark,
		Trash2,
		ExternalLink,
		Scissors,
		Copy as CopyIcon,
		ClipboardPaste,
		Pencil
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

<ContextMenuSeparator />

<ContextMenuItem on:click={() => emit('cut')}>
	<Scissors class="mr-2 h-4 w-4" />
	<span>剪切</span>
</ContextMenuItem>

<ContextMenuItem on:click={() => emit('copy')}>
	<CopyIcon class="mr-2 h-4 w-4" />
	<span>复制</span>
</ContextMenuItem>

<ContextMenuItem disabled={!canPaste} on:click={() => emit('paste')}>
	<ClipboardPaste class="mr-2 h-4 w-4" />
	<span>粘贴</span>
</ContextMenuItem>

<ContextMenuSeparator />

<ContextMenuItem variant="destructive" on:click={() => emit('delete')}>
	<Trash2 class="mr-2 h-4 w-4" />
	<span>删除</span>
</ContextMenuItem>

<ContextMenuItem on:click={() => emit('rename')}>
	<Pencil class="mr-2 h-4 w-4" />
	<span>重命名</span>
</ContextMenuItem>

<ContextMenuSeparator />

<ContextMenuItem on:click={() => emit('openInExplorer')}>
	<ExternalLink class="mr-2 h-4 w-4" />
	<span>在资源管理器中打开</span>
</ContextMenuItem>

<ContextMenuItem on:click={() => emit('openWithExternal')}>
	<ExternalLink class="mr-2 h-4 w-4" />
	<span>在外部应用中打开</span>
</ContextMenuItem>
