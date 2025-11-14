import type { FsItem } from '$lib/types';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
import { fileBrowserService } from './fileBrowserService';

export function addBookmarkAction(item: FsItem) {
  bookmarkStore.add(item);
}

export async function openInExplorerAction(item: FsItem) {
  try {
    await fileBrowserService.showInFileManager(item.path);
  } catch (err) {
    fileBrowserStore.setError(String(err));
  }
}

export async function openWithExternalAppAction(item: FsItem) {
  try {
    await fileBrowserService.openWithSystem(item.path);
  } catch (err) {
    fileBrowserStore.setError(String(err));
  }
}

export async function deleteItemAction(item: FsItem): Promise<boolean> {
  if (!confirm(`确定要删除 "${item.name}" 吗？`)) return false;
  try {
    await fileBrowserService.moveToTrash(item.path);
    return true;
  } catch (err) {
    fileBrowserStore.setError(String(err));
    return false;
  }
}

export async function moveItemToFolderAction(item: FsItem): Promise<boolean> {
  try {
    const targetPath = await fileBrowserService.selectFolder();
    if (!targetPath) return false;
    const fileName = item.path.split(/[\\/]/).pop();
    const targetFilePath = `${targetPath}/${fileName}`;
    await fileBrowserService.movePath(item.path, targetFilePath);
    return true;
  } catch (err) {
    fileBrowserStore.setError(String(err));
    return false;
  }
}

export async function renameItemAction(item: FsItem): Promise<boolean> {
  const newName = prompt('请输入新名称:', item.name);
  if (!newName || newName === item.name) return false;
  try {
    const newPath = item.path.replace(item.name, newName);
    await fileBrowserService.renamePath(item.path, newPath);
    return true;
  } catch (err) {
    fileBrowserStore.setError(String(err));
    return false;
  }
}

export async function openArchiveAsBookAction(item: FsItem) {
  try {
    await bookStore.openBook(item.path);
  } catch (err) {
    fileBrowserStore.setError(String(err));
  }
}

export async function copyPathAction(item: FsItem) {
  try {
    await navigator.clipboard.writeText(item.path);
  } catch (err) {
    console.warn('复制路径失败:', err);
  }
}
