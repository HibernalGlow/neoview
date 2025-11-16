import { invoke } from '@tauri-apps/api/core';

export async function getArchiveFirstImageBlob(path: string): Promise<string> {
  return await invoke<string>('get_archive_first_image_blob', { path });
}

export async function getBlobContent(blobKey: string): Promise<Uint8Array> {
  const data = await invoke<number[]>('get_blob_content', { blobKey });
  return new Uint8Array(data);
}

export async function releaseBlob(blobKey: string): Promise<boolean> {
  return await invoke<boolean>('release_blob', { blobKey });
}

export async function cleanupExpiredBlobs(): Promise<number> {
  return await invoke<number>('cleanup_expired_blobs');
}

export async function getBlobStats(): Promise<{
  totalEntries: number;
  totalBytes: number;
  expiredCount: number;
  maxEntries: number;
}> {
  return await invoke('get_blob_stats');
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