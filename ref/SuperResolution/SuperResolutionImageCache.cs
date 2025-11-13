using System;
using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace NeeView.SuperResolution
{
    /// <summary>
    /// 超分辨率图片状态
    /// </summary>
    public enum SuperResolutionImageStatus
    {
        /// <summary>
        /// 未超分
        /// </summary>
        None,
        
        /// <summary>
        /// 超分中
        /// </summary>
        Processing,
        
        /// <summary>
        /// 已超分
        /// </summary>
        Completed,
        
        /// <summary>
        /// 超分失败
        /// </summary>
        Failed
    }

    /// <summary>
    /// 超分辨率图片缓存项
    /// </summary>
    public class SuperResolutionCacheItem
    {
        public string OriginalPath { get; set; } = "";
        public byte[]? OriginalData { get; set; }
        public byte[]? SuperResolutionData { get; set; }
        public SuperResolutionImageStatus Status { get; set; } = SuperResolutionImageStatus.None;
        public string ErrorMessage { get; set; } = "";
        public DateTime LastAccessTime { get; set; } = DateTime.Now;
        public DateTime CreatedTime { get; set; } = DateTime.Now;
        public int OriginalWidth { get; set; }
        public int OriginalHeight { get; set; }
        public int SuperResolutionWidth { get; set; }
        public int SuperResolutionHeight { get; set; }
        public double ProcessingTime { get; set; }

        /// <summary>
        /// 检查缓存是否已过期
        /// </summary>
        public bool IsExpired(TimeSpan maxAge)
        {
            return DateTime.Now - CreatedTime > maxAge;
        }
    }

    /// <summary>
    /// 超分辨率图片缓存管理器
    /// 管理原图和超分图，支持快速切换显示
    /// 混合缓存策略：内存缓存(近期) + 磁盘缓存(长期)
    /// </summary>
    public class SuperResolutionImageCache
    {
        private static readonly Lazy<SuperResolutionImageCache> _instance = new(() => new SuperResolutionImageCache());
        public static SuperResolutionImageCache Current => _instance.Value;

        private readonly ConcurrentDictionary<string, SuperResolutionCacheItem> _memoryCache = new();
        private readonly SemaphoreSlim _cleanupSemaphore = new(1, 1);
        private readonly SuperResolutionDiskCache _diskCache = SuperResolutionDiskCache.Current;
        
        // 内存缓存限制（更保守的设置）
        private const int MaxMemoryCacheSize = 10; // 最多缓存10张图片到内存
        private const int MaxMemoryCacheSizeMB = 100; // 最大缓存100MB到内存
        private static readonly TimeSpan DefaultMemoryCacheMaxAge = TimeSpan.FromHours(2); // 内存缓存2小时过期
        private static readonly TimeSpan DefaultDiskCacheMaxAge = TimeSpan.FromDays(7); // 磁盘缓存7天过期

        private SuperResolutionImageCache()
        {
        }

        /// <summary>
        /// 获取或创建缓存项
        /// </summary>
        public SuperResolutionCacheItem GetOrCreate(string path)
        {
            return _memoryCache.GetOrAdd(path, _ => new SuperResolutionCacheItem
            {
                OriginalPath = path,
                Status = SuperResolutionImageStatus.None,
                LastAccessTime = DateTime.Now,
                CreatedTime = DateTime.Now
            });
        }

        /// <summary>
        /// 获取缓存项(检查过期)，优先从内存加载，内存没有则从磁盘加载
        /// </summary>
        public async Task<SuperResolutionCacheItem?> GetAsync(string path, SuperResolutionConfig config, TimeSpan? maxAge = null)
        {
            // 1. 首先尝试从内存缓存获取
            if (_memoryCache.TryGetValue(path, out var memoryItem))
            {
                // 检查内存缓存是否过期
                var memoryAge = maxAge ?? DefaultMemoryCacheMaxAge;
                if (memoryItem.IsExpired(memoryAge))
                {
                    SuperResolutionLogger.Info($"内存缓存已过期: {path}");
                    _memoryCache.TryRemove(path, out _);
                }
                else
                {
                    memoryItem.LastAccessTime = DateTime.Now;
                    return memoryItem;
                }
            }

            // 2. 内存没有，尝试从磁盘缓存加载
            try
            {
                var diskData = await _diskCache.LoadAsync(path, config, maxAge ?? DefaultDiskCacheMaxAge);
                if (diskData != null)
                {
                    // 从磁盘加载到内存
                    var item = new SuperResolutionCacheItem
                    {
                        OriginalPath = path,
                        SuperResolutionData = diskData,
                        Status = SuperResolutionImageStatus.Completed,
                        LastAccessTime = DateTime.Now,
                        CreatedTime = DateTime.Now,
                        ProcessingTime = 0 // 磁盘缓存不记录处理时间
                    };

                    // 添加到内存缓存
                    _memoryCache.AddOrUpdate(path, item, (key, existing) => item);
                    
                    SuperResolutionLogger.Info($"从磁盘缓存加载到内存: {path}");
                    return item;
                }
            }
            catch (Exception ex)
            {
                SuperResolutionLogger.Error($"从磁盘缓存加载失败: {path}, 错误: {ex.Message}");
            }

            return null;
        }

        /// <summary>
        /// 同步获取缓存项（仅内存缓存，兼容旧代码）
        /// </summary>
        public SuperResolutionCacheItem? Get(string path, TimeSpan? maxAge = null)
        {
            if (_memoryCache.TryGetValue(path, out var item))
            {
                // 检查是否过期
                var age = maxAge ?? DefaultMemoryCacheMaxAge;
                if (item.IsExpired(age))
                {
                    SuperResolutionLogger.Info($"内存缓存已过期: {path} (创建时间: {item.CreatedTime}, 过期时间: {age})");
                    _memoryCache.TryRemove(path, out _);
                    return null;
                }

                item.LastAccessTime = DateTime.Now;
                return item;
            }
            return null;
        }

        /// <summary>
        /// 更新缓存项
        /// </summary>
        public void Update(string path, Action<SuperResolutionCacheItem> updateAction)
        {
            var item = GetOrCreate(path);
            updateAction(item);
            item.LastAccessTime = DateTime.Now;
            
            // 如果是新完成的超分,更新创建时间并保存到磁盘
            if (item.Status == SuperResolutionImageStatus.Completed && item.SuperResolutionData != null)
            {
                item.CreatedTime = DateTime.Now;
                
                // 异步保存到磁盘缓存（需要配置信息）
                // 注意：这里需要传入config参数，但当前接口没有，需要调用方使用UpdateAsync方法
                _ = Task.Run(async () => 
                {
                    try
                    {
                        // 使用默认配置保存到磁盘
                        var defaultConfig = new SuperResolutionConfig();
                        await _diskCache.SaveAsync(
                            path, 
                            defaultConfig, 
                            item.SuperResolutionData,
                            item.OriginalWidth,
                            item.OriginalHeight,
                            item.SuperResolutionWidth,
                            item.SuperResolutionHeight,
                            item.ProcessingTime
                        );
                    }
                    catch (Exception ex)
                    {
                        SuperResolutionLogger.Error($"异步保存到磁盘缓存失败: {ex.Message}");
                    }
                });
            }
        }

        /// <summary>
        /// 异步更新缓存项（支持磁盘缓存）
        /// </summary>
        public async Task UpdateAsync(string path, SuperResolutionConfig config, Action<SuperResolutionCacheItem> updateAction)
        {
            var item = GetOrCreate(path);
            updateAction(item);
            item.LastAccessTime = DateTime.Now;
            
            // 如果是新完成的超分,更新创建时间并保存到磁盘
            if (item.Status == SuperResolutionImageStatus.Completed && item.SuperResolutionData != null)
            {
                item.CreatedTime = DateTime.Now;
                
                // 保存到磁盘缓存
                await _diskCache.SaveAsync(
                    path, 
                    config, 
                    item.SuperResolutionData,
                    item.OriginalWidth,
                    item.OriginalHeight,
                    item.SuperResolutionWidth,
                    item.SuperResolutionHeight,
                    item.ProcessingTime
                );
                
                SuperResolutionLogger.Info($"超分结果已保存到混合缓存: {path}");
            }
        }

        /// <summary>
        /// 移除缓存项
        /// </summary>
        public async Task RemoveAsync(string path)
        {
            // 从内存缓存移除
            _memoryCache.TryRemove(path, out _);
            
            // 从磁盘缓存移除
            try
            {
                // 生成缓存键需要config，这里简单处理
                var cacheKey = path.GetHashCode().ToString("X");
                await _diskCache.RemoveAsync(cacheKey);
            }
            catch (Exception ex)
            {
                SuperResolutionLogger.Error($"从磁盘缓存移除失败: {ex.Message}");
            }
        }

        /// <summary>
        /// 同步移除缓存项（仅内存，兼容旧代码）
        /// </summary>
        public void Remove(string path)
        {
            _memoryCache.TryRemove(path, out _);
            _ = RemoveAsync(path); // 异步清理磁盘缓存
        }

        /// <summary>
        /// 清理内存缓存（异步）
        /// </summary>
        public async Task CleanupAsync()
        {
            await _cleanupSemaphore.WaitAsync();
            try
            {
                // 如果内存缓存数量超过限制
                if (_memoryCache.Count > MaxMemoryCacheSize)
                {
                    var itemsToRemove = _memoryCache.Values
                        .OrderBy(x => x.LastAccessTime)
                        .Take(_memoryCache.Count - MaxMemoryCacheSize)
                        .ToList();

                    foreach (var item in itemsToRemove)
                    {
                        _memoryCache.TryRemove(item.OriginalPath, out _);
                        SuperResolutionLogger.Info($"内存缓存已清理: {item.OriginalPath}");
                    }
                }

                // 如果内存缓存大小超过限制
                var totalSize = _memoryCache.Values.Sum(x =>
                    (x.OriginalData?.Length ?? 0) + (x.SuperResolutionData?.Length ?? 0));

                if (totalSize > MaxMemoryCacheSizeMB * 1024 * 1024)
                {
                    var itemsToRemove = _memoryCache.Values
                        .OrderBy(x => x.LastAccessTime)
                        .ToList();

                    foreach (var item in itemsToRemove)
                    {
                        _memoryCache.TryRemove(item.OriginalPath, out _);
                        
                        totalSize -= (item.OriginalData?.Length ?? 0) + (item.SuperResolutionData?.Length ?? 0);
                        if (totalSize <= MaxMemoryCacheSizeMB * 1024 * 1024)
                        {
                            break;
                        }
                    }
                    
                    SuperResolutionLogger.Info($"内存缓存大小超限，已清理部分项目");
                }
            }
            finally
            {
                _cleanupSemaphore.Release();
            }
        }

        /// <summary>
        /// 清空所有缓存
        /// </summary>
        public async Task ClearAsync()
        {
            _memoryCache.Clear();
            await _diskCache.ClearAsync();
            SuperResolutionLogger.Info("所有缓存已清空");
        }

        /// <summary>
        /// 同步清空缓存（兼容旧代码）
        /// </summary>
        public void Clear()
        {
            _memoryCache.Clear();
            _ = ClearAsync(); // 异步清理磁盘缓存
        }

        /// <summary>
        /// 获取缓存统计信息
        /// </summary>
        public (int memoryCount, long memorySize, int diskCount, long diskSize, string diskPath) GetCacheStats()
        {
            // 内存缓存统计
            var memoryCount = _memoryCache.Count;
            var memorySize = _memoryCache.Values.Sum(x =>
                (x.OriginalData?.Length ?? 0) + (x.SuperResolutionData?.Length ?? 0));

            // 磁盘缓存统计
            var (diskCount, diskSize, diskPath) = _diskCache.GetCacheStats();

            return (memoryCount, memorySize, diskCount, diskSize, diskPath);
        }

        /// <summary>
        /// 获取内存缓存统计信息（兼容旧代码）
        /// </summary>
        public (int count, long totalSize) GetMemoryCacheStats()
        {
            var count = _memoryCache.Count;
            var totalSize = _memoryCache.Values.Sum(x =>
                (x.OriginalData?.Length ?? 0) + (x.SuperResolutionData?.Length ?? 0));
            return (count, totalSize);
        }
    }
}
