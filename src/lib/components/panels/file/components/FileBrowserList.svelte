<script lang="ts">
  import { File, FileArchive, Folder, Image, Trash2 } from '@lucide/svelte';
  import * as ContextMenu from '$lib/components/ui/context-menu/index.js';
  import FileContextMenu from './FileContextMenu.svelte';
  import type { FsItem } from '$lib/types';
  import { toRelativeKey } from '$lib/utils/thumbnailManager';

  import {
    addBookmarkAction,
    openInExplorerAction,
    openWithExternalAppAction,
    deleteItemAction,
    moveItemToFolderAction,
    renameItemAction,
    openArchiveAsBookAction,
    copyPathAction,
  } from '../services/fileActionService';
  import { setClipboardItem } from '../services/contextMenuService';

  type Props = {
    items?: FsItem[];
    listLabel?: string;
    isSearchResults?: boolean;
    isCheckMode?: boolean;
    isDeleteMode?: boolean;
    isArchiveView?: boolean;
    selectedIndex?: number;
    selectedItems?: Set<string>;
    thumbnails?: Map<string, string>;
    containerRef?: HTMLDivElement;
    onKeydown?: (event: KeyboardEvent) => void;
    onRowClick?: (item: FsItem, index: number) => void;
    onRowKeyboardActivate?: (item: FsItem, index: number) => void;
    onToggleSelection?: (path: string) => void;
    onInlineDelete?: (item: FsItem) => void;
    onContextMenuOpen?: (event: MouseEvent, item: FsItem) => void;
    onContextMenuClose?: () => void;
    header?: Snippet;
  };

  let {
    items = [],
    listLabel = '文件列表',
    isSearchResults = false,
    isCheckMode = false,
    isDeleteMode = false,
    isArchiveView = false,
    selectedIndex = -1,
    selectedItems = new Set<string>(),
    thumbnails = new Map<string, string>(),
    containerRef,
    onKeydown = () => {},
    onRowClick = () => {},
    onRowKeyboardActivate = () => {},
    onToggleSelection = () => {},
    onInlineDelete = () => {},
    onContextMenuOpen = () => {},
    onContextMenuClose = () => {},
    header,
  }: Props = $props();

  const formatPathInfo = (item: FsItem) => {
    if (isSearchResults) {
      return item.path;
    }
    const size = item.size ? `${item.size}` : '';
    return item.isDir ? '文件夹' : size;
  };

  function handleContextMenu(event: MouseEvent, item: FsItem) {
    onContextMenuOpen(event, item);
  }

  async function handleDelete(item: FsItem) {
    const success = await deleteItemAction(item);
    if (success) {
      onInlineDelete(item);
    }
  }

  async function handleMove(item: FsItem) {
    await moveItemToFolderAction(item);
  }

  async function handleRename(item: FsItem) {
    await renameItemAction(item);
  }
</script>

<div
  bind:this={containerRef}
  class="flex-1 overflow-y-auto p-2 focus:outline-none"
  role="listbox"
  aria-label={listLabel}
  tabindex="0"
  onkeydown={onKeydown}
>
  {@render header?.()}
  <div class="grid grid-cols-1 gap-2">
    {#each items as item, index (item.path)}
      <ContextMenu.Root onOpenChange={(open) => open && onContextMenuOpen(lastContextMenuEvent, item)} onClose={onContextMenuClose}>
        <ContextMenu.Trigger asChild>
          <div
            class={`group flex items-center gap-3 rounded border p-2 cursor-pointer transition-colors ${!isSearchResults && selectedIndex === index ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50 border-gray-200'}`}
            role={isSearchResults ? 'button' : 'option'}
            aria-selected={isSearchResults ? undefined : selectedIndex === index}
            tabindex="0"
            onclick={() => onRowClick(item, index)}
            onkeydown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onRowKeyboardActivate(item, index);
              }
            }}
            oncontextmenu={(event) => handleContextMenu(event, item)}
          >
            {#if isCheckMode}
              <button
                class="shrink-0"
                onclick={(e) => {
                  e.stopPropagation();
                  onToggleSelection(item.path);
                }}
              >
                <div class={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${selectedItems.has(item.path) ? 'bg-blue-500 border-blue-500' : 'border-gray-300 hover:border-blue-400'}`}>
                  {#if selectedItems.has(item.path)}
                    <svg class="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                    </svg>
                  {/if}
                </div>
              </button>
            {/if}

            {#if isDeleteMode && !isArchiveView}
              <button
                class="shrink-0"
                onclick={(e) => {
                  e.stopPropagation();
                  onInlineDelete(item);
                }}
                title="删除"
              >
                <div class="h-5 w-5 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors">
                  <Trash2 class="h-3 w-3 text-white" />
                </div>
              </button>
            {/if}

            <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded">
              {#if thumbnails.has(toRelativeKey(item.path))}
                <img
                  src={thumbnails.get(toRelativeKey(item.path))}
                  alt={item.name}
                  class="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              {:else if item.isDir}
                <Folder class="h-8 w-8 text-blue-500 transition-colors group-hover:text-blue-600" />
              {:else if item.name.toLowerCase().endsWith('.zip') || item.name.toLowerCase().endsWith('.cbz')}
                <FileArchive class="h-8 w-8 text-purple-500 transition-colors group-hover:text-purple-600" />
              {:else if item.isImage}
                <Image class="h-8 w-8 text-green-500 transition-colors group-hover:text-green-600" />
              {:else}
                <File class="h-8 w-8 text-gray-400 transition-colors group-hover:text-gray-500" />
              {/if}
            </div>

            <div class="min-w-0 flex-1">
              <div class="truncate font-medium">{item.name}</div>
              <div class="text-xs text-gray-500">
                {formatPathInfo(item)}
              </div>
            </div>
          </div>
        </ContextMenu.Trigger>
        <FileContextMenu
          {item}
          {isArchiveView}
          onAddBookmark={(i) => addBookmarkAction(i)}
          onOpenInExplorer={(i) => openInExplorerAction(i)}
          onOpenWithExternalApp={(i) => openWithExternalAppAction(i)}
          onCutItem={(i) => setClipboardItem(i, 'cut')}
          onCopyItem={(i) => setClipboardItem(i, 'copy')}
          onDeleteItem={handleDelete}
          onMoveToFolder={handleMove}
          onRenameItem={handleRename}
          onOpenArchiveAsBook={(i) => openArchiveAsBookAction(i)}
          onBrowseArchive={(i) => openArchiveAsBookAction(i)}
          onCopyPath={(i) => copyPathAction(i)}
        />
      </ContextMenu.Root>
    {/each}
  </div>
</div>
