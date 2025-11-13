using System;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace NeeView.SuperResolution
{
    /// <summary>
    /// 自动超分辨率服务
    /// 拦截图片加载并自动应用超分辨率处理
    /// </summary>
    public class AutoSuperResolutionService
    {
        private readonly SuperResolutionConfig _config;
        private readonly SuperResolutionService _srService;
        private bool _isEnabled;

        public AutoSuperResolutionService(SuperResolutionConfig config, SuperResolutionService srService)
        {
            _config = config;
            _srService = srService;

            // 监听配置变化 - AutoApplyOnView已删除,默认启用
            _config.PropertyChanged += (s, e) =>
            {
                if (e.PropertyName == nameof(_config.IsEnabled))
                {
                    _isEnabled = _config.IsEnabled;
                }
            };

            _isEnabled = _config.IsEnabled;
        }

        /// <summary>
        /// 尝试对图片数据应用超分辨率
        /// 如果不满足自动超分条件,返回原始数据
        /// </summary>
        public async Task<byte[]> TryProcessImageAsync(
            byte[] imageData,
            CancellationToken cancellationToken = default)
        {
            // 检查是否启用自动超分
            if (!_isEnabled || !_config.IsEnabled)
            {
                return imageData;
            }

            try
            {
                // 检查图片尺寸是否超过限制
                var size = GetImageSize(imageData);
                if (size.Width > _config.AutoApplyMaxSize || size.Height > _config.AutoApplyMaxSize)
                {
                    // 图片太大,跳过自动超分
                    return imageData;
                }

                // 应用超分辨率
                var result = await _srService.ProcessAsync(
                    imageData,
                    _config,
                    cancellationToken
                );

                // 如果处理失败,返回原始数据
                return result.Success && result.OutputData != null ? result.OutputData : imageData;
            }
            catch (Exception ex)
            {
                // 处理失败,记录错误并返回原始数据
                System.Diagnostics.Debug.WriteLine($"自动超分失败: {ex.Message}");
                return imageData;
            }
        }

        /// <summary>
        /// 获取图片尺寸 (不完整加载图片)
        /// </summary>
        private Size GetImageSize(byte[] imageData)
        {
            try
            {
                using var ms = new MemoryStream(imageData);
                using var img = System.Drawing.Image.FromStream(ms, false, false);
                return new Size(img.Width, img.Height);
            }
            catch
            {
                // 无法获取尺寸,返回最大值以跳过自动超分
                return new Size(int.MaxValue, int.MaxValue);
            }
        }

        /// <summary>
        /// 单例实例
        /// </summary>
        public static AutoSuperResolutionService? Current { get; set; }
    }
}
