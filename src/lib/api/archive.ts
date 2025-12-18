import { invoke } from '$lib/api/adapter';

export async function getArchiveFirstImageBlob(path: string): Promise<string> {
  return await invoke<string>('get_archive_first_image_blob', { archivePath: path });
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

export async function deleteArchiveEntry(archivePath: string, innerPath: string): Promise<void> {
  await invoke('delete_archive_entry', { archivePath, innerPath });
}
