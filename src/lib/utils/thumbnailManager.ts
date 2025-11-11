import { FileSystemAPI } from '$lib/api';
import { toAssetUrl } from '$lib/utils/assetProxy';

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

// 使用统一的 asset 转换逻辑（定义在 assetProxy）

export function enqueueThumbnail(path: string, isFolder: boolean) {
  if (!path) return;
  // 已在生成中或已有队列则跳过
  if (_generating.has(path)) return;
  if (_queue.findIndex(x => x.path === path) !== -1) return;

  _queue.push({ path, isFolder });
  processQueue();
}

/**
 * 将绝对路径规范化为相对 key（基于本地存储中配置的 thumbnail root），
 * 若未配置 root，则返回以正斜杠为分隔符的原始路径字符串。
 */
export function toRelativeKey(absPath: string): string {
  try {
    const root = typeof localStorage !== 'undefined' ? localStorage.getItem('neoview-thumbnail-root') : null;
    let p = String(absPath || '');
    // 统一反斜杠为正斜杠
    p = p.replace(/\\/g, '/');
    if (root) {
      let r = String(root).replace(/\\/g, '/');
      // 如果 root 没有以斜杠结尾，添加
      if (!r.endsWith('/')) r = r + '/';
      if (p.startsWith(r)) {
        let rel = p.slice(r.length);
        // 去掉开头的斜杠
        if (rel.startsWith('/')) rel = rel.slice(1);
        return rel;
      }
    }
    // 否则返回完整路径的规范化形式（用于不在 root 下的文件）
    if (p.startsWith('/')) p = p.slice(1);
    return p;
  } catch (e) {
    return absPath.replace(/\\/g, '/');
  }
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
          const converted = toAssetUrl(thumbnail) || String(thumbnail || '');
          const key = toRelativeKey(path);
          // 可见日志，确保前端能观察到回调被触发与最终 URL
          console.log('thumbnailManager: addThumbnail callback ->', { key, raw: thumbnail, converted });
          _addThumbnailCb(key, converted);
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
