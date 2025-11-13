using System;
using System.IO;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace NeeView.SuperResolution
{
    /// <summary>
    /// 图片格式转换器 - 智能处理超分输入格式
    /// 策略: 优先使用已解码的 BitmapSource,避免二次解码损失
    /// </summary>
    public static class ImageFormatConverter
    {
        /// <summary>
        /// 从 BitmapSource 提取像素数据并编码为 PNG (零质量损失)
        /// 这是最优方案:AVIF/JXL 已被 Susie/WPF 解码,直接用像素数据
        /// </summary>
        public static byte[] ConvertBitmapSourceToPng(BitmapSource bitmapSource)
        {
            if (bitmapSource == null)
                throw new ArgumentNullException(nameof(bitmapSource));

            SuperResolutionLogger.Info($"从 BitmapSource 转换: {bitmapSource.PixelWidth}x{bitmapSource.PixelHeight}, {bitmapSource.Format}");

            try
            {
                // 确保 BitmapSource 格式适合编码
                BitmapSource processSource = bitmapSource;
                
                // 如果不是标准格式,转换为 Bgra32 (保持透明度)
                if (bitmapSource.Format != PixelFormats.Bgra32 &&
                    bitmapSource.Format != PixelFormats.Bgr32 &&
                    bitmapSource.Format != PixelFormats.Bgr24)
                {
                    SuperResolutionLogger.DebugLog($"转换像素格式: {bitmapSource.Format} → Bgra32");
                    processSource = new FormatConvertedBitmap(bitmapSource, PixelFormats.Bgra32, null, 0);
                }

                using (var outputStream = new MemoryStream())
                {
                    var encoder = new PngBitmapEncoder();
                    encoder.Frames.Add(BitmapFrame.Create(processSource));
                    encoder.Save(outputStream);

                    var pngData = outputStream.ToArray();
                    SuperResolutionLogger.Info($"BitmapSource → PNG 转换完成: {pngData.Length / 1024.0:F2} KB");

                    return pngData;
                }
            }
            catch (Exception ex)
            {
                SuperResolutionLogger.Error($"BitmapSource 转换失败: {ex.Message}", ex);
                throw;
            }
        }

        /// <summary>
        /// 检查格式是否被 sr_vulkan 原生支持
        /// </summary>
        public static bool IsNativelySupportedFormat(byte[] imageData)
        {
            if (imageData == null || imageData.Length < 12)
                return false;

            // PNG: 89 50 4E 47 0D 0A 1A 0A
            if (imageData[0] == 0x89 && imageData[1] == 0x50 && imageData[2] == 0x4E && imageData[3] == 0x47)
            {
                SuperResolutionLogger.DebugLog("检测到 PNG 格式(原生支持)");
                return true;
            }

            // JPEG: FF D8 FF
            if (imageData[0] == 0xFF && imageData[1] == 0xD8 && imageData[2] == 0xFF)
            {
                SuperResolutionLogger.DebugLog("检测到 JPEG 格式(原生支持)");
                return true;
            }

            // WebP: RIFF ... WEBP
            if (imageData.Length >= 12 &&
                imageData[0] == 0x52 && imageData[1] == 0x49 && imageData[2] == 0x46 && imageData[3] == 0x46 &&
                imageData[8] == 0x57 && imageData[9] == 0x45 && imageData[10] == 0x42 && imageData[11] == 0x50)
            {
                SuperResolutionLogger.DebugLog("检测到 WebP 格式(原生支持)");
                return true;
            }

            // 其他格式不支持
            SuperResolutionLogger.DebugLog($"格式不被 sr_vulkan 原生支持,需要转换");
            return false;
        }

        /// <summary>
        /// 检测图片格式
        /// </summary>
        public static string DetectFormat(byte[] imageData)
        {
            if (imageData == null || imageData.Length < 12)
                return "Unknown";

            // PNG
            if (imageData[0] == 0x89 && imageData[1] == 0x50 && imageData[2] == 0x4E && imageData[3] == 0x47)
                return "PNG";

            // JPEG
            if (imageData[0] == 0xFF && imageData[1] == 0xD8 && imageData[2] == 0xFF)
                return "JPEG";

            // WebP: RIFF ... WEBP
            if (imageData.Length >= 12 &&
                imageData[0] == 0x52 && imageData[1] == 0x49 && imageData[2] == 0x46 && imageData[3] == 0x46 &&
                imageData[8] == 0x57 && imageData[9] == 0x45 && imageData[10] == 0x42 && imageData[11] == 0x50)
                return "WebP";

            // AVIF: ftyp avif/avis
            if (imageData.Length >= 12 &&
                imageData[4] == 0x66 && imageData[5] == 0x74 && imageData[6] == 0x79 && imageData[7] == 0x70)
            {
                if ((imageData[8] == 0x61 && imageData[9] == 0x76 && imageData[10] == 0x69 && imageData[11] == 0x66) ||
                    (imageData[8] == 0x61 && imageData[9] == 0x76 && imageData[10] == 0x69 && imageData[11] == 0x73))
                    return "AVIF";
            }

            // JXL: FF 0A or 00 00 00 0C 4A 58 4C 20 0D 0A 87 0A
            if (imageData.Length >= 2 && imageData[0] == 0xFF && imageData[1] == 0x0A)
                return "JXL";
            if (imageData.Length >= 12 &&
                imageData[0] == 0x00 && imageData[1] == 0x00 && imageData[2] == 0x00 && imageData[3] == 0x0C &&
                imageData[4] == 0x4A && imageData[5] == 0x58 && imageData[6] == 0x4C && imageData[7] == 0x20)
                return "JXL";

            // HEIF/HEIC
            if (imageData.Length >= 12 &&
                imageData[4] == 0x66 && imageData[5] == 0x74 && imageData[6] == 0x79 && imageData[7] == 0x70)
            {
                if ((imageData[8] == 0x68 && imageData[9] == 0x65 && imageData[10] == 0x69 && imageData[11] == 0x63) ||
                    (imageData[8] == 0x68 && imageData[9] == 0x65 && imageData[10] == 0x69 && imageData[11] == 0x66))
                    return "HEIF";
            }

            return "Unknown";
        }

        /// <summary>
        /// [降级方案] 转换不支持的格式为 PNG (通过 WPF BitmapDecoder)
        /// 注意:如果可能,应优先使用 ConvertBitmapSourceToPng() 从已解码的 BitmapSource 转换
        /// </summary>
        public static byte[] ConvertToPng(byte[] imageData)
        {
            var format = DetectFormat(imageData);
            SuperResolutionLogger.Info($"检测到图片格式: {format}");

            if (IsNativelySupportedFormat(imageData))
            {
                SuperResolutionLogger.DebugLog("格式已被 sr_vulkan 原生支持,无需转换");
                return imageData;
            }

            SuperResolutionLogger.Warning($"[降级方案] 格式 {format} 需从字节流解码后转换为 PNG");
            SuperResolutionLogger.Warning("建议:如已有 BitmapSource,请使用 ConvertBitmapSourceToPng() 避免二次解码");

            try
            {
                using (var inputStream = new MemoryStream(imageData))
                {
                    // 使用 WPF 解码器(支持通过 Susie 插件解码的格式)
                    BitmapDecoder decoder;
                    
                    try
                    {
                        decoder = BitmapDecoder.Create(
                            inputStream,
                            BitmapCreateOptions.PreservePixelFormat,
                            BitmapCacheOption.OnLoad
                        );
                    }
                    catch (Exception ex)
                    {
                        SuperResolutionLogger.Error($"WPF BitmapDecoder 解码失败: {ex.Message}", ex);
                        throw new NotSupportedException($"无法解码 {format} 格式图片", ex);
                    }

                    if (decoder.Frames.Count == 0)
                    {
                        throw new InvalidOperationException("解码后未找到图片帧");
                    }

                    var frame = decoder.Frames[0];
                    SuperResolutionLogger.Info($"解码成功: {frame.PixelWidth}x{frame.PixelHeight}, {frame.Format}");

                    // 使用统一的 BitmapSource 转换方法
                    return ConvertBitmapSourceToPng(frame);
                }
            }
            catch (Exception ex)
            {
                SuperResolutionLogger.Error($"格式转换失败: {ex.Message}", ex);
                throw;
            }
        }
    }
}
