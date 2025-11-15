import { FileSystemAPI } from '$lib/api';
import { toAssetUrl } from '$lib/utils/assetProxy';

type Job = { path: string; isFolder: boolean; isArchive?: boolean; isArchiveRoot?: boolean };

let _queue: Job[] = [];
// 将_generating 从 Set 改为 Map，记录每个正在生成的 path 对应的 epoch
// 这样在切换目录（epoch 变化）时，旧 epoch 的进行中任务不会阻塞新 epoch 的任务启动
let _generating: Map<string, {epoch: number, isArchive: boolean, sourcePath?: string}> = new Map();
// epoch 用于在清空队列时使已有任务的回调失效（避免切换目录后旧任务填充新目录）
let _epoch = 0;
// 当前活跃的路径，用于过滤旧任务
let _activePath: string | null = null;
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

export function setActivePath(path: string | null) {
  _activePath = path;
  // 清理不匹配活跃路径的进行中任务
  for (const [taskPath, info] of _generating.entries()) {
    if (info.sourcePath && info.sourcePath !== path) {
      _generating.delete(taskPath);
    }
  }
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
  const generating = _generating.get(path);
  if (generating && generating.epoch === _epoch) return;
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
  const generating = _generating.get(path);
  if (generating && generating.epoch === _epoch) return;
  if (_queue.findIndex(x => x.path === path) !== -1) return;

  _queue.push({ path, isFolder: false, isArchive: true, isArchiveRoot: isRoot });
  processQueue();
}

async function processQueue() {
  // 分别计算本地文件和压缩包的进行中任务数量（每次循环都重新计算）
 const currentGenerating = Array.from(_generating.entries());
  const generatingLocalForEpoch = currentGenerating.filter(([, info]) => 
    info.epoch === _epoch && !info.isArchive
  ).length;
  const generatingArchiveForEpoch = currentGenerating.filter(([, info]) => 
    info.epoch === _epoch && info.isArchive
  ).length;
  
  console.log('📊 processQueue stats:', {
    totalInQueue: _queue.length,
    generatingLocal: generatingLocalForEpoch,
    generatingArchive: generatingArchiveForEpoch,
    maxLocal: _maxConcurrentLocal,
    maxArchive: _maxConcurrentArchive
  });
  
  while (_queue.length > 0) {
    const job = _queue.shift();
    if (!job) break;
    
    // 根据任务类型检查并发限制
    const currentGenerating = job.isArchive ? generatingArchiveForEpoch : generatingLocalForEpoch;
    const maxConcurrent = job.isArchive ? _maxConcurrentArchive : _maxConcurrentLocal;
    
    if (currentGenerating >= maxConcurrent) {
      // 重新放回队列开头
      _queue.unshift(job);
      console.log(`⏸️ 并发限制达到: ${job.isArchive ? 'Archive' : 'Local'} ${currentGenerating}/${maxConcurrent}`);
      break;
    }
    
    const { path, isFolder, isArchive, isArchiveRoot } = job;
    const generating = _generating.get(path);
    if (generating && generating.epoch === _epoch) continue;

    const jobEpoch = _epoch;
    const sourcePath = _activePath;
    _generating.set(path, { epoch: jobEpoch, isArchive: !!isArchive, sourcePath });
    console.log(`🚀 开始任务: ${path} (${isArchive ? 'Archive' : 'Local'}) [source: ${sourcePath}]`);

    (async () => {
      try {
        let thumbnail: string | null = null;
        
        if (isArchive) {
          // 优化后的压缩包缩略图生成
          if (isArchiveRoot) {
            // 生成压缩包根缩略图（文件夹Tab使用）
            console.log('📦 生成压缩包根缩略图:', path);
            thumbnail = await FileSystemAPI.generateArchiveThumbnailRoot(path);
          } else {
            // 生成压缩包内特定页缩略图（阅读器使用）
            // 先获取压缩包内容列表
            const entries = await FileSystemAPI.listArchiveContents(path);
            const firstImage = (entries || []).find((e: any) => e && (e.is_image === true || e.isImage === true));
            if (firstImage) {
              console.log('📦 生成压缩包内页缩略图:', path, '::', firstImage.path);
              thumbnail = await FileSystemAPI.generateArchiveThumbnailInner(path, firstImage.path);
            }
          }
        } else if (isFolder) {
          console.log('📁 生成文件夹缩略图:', path);
          thumbnail = await FileSystemAPI.generateFolderThumbnail(path);
        } else {
          console.log('🖼️ 生成文件缩略图:', path);
          thumbnail = await FileSystemAPI.generateFileThumbnail(path);
        }

        // 在调用回调之前检查任务 epoch 和 sourcePath 是否仍然有效
        const isActivePath = !sourcePath || sourcePath === _activePath;
        if (thumbnail && _addThumbnailCb && jobEpoch === _epoch && isActivePath) {
          const converted = toAssetUrl(thumbnail) || String(thumbnail || '');
          const key = toRelativeKey(path);
          console.log('✅ 缩略图生成成功:', { key, raw: thumbnail, converted, sourcePath });
          _addThumbnailCb(key, converted);
        } else if (thumbnail && (jobEpoch !== _epoch || !isActivePath)) {
          console.log('⏰ 任务结果已过期:', { 
            path, 
            jobEpoch, 
            current: _epoch, 
            sourcePath, 
            activePath: _activePath 
          });
        }
      } catch (e) {
        console.error('❌ 缩略图生成失败:', path, e);
      } finally {
        _generating.delete(path);
        console.log('✅ 任务完成:', path);
        setTimeout(() => processQueue(), 0);
      }
    })();
  }
}

export function clearQueue() {
  // 清空未开始的队列并递增 epoch，使当前进行中的任务在完成后失效
  _queue = [];
  _epoch += 1;
  // 重置活跃路径
  _activePath = null;
}

export function setMaxConcurrent(local?: number, archive?: number) {
  if (typeof local === 'number') _maxConcurrentLocal = local;
  if (typeof archive === 'number') _maxConcurrentArchive = archive;
}

export function isGenerating(path: string) {
  const generating = _generating.get(path);
  return generating && generating.epoch === _epoch;
}

// 获取当前任务统计信息（用于调试）
export function getQueueStats() {
  const currentGenerating = Array.from(_generating.entries());
  const generatingLocal = currentGenerating.filter(([, info]) => 
    info.epoch === _epoch && !info.isArchive
  ).length;
  const generatingArchive = currentGenerating.filter(([, info]) => 
    info.epoch === _epoch && info.isArchive
  ).length;
  
  return {
    queueLength: _queue.length,
    generatingLocal,
    generatingArchive,
    maxLocal: _maxConcurrentLocal,
    maxArchive: _maxConcurrentArchive,
    epoch: _epoch
  };
}
