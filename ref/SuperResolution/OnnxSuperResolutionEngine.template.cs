// TODO: 集成真实算法前，需要先安装NuGet包:
// Install-Package Microsoft.ML.OnnxRuntime.Gpu
// 或
// Install-Package Microsoft.ML.OnnxRuntime (CPU版本)

/*
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Media.Imaging;

namespace NeeView.SuperResolution
{
    /// <summary>
    /// ONNX Runtime 超分辨率引擎
    /// 支持 Waifu2x, RealESRGAN 等 ONNX 格式模型
    /// </summary>
    public class OnnxSuperResolutionEngine : ISuperResolutionEngine
    {
        private InferenceSession? _session;
        private string? _currentModelPath;
        private SuperResolutionType _currentAlgorithm;
        private string? _lastError;

        public bool IsInitialized => _session != null;

        public async Task InitializeAsync(CancellationToken cancellationToken = default)
        {
            await Task.Run(() =>
            {
                // ONNX Runtime 初始化
                // GPU 选项: 使用 SessionOptions.AppendExecutionProvider_CUDA(0)
                // CPU 选项: 默认使用 CPU
                
                _lastError = null;
            }, cancellationToken);
        }

        public async Task LoadModelAsync(
            SuperResolutionType algorithm,
            SuperResolutionModel model,
            CancellationToken cancellationToken = default)
        {
            await Task.Run(() =>
            {
                try
                {
                    // 1. 构建模型文件路径
                    var modelPath = GetModelPath(algorithm, model);
                    
                    if (!File.Exists(modelPath))
                    {
                        throw new FileNotFoundException($"Model file not found: {modelPath}");
                    }

                    // 2. 如果已加载相同模型，跳过
                    if (_currentModelPath == modelPath && _session != null)
                    {
                        return;
                    }

                    // 3. 释放旧会话
                    _session?.Dispose();
                    
                    // 4. 创建会话选项
                    var options = new SessionOptions();
                    
                    // GPU 加速 (需要 CUDA)
                    // options.AppendExecutionProvider_CUDA(0);
                    
                    // 或 CPU (多线程)
                    options.InterOpNumThreads = Environment.ProcessorCount;
                    options.IntraOpNumThreads = Environment.ProcessorCount;
                    
                    // 5. 加载模型
                    _session = new InferenceSession(modelPath, options);
                    _currentModelPath = modelPath;
                    _currentAlgorithm = algorithm;
                    
                    _lastError = null;
                }
                catch (Exception ex)
                {
                    _lastError = $"Failed to load model: {ex.Message}";
                    throw;
                }
            }, cancellationToken);
        }

        public async Task<byte[]> ProcessAsync(
            byte[] inputData,
            int scaleFactor,
            int noiseLevel,
            int tileSize,
            bool useTTA,
            CancellationToken cancellationToken = default)
        {
            if (_session == null)
            {
                throw new InvalidOperationException("Engine not initialized. Call LoadModelAsync first.");
            }

            return await Task.Run(() =>
            {
                try
                {
                    // 1. 解码输入图片
                    var inputBitmap = ImageDataHelper.BytesToBitmapSource(inputData);
                    if (inputBitmap == null)
                    {
                        throw new InvalidOperationException("Failed to decode input image");
                    }

                    // 2. 转换为张量
                    var inputTensor = ConvertBitmapToTensor(inputBitmap);
                    
                    // 3. 创建输入
                    var inputs = new List<NamedOnnxValue>
                    {
                        NamedOnnxValue.CreateFromTensor("input", inputTensor)
                    };

                    // 4. 运行推理
                    using var results = _session.Run(inputs);
                    
                    // 5. 获取输出张量
                    var outputTensor = results.First().AsTensor<float>();
                    
                    // 6. 转换回图片
                    var outputBitmap = ConvertTensorToBitmap(outputTensor);
                    
                    // 7. 编码为字节数组
                    var outputData = ImageDataHelper.BitmapSourceToBytes(outputBitmap);
                    if (outputData == null)
                    {
                        throw new InvalidOperationException("Failed to encode output image");
                    }

                    return outputData;
                }
                catch (Exception ex)
                {
                    _lastError = $"Processing failed: {ex.Message}";
                    throw;
                }
            }, cancellationToken);
        }

        public async Task<byte[]> ProcessToSizeAsync(
            byte[] inputData,
            int targetWidth,
            int targetHeight,
            int noiseLevel,
            int tileSize,
            bool useTTA,
            CancellationToken cancellationToken = default)
        {
            // 1. 先进行超分处理
            var processedData = await ProcessAsync(inputData, 2, noiseLevel, tileSize, useTTA, cancellationToken);
            
            // 2. 调整到目标尺寸
            return await Task.Run(() =>
            {
                var bitmap = ImageDataHelper.BytesToBitmapSource(processedData);
                if (bitmap == null) return processedData;

                var resized = new TransformedBitmap(bitmap, new System.Windows.Media.ScaleTransform(
                    (double)targetWidth / bitmap.PixelWidth,
                    (double)targetHeight / bitmap.PixelHeight));
                
                return ImageDataHelper.BitmapSourceToBytes(resized) ?? processedData;
            }, cancellationToken);
        }

        public string? GetLastError()
        {
            return _lastError;
        }

        public void Dispose()
        {
            _session?.Dispose();
            _session = null;
            _currentModelPath = null;
        }

        #region 私有方法

        /// <summary>
        /// 获取模型文件路径
        /// </summary>
        private static string GetModelPath(SuperResolutionType algorithm, SuperResolutionModel model)
        {
            // TODO: 根据算法和模型类型返回正确的模型文件路径
            // 建议的目录结构:
            // models/
            //   waifu2x/
            //     cunet/
            //       scale2x_noise0.onnx
            //       scale2x_noise1.onnx
            //       scale2x_noise2.onnx
            //       scale2x_noise3.onnx
            //     upconv/
            //       ...
            //   realesrgan/
            //     x4plus.onnx
            //     x4plus_anime.onnx
            //   realcugan/
            //     ...

            var baseDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "models");
            
            switch (algorithm)
            {
                case SuperResolutionType.Waifu2x:
                    var waifu2xDir = Path.Combine(baseDir, "waifu2x", model.ToString().ToLower());
                    return Path.Combine(waifu2xDir, "model.onnx");
                    
                case SuperResolutionType.RealESRGAN:
                    var esrganDir = Path.Combine(baseDir, "realesrgan");
                    return Path.Combine(esrganDir, $"{model.ToString().ToLower()}.onnx");
                    
                case SuperResolutionType.RealCUGAN:
                    var cuganDir = Path.Combine(baseDir, "realcugan");
                    return Path.Combine(cuganDir, "model.onnx");
                    
                default:
                    throw new NotSupportedException($"Algorithm {algorithm} is not supported");
            }
        }

        /// <summary>
        /// 将 BitmapSource 转换为 ONNX 张量
        /// </summary>
        private static DenseTensor<float> ConvertBitmapToTensor(BitmapSource bitmap)
        {
            // TODO: 实现图片到张量的转换
            // 不同模型可能需要不同的预处理:
            // 1. 归一化范围 (0-1 或 -1到1 或 0-255)
            // 2. 通道顺序 (RGB 或 BGR)
            // 3. 维度顺序 (NCHW 或 NHWC)
            
            var width = bitmap.PixelWidth;
            var height = bitmap.PixelHeight;
            
            // 大多数模型使用 NCHW 格式: [batch, channels, height, width]
            var tensor = new DenseTensor<float>(new[] { 1, 3, height, width });
            
            // 提取像素数据
            var pixels = new byte[width * height * 4]; // BGRA
            bitmap.CopyPixels(pixels, width * 4, 0);
            
            // 转换为浮点并归一化
            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    int idx = (y * width + x) * 4;
                    
                    // BGRA -> RGB, 归一化到 0-1
                    tensor[0, 0, y, x] = pixels[idx + 2] / 255f; // R
                    tensor[0, 1, y, x] = pixels[idx + 1] / 255f; // G
                    tensor[0, 2, y, x] = pixels[idx + 0] / 255f; // B
                }
            }
            
            return tensor;
        }

        /// <summary>
        /// 将 ONNX 张量转换为 BitmapSource
        /// </summary>
        private static BitmapSource ConvertTensorToBitmap(Tensor<float> tensor)
        {
            // TODO: 实现张量到图片的转换
            // 注意:
            // 1. 反归一化
            // 2. 通道顺序转换
            // 3. 值域限制 (0-255)
            
            var dimensions = tensor.Dimensions.ToArray();
            
            // 假设输出格式为 [batch, channels, height, width]
            int height = dimensions[2];
            int width = dimensions[3];
            
            var pixels = new byte[width * height * 4]; // BGRA
            
            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    int idx = (y * width + x) * 4;
                    
                    // 反归一化并限制范围
                    byte r = (byte)Math.Clamp(tensor[0, 0, y, x] * 255, 0, 255);
                    byte g = (byte)Math.Clamp(tensor[0, 1, y, x] * 255, 0, 255);
                    byte b = (byte)Math.Clamp(tensor[0, 2, y, x] * 255, 0, 255);
                    
                    pixels[idx + 0] = b; // B
                    pixels[idx + 1] = g; // G
                    pixels[idx + 2] = r; // R
                    pixels[idx + 3] = 255; // A
                }
            }
            
            var bitmap = BitmapSource.Create(
                width, height,
                96, 96,
                System.Windows.Media.PixelFormats.Bgra32,
                null,
                pixels,
                width * 4);
            
            bitmap.Freeze();
            return bitmap;
        }

        #endregion
    }
}
*/

