import { FileSystemAPI } from '$lib/api';
import * as BookAPI from '$lib/api/book';
import type { FsItem } from '$lib/types';
import { NavigationHistory } from '$lib/utils/navigationHistory';

export const navigationHistory = new NavigationHistory();

export interface SearchOptions {
  includeSubfolders?: boolean;
  maxResults?: number;
}

function normalizeFsItem(raw: any): FsItem {
  return {
    name: raw?.name ?? '',
    path: raw?.path ?? '',
    isDir: Boolean(raw?.isDir ?? raw?.is_dir ?? raw?.is_directory),
    isImage: Boolean(raw?.isImage ?? raw?.is_image),
    size: Number(raw?.size ?? 0),
    modified: typeof raw?.modified === 'number'
      ? raw.modified
      : typeof raw?.modified_time === 'number'
        ? raw.modified_time
        : undefined,
  };
}

function normalizeFsItems(rawItems: any[] = []): FsItem[] {
  return rawItems.map(normalizeFsItem);
}

export const fileBrowserService = {
  async browseDirectory(path: string): Promise<FsItem[]> {
    const items = await FileSystemAPI.browseDirectory(path);
    return normalizeFsItems(items);
  },

  async listArchiveContents(path: string): Promise<FsItem[]> {
    const items = await FileSystemAPI.listArchiveContents(path);
    return normalizeFsItems(items);
  },

  async searchFiles(path: string, query: string, options: SearchOptions): Promise<FsItem[]> {
    const items = await FileSystemAPI.searchFiles(path, query, options);
    return normalizeFsItems(items);
  },

  async selectFolder(): Promise<string | null> {
    return await FileSystemAPI.selectFolder();
  },

  async isSupportedArchive(path: string): Promise<boolean> {
    return await FileSystemAPI.isSupportedArchive(path);
  },

  async loadImageFromArchive(archivePath: string, filePath: string): Promise<string> {
    return await FileSystemAPI.loadImageFromArchive(archivePath, filePath);
  },

  async generateThumbnailFromData(imageData: string): Promise<string> {
    return await FileSystemAPI.generateThumbnailFromData(imageData);
  },

  async moveToTrash(path: string): Promise<void> {
    await FileSystemAPI.moveToTrash(path);
  },

  async clearThumbnailCache(): Promise<number> {
    return await FileSystemAPI.clearThumbnailCache();
  },

  async showInFileManager(path: string): Promise<void> {
    await FileSystemAPI.showInFileManager(path);
  },

  async openWithSystem(path: string): Promise<void> {
    await FileSystemAPI.openWithSystem(path);
  },

  async movePath(from: string, to: string): Promise<void> {
    await FileSystemAPI.movePath(from, to);
  },

  async copyPath(from: string, to: string): Promise<void> {
    await FileSystemAPI.copyPath(from, to);
  },

  async renamePath(from: string, to: string): Promise<void> {
    await FileSystemAPI.renamePath(from, to);
  },

  async navigateToImage(path: string): Promise<void> {
    await BookAPI.navigateToImage(path);
  },
};
