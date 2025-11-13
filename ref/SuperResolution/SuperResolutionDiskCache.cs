using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace NeeView.SuperResolution
{
    /// <summary>
    /// 磁盘缓存管理器
    /// </summary>
    public class SuperResolutionDiskCache
    {
        private static readonly Lazy<SuperResolutionDiskCache> _instance = new(() => new SuperResolutionDiskCache());
        public static SuperResolutionDiskCache Current => _instance.Value;

        private readonly string _cacheDirectory;
        private readonly string _indexFilePath;
        private readonly ConcurrentDictionary<string, DiskCacheInfo> _diskIndex = new();
        private readonly SemaphoreSlim _cleanupSemaphore = new(1, 1);
        private readonly SemaphoreSlim _indexSemaphore = new(1, 1);
        private readonly Timer _cleanupTimer;
        
        private const long MaxDiskCacheSizeMB = 5120; // 5GB
        private const int MaxCacheFiles = 10000;
        private static readonly TimeSpan DefaultCacheMaxAge = TimeSpan.FromDays(30); // 30天过期

        /// <summary>
        /// 磁盘缓存索引项（用于序列化）
        /// </summary>
        private class DiskCacheIndexItem
        {
            public string CacheKey { get; set; } = "";
            public string FilePath { get; set; } = "";
            public long FileSize { get; set; }
            public DateTime CreatedTime { get; set; }
            public DateTime LastAccessTime { get; set; }
            public int OriginalWidth { get; set; }
            public int OriginalHeight { get; set; }
            public int SuperResolutionWidth { get; set; }
            public int SuperResolutionHeight { get; set; }
            public double ProcessingTime { get; set; }
            public string AlgorithmType { get; set; } = "";
            public int ScaleFactor { get; set; }
            public int NoiseLevel { get; set; }
        }

        private SuperResolutionDiskCache()
        {
            // 缓存目录：%LocalAppData%\NeeView\SuperResolution\Cache
            var localAppData = System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData);
            _cacheDirectory = Path.Combine(localAppData, "NeeView", "SuperResolution", "Cache");
            _indexFilePath = Path.Combine(_cacheDirectory, "index.json");
            
            Directory.CreateDirectory(_cacheDirectory);
            
            // 启动时加载索引
            _ = LoadIndexAsync();
            
            // 定期清理过期缓存（每小时）
            _cleanupTimer = new Timer(CleanupCallback, null, TimeSpan.FromHours(1), TimeSpan.FromHours(1));
        }

        /// <summary>
        /// 磁盘缓存信息
        /// </summary>
        private class DiskCacheInfo
        {
            public string FilePath { get; set; } = "";
            public long FileSize { get; set; }
            public DateTime CreatedTime { get; set; }
            public DateTime LastAccessTime { get; set; }
            public int OriginalWidth { get; set; }
            public int OriginalHeight { get; set; }
            public int SuperResolutionWidth { get; set; }
            public int SuperResolutionHeight { get; set; }
            public double ProcessingTime { get; set; }
            public string AlgorithmType { get; set; } = "";
            public int ScaleFactor { get; set; }
            public int NoiseLevel { get; set; }

            public bool IsExpired(TimeSpan maxAge)
            {
                return DateTime.Now - CreatedTime > maxAge;
            }
        }

        /// <summary>
        /// 生成缓存键（基于文件路径和参数的哈希）
        /// </summary>
        private string GenerateCacheKey(string originalPath, SuperResolutionConfig config)
        {
            var keyData = $"{originalPath}|{config.AlgorithmType}|{config.ScaleFactor}|{config.NoiseLevel}|{config.Model}";
            using var sha256 = SHA256.Create();
            var hash = sha256.ComputeHash(Encoding.UTF8.GetBytes(keyData));
            return Convert.ToHexString(hash).Substring(0, 16); // 取前16位
        }

        /// <summary>
        /// 获取缓存文件路径
        /// </summary>
        private string GetCacheFilePath(string cacheKey)
        {
            return Path.Combine(_cacheDirectory, $"{cacheKey}.sr.png");
        }

        /// <summary>
        /// 异步加载磁盘索引
        /// </summary>
        private async Task LoadIndexAsync()
        {
            await Task.Run(() =>
            {
                try
                {
                    if (File.Exists(_indexFilePath))
                    {
                        // 从索引文件加载
                        var json = File.ReadAllText(_indexFilePath);
                        var indexItems = JsonSerializer.Deserialize<List<DiskCacheIndexItem>>(json);
                        
                        if (indexItems != null)
                        {
                            foreach (var item in indexItems)
                            {
                                // 验证文件是否存在
                                if (File.Exists(item.FilePath))
                                {
                                    var fileInfo = new FileInfo(item.FilePath);
                                    _diskIndex.TryAdd(item.CacheKey, new DiskCacheInfo
                                    {
                                        FilePath = item.FilePath,
                                        FileSize = item.FileSize,
                                        CreatedTime = item.CreatedTime,
                                        LastAccessTime = item.LastAccessTime,
                                        OriginalWidth = item.OriginalWidth,
                                        OriginalHeight = item.OriginalHeight,
                                        SuperResolutionWidth = item.SuperResolutionWidth,
                                        SuperResolutionHeight = item.SuperResolutionHeight,
                                        ProcessingTime = item.ProcessingTime,
                                        AlgorithmType = item.AlgorithmType,
                                        ScaleFactor = item.ScaleFactor,
                                        NoiseLevel = item.NoiseLevel
                                    });
                                }
                            }
                            
                            SuperResolutionLogger.Info($"从索引文件加载了 {_diskIndex.Count} 个缓存项");
                        }
                    }
                    else
                    {
                        // 索引文件不存在，扫描目录重建
                        ScanCacheDirectory();
                    }
                }
                catch (Exception ex)
                {
                    SuperResolutionLogger.Error($"加载磁盘缓存索引失败: {ex.Message}", ex);
                    // 出错时尝试扫描目录重建
                    ScanCacheDirectory();
                }
            });
        }

        /// <summary>
        /// 异步保存磁盘索引
        /// </summary>
        private async Task SaveIndexAsync()
        {
            await _indexSemaphore.WaitAsync();
            try
            {
                var indexItems = _diskIndex.Select(kvp => new DiskCacheIndexItem
                {
                    CacheKey = kvp.Key,
                    FilePath = kvp.Value.FilePath,
                    FileSize = kvp.Value.FileSize,
                    CreatedTime = kvp.Value.CreatedTime,
                    LastAccessTime = kvp.Value.LastAccessTime,
                    OriginalWidth = kvp.Value.OriginalWidth,
                    OriginalHeight = kvp.Value.OriginalHeight,
                    SuperResolutionWidth = kvp.Value.SuperResolutionWidth,
                    SuperResolutionHeight = kvp.Value.SuperResolutionHeight,
                    ProcessingTime = kvp.Value.ProcessingTime,
                    AlgorithmType = kvp.Value.AlgorithmType,
                    ScaleFactor = kvp.Value.ScaleFactor,
                    NoiseLevel = kvp.Value.NoiseLevel
                }).ToList();

                var json = JsonSerializer.Serialize(indexItems, new JsonSerializerOptions { WriteIndented = true });
                
                // 原子性写入：先写临时文件，再替换
                var tempFile = _indexFilePath + ".tmp";
                await File.WriteAllTextAsync(tempFile, json);
                File.Move(tempFile, _indexFilePath, true);
                
                SuperResolutionLogger.DebugLog($"磁盘缓存索引已保存 ({indexItems.Count} 项)");
            }
            catch (Exception ex)
            {
                SuperResolutionLogger.Error($"保存磁盘缓存索引失败: {ex.Message}", ex);
            }
            finally
            {
                _indexSemaphore.Release();
            }
        }

        /// <summary>
        /// 扫描缓存目录重建索引
        /// </summary>
        private void ScanCacheDirectory()
        {
            try
            {
                _diskIndex.Clear();
                
                var cacheFiles = Directory.GetFiles(_cacheDirectory, "*.sr.png");
                foreach (var file in cacheFiles)
                {
                    var fileInfo = new FileInfo(file);
                    var cacheKey = Path.GetFileNameWithoutExtension(file);
                    
                    _diskIndex.TryAdd(cacheKey, new DiskCacheInfo
                    {
                        FilePath = file,
                        FileSize = fileInfo.Length,
                        CreatedTime = fileInfo.CreationTime,
                        LastAccessTime = fileInfo.LastAccessTime
                    });
                }
                
                SuperResolutionLogger.Info($"扫描到 {_diskIndex.Count} 个磁盘缓存文件");
            }
            catch (Exception ex)
            {
                SuperResolutionLogger.Error($"扫描缓存目录失败: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// 保存到磁盘缓存
        /// </summary>
        public async Task SaveAsync(string originalPath, SuperResolutionConfig config, byte[] superResolutionData, 
            int originalWidth, int originalHeight, int outputWidth, int outputHeight, double processingTime)
        {
            try
            {
                var cacheKey = GenerateCacheKey(originalPath, config);
                var filePath = GetCacheFilePath(cacheKey);
                
                // 保存图片文件
                await File.WriteAllBytesAsync(filePath, superResolutionData);
                
                // 更新索引
                var fileInfo = new FileInfo(filePath);
                _diskIndex.AddOrUpdate(cacheKey, 
                    new DiskCacheInfo
                    {
                        FilePath = filePath,
                        FileSize = fileInfo.Length,
                        CreatedTime = DateTime.Now,
                        LastAccessTime = DateTime.Now,
                        OriginalWidth = originalWidth,
                        OriginalHeight = originalHeight,
                        SuperResolutionWidth = outputWidth,
                        SuperResolutionHeight = outputHeight,
                        ProcessingTime = processingTime,
                        AlgorithmType = config.AlgorithmType.ToString(),
                        ScaleFactor = (int)config.ScaleFactor,
                        NoiseLevel = (int)config.NoiseLevel
                    },
                    (key, existing) => new DiskCacheInfo
                    {
                        FilePath = filePath,
                        FileSize = fileInfo.Length,
                        CreatedTime = existing.CreatedTime, // 保持原创建时间
                        LastAccessTime = DateTime.Now,
                        OriginalWidth = originalWidth,
                        OriginalHeight = originalHeight,
                        SuperResolutionWidth = outputWidth,
                        SuperResolutionHeight = outputHeight,
                        ProcessingTime = processingTime,
                        AlgorithmType = config.AlgorithmType.ToString(),
                        ScaleFactor = (int)config.ScaleFactor,
                        NoiseLevel = (int)config.NoiseLevel
                    });
                
                SuperResolutionLogger.Info($"超分结果已保存到磁盘缓存: {cacheKey} ({superResolutionData.Length / 1024.0:F2} KB)");
                
                // 保存索引到文件
                _ = SaveIndexAsync();
                
                // 检查是否需要清理
                _ = Task.Run(CleanupIfNeededAsync);
            }
            catch (Exception ex)
            {
                SuperResolutionLogger.Error($"保存磁盘缓存失败: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// 从磁盘缓存加载
        /// </summary>
        public async Task<byte[]?> LoadAsync(string originalPath, SuperResolutionConfig config, TimeSpan? maxAge = null)
        {
            try
            {
                var cacheKey = GenerateCacheKey(originalPath, config);
                
                if (!_diskIndex.TryGetValue(cacheKey, out var cacheInfo))
                {
                    return null;
                }
                
                // 检查过期
                var age = maxAge ?? DefaultCacheMaxAge;
                if (cacheInfo.IsExpired(age))
                {
                    SuperResolutionLogger.Info($"磁盘缓存已过期: {cacheKey}");
                    await RemoveAsync(cacheKey);
                    return null;
                }
                
                // 检查文件是否存在
                if (!File.Exists(cacheInfo.FilePath))
                {
                    SuperResolutionLogger.Warning($"磁盘缓存文件不存在: {cacheInfo.FilePath}");
                    _diskIndex.TryRemove(cacheKey, out _);
                    return null;
                }
                
                // 读取文件
                var data = await File.ReadAllBytesAsync(cacheInfo.FilePath);
                
                // 更新访问时间
                cacheInfo.LastAccessTime = DateTime.Now;
                
                SuperResolutionLogger.Info($"从磁盘缓存加载: {cacheKey} ({data.Length / 1024.0:F2} KB)");
                
                // 异步保存索引（避免阻塞加载）
                _ = SaveIndexAsync();
                
                return data;
            }
            catch (Exception ex)
            {
                SuperResolutionLogger.Error($"加载磁盘缓存失败: {ex.Message}", ex);
                return null;
            }
        }

        /// <summary>
        /// 移除缓存项
        /// </summary>
        public Task RemoveAsync(string cacheKey)
        {
            try
            {
                if (_diskIndex.TryRemove(cacheKey, out var cacheInfo))
                {
                    if (File.Exists(cacheInfo.FilePath))
                    {
                        File.Delete(cacheInfo.FilePath);
                    }
                }
            }
            catch (Exception ex)
            {
                SuperResolutionLogger.Error($"移除磁盘缓存失败: {ex.Message}", ex);
            }
            
            return Task.CompletedTask;
        }

        /// <summary>
        /// 清理过期和超量的缓存
        /// </summary>
        private async Task CleanupIfNeededAsync()
        {
            await _cleanupSemaphore.WaitAsync();
            try
            {
                await CleanupAsync();
            }
            finally
            {
                _cleanupSemaphore.Release();
            }
        }

        /// <summary>
        /// 清理缓存
        /// </summary>
        private async Task CleanupAsync()
        {
            try
            {
                var now = DateTime.Now;
                var itemsToRemove = new List<string>();

                // 1. 移除过期项
                foreach (var kvp in _diskIndex)
                {
                    if (kvp.Value.IsExpired(DefaultCacheMaxAge))
                    {
                        itemsToRemove.Add(kvp.Key);
                    }
                }

                // 2. 如果文件数量超限，移除最旧的
                if (_diskIndex.Count - itemsToRemove.Count > MaxCacheFiles)
                {
                    var excessCount = _diskIndex.Count - itemsToRemove.Count - MaxCacheFiles;
                    var oldestItems = _diskIndex.Values
                        .Where(x => !itemsToRemove.Contains(GenerateCacheKeyFromPath(x.FilePath)))
                        .OrderBy(x => x.LastAccessTime)
                        .Take(excessCount)
                        .Select(x => GenerateCacheKeyFromPath(x.FilePath));
                    
                    itemsToRemove.AddRange(oldestItems);
                }

                // 3. 如果总大小超限，移除最旧的
                var totalSize = _diskIndex.Values.Where(x => !itemsToRemove.Contains(GenerateCacheKeyFromPath(x.FilePath)))
                                                  .Sum(x => x.FileSize);
                
                if (totalSize > MaxDiskCacheSizeMB * 1024 * 1024)
                {
                    var sortedByAccess = _diskIndex.Values
                        .Where(x => !itemsToRemove.Contains(GenerateCacheKeyFromPath(x.FilePath)))
                        .OrderBy(x => x.LastAccessTime)
                        .ToList();

                    foreach (var item in sortedByAccess)
                    {
                        itemsToRemove.Add(GenerateCacheKeyFromPath(item.FilePath));
                        totalSize -= item.FileSize;
                        
                        if (totalSize <= MaxDiskCacheSizeMB * 1024 * 1024)
                        {
                            break;
                        }
                    }
                }

                // 执行移除
                foreach (var cacheKey in itemsToRemove.Distinct())
                {
                    await RemoveAsync(cacheKey);
                }

                if (itemsToRemove.Count > 0)
                {
                    SuperResolutionLogger.Info($"磁盘缓存清理完成，移除了 {itemsToRemove.Count} 项");
                    
                    // 保存更新后的索引
                    _ = SaveIndexAsync();
                }
            }
            catch (Exception ex)
            {
                SuperResolutionLogger.Error($"磁盘缓存清理失败: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// 定时清理回调
        /// </summary>
        private async void CleanupCallback(object? state)
        {
            await CleanupIfNeededAsync();
        }

        /// <summary>
        /// 从文件路径生成缓存键
        /// </summary>
        private string GenerateCacheKeyFromPath(string filePath)
        {
            return Path.GetFileNameWithoutExtension(filePath);
        }

        /// <summary>
        /// 清空所有缓存
        /// </summary>
        public async Task ClearAsync()
        {
            try
            {
                var keys = _diskIndex.Keys.ToList();
                foreach (var key in keys)
                {
                    await RemoveAsync(key);
                }
                
                SuperResolutionLogger.Info("磁盘缓存已清空");
                
                // 保存空的索引
                _ = SaveIndexAsync();
            }
            catch (Exception ex)
            {
                SuperResolutionLogger.Error($"清空磁盘缓存失败: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// 获取缓存统计信息
        /// </summary>
        public (int count, long totalSize, string directoryPath) GetCacheStats()
        {
            var count = _diskIndex.Count;
            var totalSize = _diskIndex.Values.Sum(x => x.FileSize);
            return (count, totalSize, _cacheDirectory);
        }

        /// <summary>
        /// 释放资源
        /// </summary>
        public void Dispose()
        {
            _cleanupTimer?.Dispose();
            _cleanupSemaphore?.Dispose();
        }
    }
}