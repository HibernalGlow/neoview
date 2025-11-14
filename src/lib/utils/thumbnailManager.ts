import { FileSystemAPI } from '$lib/api';
import { toAssetUrl } from '$lib/utils/assetProxy';

type Job = { path: string; isFolder: boolean; isArchive?: boolean; isArchiveRoot?: boolean };

let _queue: Job[] = [];
// 将_generating 从 Set 改为 Map，记录每个正在生成的 path 对应的 epoch
// 这样在切换目录（epoch 变化）时，旧 epoch 的进行中任务不会阻塞新 epoch 的任务启动
let _generating: Map<string, number> = new Map();
// epoch 用于在清空队列时使已有任务的回调失效（避免切换目录后旧任务填充新目录）
let _epoch = 0;
// 区分本地文件和压缩包的并发数
let _maxConcurrentLocal = 4;
let _maxConcurrentArchive = 2;
let _addThumbnailCb: ((path: string, url: string) => void) | null = null;

export function configureThumbnailManager(options: { addThumbnail?: (path: string, url: string) => void; maxConcurrent?: number; maxConcurrentLocal?: number; maxConcurrentArchive?: number }) {
  if (options.addThumbnail) _addThumbnailCb = options.addThumbnail;
  if (typeof options.maxConcurrent === 'number') {
    _maxConcurrentLocal = options.maxConcurrent;
    _maxConcurrentArchive = Math.floor(options.maxConcurrent / 2);
  }
  if (typeof options.maxConcurrentLocal === 'number') _maxConcurrentLocal = options.maxConcurrentLocal;
  if (typeof options.maxConcurrentArchive === 'number') _maxConcurrentArchive = options.maxConcurrentArchive;
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
  // 已在生成中或已有队列则跳过（仅考虑当前 epoch 的生成状态）
  if (_generating.get(path) === _epoch) return;
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

export function enqueueArchiveThumbnail(path: string, isRoot: boolean = true) {
  if (!path) return;
  if (_generating.get(path) === _epoch) return;
  if (_queue.findIndex(x => x.path === path) !== -1) return;

  _queue.push({ path, isFolder: false, isArchive: true, isArchiveRoot: isRoot });
  processQueue();
}

async function processQueue() {
  // 分别计算本地文件和压缩包的进行中任务数量
  const generatingLocalForEpoch = Array.from(_generating.entries())
    .filter(([path, epoch]) => epoch === _epoch && !_queue.find(x => x.path === path && x.isArchive))
    .length;
  const generatingArchiveForEpoch = Array.from(_generating.entries())
    .filter(([path, epoch]) => epoch === _epoch && _queue.find(x => x.path === path && x.isArchive))
    .length;
  
  while (_queue.length > 0) {
    const job = _queue.shift();
    if (!job) break;
    
    // 根据任务类型检查并发限制
    const currentGenerating = job.isArchive ? generatingArchiveForEpoch : generatingLocalForEpoch;
    const maxConcurrent = job.isArchive ? _maxConcurrentArchive : _maxConcurrentLocal;
    
    if (currentGenerating >= maxConcurrent) {
      // 重新放回队列开头
      _queue.unshift(job);
      break;
    }
    
    const { path, isFolder, isArchive, isArchiveRoot } = job;
    if (_generating.get(path) === _epoch) continue;

    const jobEpoch = _epoch;
    _generating.set(path, jobEpoch);

    (async () => {
      try {
        let thumbnail: string | null = null;
        
        if (isArchive) {
          // 优化后的压缩包缩略图生成
          if (isArchiveRoot) {
            // 生成压缩包根缩略图（文件夹Tab使用）
            thumbnail = await FileSystemAPI.generateArchiveThumbnailRoot(path);
          } else {
            // 生成压缩包内特定页缩略图（阅读器使用）
            // 先获取压缩包内容列表
            const entries = await FileSystemAPI.listArchiveContents(path);
            const firstImage = (entries || []).find((e: any) => e && (e.is_image === true || e.isImage === true));
            if (firstImage) {
              thumbnail = await FileSystemAPI.generateArchiveThumbnailInner(path, firstImage.path);
            }
          }
        } else if (isFolder) {
          thumbnail = await FileSystemAPI.generateFolderThumbnail(path);
        } else {
          thumbnail = await FileSystemAPI.generateFileThumbnail(path);
        }

        // 在调用回调之前检查任务 epoch 是否仍然有效
        if (thumbnail && _addThumbnailCb && jobEpoch === _epoch) {
          const converted = toAssetUrl(thumbnail) || String(thumbnail || '');
          const key = toRelativeKey(path);
          console.log('thumbnailManager: addThumbnail callback ->', { key, raw: thumbnail, converted });
          _addThumbnailCb(key, converted);
        } else if (thumbnail && jobEpoch !== _epoch) {
          console.log('thumbnailManager: job result ignored due to epoch mismatch', { path, jobEpoch, current: _epoch });
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
  // 清空未开始的队列并递增 epoch，使当前进行中的任务在完成后失效
  _queue = [];
  _epoch += 1;
}

export function setMaxConcurrent(local?: number, archive?: number) {
  if (typeof local === 'number') _maxConcurrentLocal = local;
  if (typeof archive === 'number') _maxConcurrentArchive = archive;
}

export function isGenerating(path: string) {
  return _generating.get(path) === _epoch;
}
