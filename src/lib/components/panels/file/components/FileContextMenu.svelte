<script lang="ts">
  import * as ContextMenu from '$lib/components/ui/context-menu';
  import { Bookmark, FolderOpen, Folder, Trash2 } from '@lucide/svelte';
  import type { FsItem } from '$lib/types';

  interface Props {
    item: FsItem;
    isArchiveView?: boolean;
    onAddBookmark: (item: FsItem) => void;
    onOpenInExplorer: (item: FsItem) => void;
    onOpenWithExternalApp: (item: FsItem) => void;
    onCutItem: (item: FsItem) => void;
    onCopyItem: (item: FsItem) => void;
    onDeleteItem: (item: FsItem) => void;
    onMoveToFolder: (item: FsItem) => void;
    onRenameItem: (item: FsItem) => void;
    onOpenArchiveAsBook: (item: FsItem) => void;
    onBrowseArchive: (item: FsItem) => void;
    onCopyPath: (item: FsItem) => void;
  }

  let {
    item,
    isArchiveView = false,
    onAddBookmark = () => {},
    onOpenInExplorer = () => {},
    onOpenWithExternalApp = () => {},
    onCutItem = () => {},
    onCopyItem = () => {},
    onDeleteItem = () => {},
    onMoveToFolder = () => {},
    onRenameItem = () => {},
    onOpenArchiveAsBook = () => {},
    onBrowseArchive = () => {},
    onCopyPath = () => {}
  }: Props = $props();
</script>

<ContextMenu.Content>
  <ContextMenu.Item onclick={() => onAddBookmark(item)}>
    <Bookmark class="h-4 w-4 mr-2" />
    添加到书签
  </ContextMenu.Item>
  <ContextMenu.Separator />
  <ContextMenu.Item onclick={() => onOpenInExplorer(item)}>
    <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
    在资源管理器中打开
  </ContextMenu.Item>
  <ContextMenu.Item onclick={() => onOpenWithExternalApp(item)}>
    <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
    在外部应用中打开
  </ContextMenu.Item>
  <ContextMenu.Separator />
  <ContextMenu.Item onclick={() => onCutItem(item)}>
    <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
    </svg>
    剪切
  </ContextMenu.Item>
  <ContextMenu.Item onclick={() => onCopyItem(item)}>
    <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
    复制
  </ContextMenu.Item>
  <ContextMenu.Separator />
  <ContextMenu.Item onclick={() => onDeleteItem(item)} class="text-red-600 focus:text-red-600">
    <Trash2 class="h-4 w-4 mr-2" />
    删除
  </ContextMenu.Item>
  <ContextMenu.Item onclick={() => onMoveToFolder(item)}>
    <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
    </svg>
    移动到文件夹(E)
  </ContextMenu.Item>
  <ContextMenu.Item onclick={() => onRenameItem(item)}>
    <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
    重命名(M)
  </ContextMenu.Item>
  {#if item.name.toLowerCase().endsWith('.zip') || item.name.toLowerCase().endsWith('.cbz') || item.name.toLowerCase().endsWith('.rar') || item.name.toLowerCase().endsWith('.cbr')}
    <ContextMenu.Separator />
    <ContextMenu.Item onclick={() => onOpenArchiveAsBook(item)}>
      <FolderOpen class="h-4 w-4 mr-2" />
      作为书籍打开
    </ContextMenu.Item>
    <ContextMenu.Item onclick={() => onBrowseArchive(item)}>
      <Folder class="h-4 w-4 mr-2" />
      浏览内容
    </ContextMenu.Item>
  {/if}
  <ContextMenu.Separator />
  <ContextMenu.Item onclick={() => onCopyPath(item)}>
    <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
    复制路径
  </ContextMenu.Item>
</ContextMenu.Content>
