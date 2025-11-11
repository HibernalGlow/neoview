import { FileSystemAPI } from '$lib/api';
import { convertFileSrc } from '@tauri-apps/api/core';

type Job = { path: string; isFolder: boolean; isArchive?: boolean };

let _queue: Job[] = [];
let _generating: Set<string> = new Set();
let _maxConcurrent = 4;
let _addThumbnailCb: ((path: string, url: string) => void) | null = null;

export function configureThumbnailManager(options: { addThumbnail?: (path: string, url: string) => void; maxConcurrent?: number }) {
  if (options.addThumbnail) _addThumbnailCb = options.addThumbnail;
  if (typeof options.maxConcurrent === 'number') _maxConcurrent = options.maxConcurrent;
}

/** 简单兼容 helper */
export function itemIsDirectory(item: any) {
  return Boolean(item && (item.is_dir === true || item.isDir === true));
}

export function itemIsImage(item: any) {
  return Boolean(item && (item.is_image === true || item.isImage === true || item.is_image === 'true' || item.isImage === 'true'));
}

function toAssetUrl(maybePath: string) {
  if (!maybePath) return maybePath;
  const s = String(maybePath);
  if (s.startsWith('asset://') || s.startsWith('data:') || s.startsWith('http://') || s.startsWith('https://')) return s;

  let cleaned = s.replace(/^file:\/+/i, '');
  if (/^\/[A-Za-z]:/.test(cleaned)) cleaned = cleaned.slice(1);

  try {
    return convertFileSrc(cleaned);
  } catch (e) {
    console.error('thumbnailManager: convertFileSrc failed', e, cleaned);
    return cleaned;
  }
}

export function enqueueThumbnail(path: string, isFolder: boolean) {
  if (!path) return;
  // 已在生成中或已有队列则跳过
  if (_generating.has(path)) return;
  if (_queue.findIndex(x => x.path === path) !== -1) return;

  _queue.push({ path, isFolder });
  processQueue();
}

export function enqueueArchiveThumbnail(path: string) {
  if (!path) return;
  if (_generating.has(path)) return;
  if (_queue.findIndex(x => x.path === path) !== -1) return;

  _queue.push({ path, isFolder: false, isArchive: true });
  processQueue();
}

async function processQueue() {
  while (_generating.size < _maxConcurrent && _queue.length > 0) {
    const job = _queue.shift();
    if (!job) break;
    const { path, isFolder } = job;
    if (_generating.has(path)) continue;

    _generating.add(path);

    (async () => {
      try {
        let thumbnail: string | null = null;
        if (job.isArchive) {
          // 对于压缩包：尝试读取压缩包内第一张图片并生成缩略图
          try {
            const entries = await FileSystemAPI.listArchiveContents(path);
            const firstImage = (entries || []).find((e: any) => e && (e.is_image === true || e.isImage === true));
            if (firstImage) {
              const imageData = await FileSystemAPI.loadImageFromArchive(path, firstImage.path);
              thumbnail = await FileSystemAPI.generateThumbnailFromData(imageData);
            }
          } catch (e) {
            console.debug('thumbnailManager: archive thumbnail generation failed for', path, e);
          }
        } else if (isFolder) {
          thumbnail = await FileSystemAPI.generateFolderThumbnail(path);
        } else {
          thumbnail = await FileSystemAPI.generateFileThumbnail(path);
        }

        if (thumbnail && _addThumbnailCb) {
          const url = toAssetUrl(thumbnail);
          _addThumbnailCb(path, url);
        }
      } catch (e) {
        console.debug('thumbnailManager: failed to generate thumbnail for', path, e);
      } finally {
        _generating.delete(path);
        setTimeout(() => processQueue(), 0);
      }
    })();
  }
}

export function clearQueue() {
  _queue = [];
}

export function setMaxConcurrent(n: number) {
  _maxConcurrent = n;
}

export function isGenerating(path: string) {
  return _generating.has(path);
}