// =============================================================================
// 使用说明:
// =============================================================================
// 
// 1. 安装 NuGet 包:
//    PM> Install-Package Microsoft.ML.OnnxRuntime.Gpu
//    或 CPU 版本:
//    PM> Install-Package Microsoft.ML.OnnxRuntime
//
// 2. 取消注释上面的代码
//
// 3. 下载 ONNX 模型文件并放置到 models 目录
//    推荐模型来源:
//    - Waifu2x: https://github.com/nagadomi/waifu2x (需要转换为ONNX)
//    - RealESRGAN: https://github.com/xinntao/Real-ESRGAN
//
// 4. 在 ISuperResolutionEngine.cs 的工厂方法中切换引擎:
//    public static ISuperResolutionEngine GetDefaultEngine()
//    {
//        return new OnnxSuperResolutionEngine();  // 从 Mock 切换到 Onnx
//    }
//
// 5. 测试和调试:
//    - 先用小图片测试
//    - 验证输入输出尺寸
//    - 检查归一化范围
//    - 测试不同模型
//
// =============================================================================

namespace NeeView.SuperResolution
{
    /// <summary>
    /// ONNX 引擎占位类
    /// 实际实现请参考上面注释中的代码
    /// </summary>
    internal class OnnxEngineTemplate
    {
        // 此类仅用于保存模板代码，不参与编译
    }
}
