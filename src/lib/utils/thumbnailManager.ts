import { FileSystemAPI } from '$lib/api';
import { toAssetUrl } from '$lib/utils/assetProxy';

type Job = { path: string; isFolder: boolean; isArchive?: boolean };

let _queue: Job[] = [];
// 将_generating 从 Set 改为 Map，记录每个正在生成的 path 对应的 epoch
// 这样在切换目录（epoch 变化）时，旧 epoch 的进行中任务不会阻塞新 epoch 的任务启动
let _generating: Map<string, number> = new Map();
// epoch 用于在清空队列时使已有任务的回调失效（避免切换目录后旧任务填充新目录）
let _epoch = 0;
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

export function enqueueArchiveThumbnail(path: string) {
  if (!path) return;
  if (_generating.get(path) === _epoch) return;
  if (_queue.findIndex(x => x.path === path) !== -1) return;

  _queue.push({ path, isFolder: false, isArchive: true });
  processQueue();
}

async function processQueue() {
  // 计算当前 epoch 下正在进行的任务数量
  const generatingCountForEpoch = Array.from(_generating.values()).filter(v => v === _epoch).length;
  while (generatingCountForEpoch < _maxConcurrent && _queue.length > 0) {
    // Recompute generating count at loop top in case it changed
    const currentGenerating = Array.from(_generating.values()).filter(v => v === _epoch).length;
    if (currentGenerating >= _maxConcurrent) break;

    const job = _queue.shift();
    if (!job) break;
    const { path, isFolder } = job;
    if (_generating.get(path) === _epoch) continue;

    const jobEpoch = _epoch; // 捕获当前 epoch，任务完成时用于判断是否仍然有效
    _generating.set(path, jobEpoch);

    (async () => {
      try {
        let thumbnail: string | null = null;
        if (job.isArchive) {
          // 对于压缩包：提取 archive 内对应序号的图片并生成本地缩略图文件，然后使用 toAssetUrl 转换为前端可用 URL
          try {
            // 这里假设 path 是 archive 的绝对路径（与 enqueueArchiveThumbnail 时保持一致），
            // 使用 toRelativeKey 或其它机制来传递页索引并触发提取。简化实现：
            const idx = 0; // 默认提取首图；更高级的策略可传递索引到队列
            const paths = await FileSystemAPI.extractArchiveImages(path, idx, 1);
            if (paths && paths.length > 0) {
              const local = paths[0];
              const thumbPath = await FileSystemAPI.generateThumbForExtracted(local);
              thumbnail = toAssetUrl(thumbPath) || thumbPath;
            }
          } catch (e) {
            console.debug('thumbnailManager: archive thumbnail generation failed for', path, e);
          }
        } else if (isFolder) {
          thumbnail = await FileSystemAPI.generateFolderThumbnail(path);
        } else {
          thumbnail = await FileSystemAPI.generateFileThumbnail(path);
        }

        // 在调用回调之前检查任务 epoch 是否仍然有效（切换目录会递增 epoch，使旧任务失效）
        if (thumbnail && _addThumbnailCb && jobEpoch === _epoch) {
          const converted = toAssetUrl(thumbnail) || String(thumbnail || '');
          const key = toRelativeKey(path);
          // 可见日志，确保前端能观察到回调被触发与最终 URL
          console.log('thumbnailManager: addThumbnail callback ->', { key, raw: thumbnail, converted });
          _addThumbnailCb(key, converted);
        } else if (thumbnail && jobEpoch !== _epoch) {
          // 任务已过期（例如切换目录），忽略结果并记录日志以便调试
          console.log('thumbnailManager: job result ignored due to epoch mismatch', { path, jobEpoch, current: _epoch });
        }
        } catch (e) {
          console.debug('thumbnailManager: failed to generate thumbnail for', path, e);
        } finally {
          // 仅删除 map 条目（不论 epoch）以释放占位
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

export function setMaxConcurrent(n: number) {
  _maxConcurrent = n;
}

export function isGenerating(path: string) {
  return _generating.get(path) === _epoch;
}
