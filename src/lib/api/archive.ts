import { invoke } from '@tauri-apps/api/tauri';

export async function getArchiveFirstImageBlob(path: string): Promise<string> {
  return await invoke<string>('get_archive_first_image_blob', { path });
}

export async function enqueueArchivePreload(path: string): Promise<string> {
  return await invoke<string>('enqueue_archive_preload', { path });
}

export async function generateArchiveThumbnailAsync(path: string): Promise<string> {
  return await invoke<string>('generate_archive_thumbnail_async', { path });
}

export async function setForegroundSource(sourceId: string): Promise<void> {
  return await invoke<void>('set_foreground_source', { sourceId });
}