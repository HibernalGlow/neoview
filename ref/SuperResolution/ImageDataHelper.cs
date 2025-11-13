using NeeView.PageFrames;
using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Media.Imaging;

namespace NeeView.SuperResolution
{
    /// <summary>
    /// 图片数据访问助手
    /// </summary>
    public static class ImageDataHelper
    {
        /// <summary>
        /// 从当前页面获取图片数据
        /// </summary>
        public static async Task<byte[]?> GetCurrentImageDataAsync(CancellationToken cancellationToken = default)
        {
            try
            {
                var presenter = PageFrameBoxPresenter.Current;
                var pageFrameContent = presenter.GetSelectedPageFrameContent();
                if (pageFrameContent == null)
                {
                    return null;
                }

                var pages = pageFrameContent.PageFrame.Elements;
                if (pages.Count == 0)
                {
                    return null;
                }

                // 获取第一个页面（主要页面）
                var page = pages[0].Page;
                
                // 方法1: 从文件路径读取（如果可用）
                if (!string.IsNullOrEmpty(page.TargetPath) && File.Exists(page.TargetPath))
                {
                    return await File.ReadAllBytesAsync(page.TargetPath, cancellationToken);
                }

                // 方法2: 从ArchiveEntry读取
                var archiveEntry = page.ArchiveEntry;
                if (archiveEntry != null)
                {
                    // 使用OpenStreamAsync获取数据流并转换为字节数组
                    using var stream = await archiveEntry.OpenEntryAsync(false, cancellationToken);
                    using var memoryStream = new MemoryStream();
                    await stream.CopyToAsync(memoryStream, cancellationToken);
                    return memoryStream.ToArray();
                }

                return null;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error getting image data: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// 从页面内容获取BitmapSource
        /// </summary>
        public static BitmapSource? GetCurrentBitmapSource()
        {
            try
            {
                var presenter = PageFrameBoxPresenter.Current;
                var pageFrameContent = presenter.GetSelectedPageFrameContent();
                if (pageFrameContent == null)
                {
                    return null;
                }

                var pages = pageFrameContent.PageFrame.Elements;
                if (pages.Count == 0)
                {
                    return null;
                }

                var page = pages[0].Page;
                var content = page.Content;
                
                // 尝试从PageContent获取BitmapSource
                if (content.Data is BitmapSource bitmapSource)
                {
                    try
                    {
                        // 记录 BitmapSource 的尺寸与像素格式，帮助判断是否为缩略帧
                        SuperResolutionLogger.Info($"[GetCurrentBitmapSource] BitmapSource: {bitmapSource.PixelWidth}x{bitmapSource.PixelHeight}, {bitmapSource.Format}");

                        // 记录页面中原始图片信息(若可用)
                        var fileName = page.EntryLastName ?? "(unknown)";
                        var origW = (int?)(content.PictureInfo?.OriginalSize.Width) ?? 0;
                        var origH = (int?)(content.PictureInfo?.OriginalSize.Height) ?? 0;
                        SuperResolutionLogger.Info($"[GetCurrentBitmapSource] Page info: file={fileName}, originalSize={origW}x{origH}");
                    }
                    catch (Exception ex)
                    {
                        SuperResolutionLogger.Error($"记录 BitmapSource 信息失败: {ex.Message}", ex);
                    }

                    return bitmapSource;
                }

                return null;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error getting bitmap source: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// 将BitmapSource转换为字节数组
        /// </summary>
        public static byte[]? BitmapSourceToBytes(BitmapSource? bitmapSource, BitmapEncoder? encoder = null)
        {
            if (bitmapSource == null)
            {
                return null;
            }

            try
            {
                encoder ??= new PngBitmapEncoder();
                
                using var memoryStream = new MemoryStream();
                encoder.Frames.Add(BitmapFrame.Create(bitmapSource));
                encoder.Save(memoryStream);
                return memoryStream.ToArray();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error converting bitmap to bytes: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// 从字节数组创建BitmapSource
        /// </summary>
        public static BitmapSource? BytesToBitmapSource(byte[] imageData)
        {
            if (imageData == null || imageData.Length == 0)
            {
                return null;
            }

            try
            {
                using var memoryStream = new MemoryStream(imageData);
                var bitmap = new BitmapImage();
                bitmap.BeginInit();
                bitmap.CacheOption = BitmapCacheOption.OnLoad;
                bitmap.StreamSource = memoryStream;
                bitmap.EndInit();
                bitmap.Freeze();
                return bitmap;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error converting bytes to bitmap: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// 获取当前页面信息
        /// </summary>
        public static (string fileName, int width, int height)? GetCurrentImageInfo()
        {
            try
            {
                var presenter = PageFrameBoxPresenter.Current;
                var pageFrameContent = presenter.GetSelectedPageFrameContent();
                if (pageFrameContent == null)
                {
                    return null;
                }

                var pages = pageFrameContent.PageFrame.Elements;
                if (pages.Count == 0)
                {
                    return null;
                }

                var page = pages[0].Page;
                var content = page.Content;
                
                string fileName = page.EntryLastName;
                int width = (int)(content.PictureInfo?.OriginalSize.Width ?? 0);
                int height = (int)(content.PictureInfo?.OriginalSize.Height ?? 0);

                return (fileName, width, height);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error getting image info: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// 保存处理后的图片到临时文件并在NeeView中打开
        /// </summary>
        public static async Task<bool> ShowProcessedImageAsync(byte[] imageData, string originalFileName)
        {
            try
            {
                // 创建临时文件
                var tempFolder = Path.Combine(Path.GetTempPath(), "NeeView_SuperResolution");
                Directory.CreateDirectory(tempFolder);

                var timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
                var fileNameWithoutExt = Path.GetFileNameWithoutExtension(originalFileName);
                var ext = Path.GetExtension(originalFileName);
                var tempFileName = $"{fileNameWithoutExt}_SR_{timestamp}{ext}";
                var tempFilePath = Path.Combine(tempFolder, tempFileName);

                // 保存文件
                await File.WriteAllBytesAsync(tempFilePath, imageData);

                // 在NeeView中打开
                BookHub.Current.RequestLoad(null, tempFilePath, null, BookLoadOption.None, true);

                return true;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error showing processed image: {ex.Message}");
                return false;
            }
        }
    }
}
