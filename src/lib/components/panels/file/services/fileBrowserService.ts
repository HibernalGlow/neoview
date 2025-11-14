import { FileSystemAPI } from '$lib/api';
import * as BookAPI from '$lib/api/book';
import type { FsItem } from '$lib/types';
import { NavigationHistory } from '$lib/utils/navigationHistory';

export const navigationHistory = new NavigationHistory();

export interface SearchOptions {
  includeSubfolders?: boolean;
  maxResults?: number;
}

export const fileBrowserService = {
  async browseDirectory(path: string): Promise<FsItem[]> {
    return await FileSystemAPI.browseDirectory(path);
  },

  async listArchiveContents(path: string): Promise<FsItem[]> {
    return await FileSystemAPI.listArchiveContents(path);
  },

  async searchFiles(path: string, query: string, options: SearchOptions) {
    return await FileSystemAPI.searchFiles(path, query, options);
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

  async openArchiveImage(filePath: string) {
    await BookAPI.navigateToImage(filePath);
  },
};
