<script lang="ts">
  import { File, FileArchive, Folder, Image, Trash2 } from '@lucide/svelte';
  import * as ContextMenu from '$lib/components/ui/context-menu';
  import FileContextMenu from './FileContextMenu.svelte';
  import type { FsItem } from '$lib/types';
  import { toRelativeKey } from '$lib/utils/thumbnailManager';

  export type ContextMenuHandlers = {
    addBookmark: (item: FsItem) => void;
    openInExplorer: (item: FsItem) => void;
    openWithExternalApp: (item: FsItem) => void;
    cutItem: (item: FsItem) => void;
    copyItem: (item: FsItem) => void;
    deleteItem: (item: FsItem) => void;
    moveToFolder: (item: FsItem) => void;
    renameItem: (item: FsItem) => void;
    openArchiveAsBook: (item: FsItem) => void;
    browseArchive: (item: FsItem) => void;
    copyPath: (item: FsItem) => void;
  };

  export let items: FsItem[] = [];
  export let listLabel = '文件列表';
  export let isSearchResults = false;
  export let isCheckMode = false;
  export let isDeleteMode = false;
  export let isArchiveView = false;
  export let selectedIndex = -1;
  export let selectedItems: Set<string> = new Set();
  export let thumbnails: Map<string, string> = new Map();
  export let containerRef: HTMLDivElement | undefined;
  export let onKeydown: (event: KeyboardEvent) => void = () => {};
  export let onRowClick: (item: FsItem, index: number) => void = () => {};
  export let onRowKeyboardActivate: (item: FsItem, index: number) => void = () => {};
  export let onToggleSelection: (path: string) => void = () => {};
  export let onInlineDelete: (item: FsItem) => void = () => {};
  export let contextMenuHandlers: ContextMenuHandlers = {
    addBookmark: () => {},
    openInExplorer: () => {},
    openWithExternalApp: () => {},
    cutItem: () => {},
    copyItem: () => {},
    deleteItem: () => {},
    moveToFolder: () => {},
    renameItem: () => {},
    openArchiveAsBook: () => {},
    browseArchive: () => {},
    copyPath: () => {},
  };

  const formatPathInfo = (item: FsItem) => {
    if (isSearchResults) {
      return item.path;
    }
    const size = item.size ? `${item.size}` : '';
    return item.isDir ? '文件夹' : size;
  };
</script>

<div
  bind:this={containerRef}
  class="flex-1 overflow-y-auto p-2 focus:outline-none"
  role="listbox"
  aria-label={listLabel}
  tabindex="0"
  onkeydown={onKeydown}
>
  <slot name="header" />
  <div class="grid grid-cols-1 gap-2">
    {#each items as item, index (item.path)}
      <ContextMenu.Root>
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
          onAddBookmark={contextMenuHandlers.addBookmark}
          onOpenInExplorer={contextMenuHandlers.openInExplorer}
          onOpenWithExternalApp={contextMenuHandlers.openWithExternalApp}
          onCutItem={contextMenuHandlers.cutItem}
          onCopyItem={contextMenuHandlers.copyItem}
          onDeleteItem={contextMenuHandlers.deleteItem}
          onMoveToFolder={contextMenuHandlers.moveToFolder}
          onRenameItem={contextMenuHandlers.renameItem}
          onOpenArchiveAsBook={contextMenuHandlers.openArchiveAsBook}
          onBrowseArchive={contextMenuHandlers.browseArchive}
          onCopyPath={contextMenuHandlers.copyPath}
        />
      </ContextMenu.Root>
    {/each}
  </div>
</div>
