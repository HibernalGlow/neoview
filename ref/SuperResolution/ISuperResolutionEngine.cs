using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace NeeView.SuperResolution
{
    /// <summary>
    /// 超分辨率算法引擎接口
    /// 用于包装不同的算法实现（ncnn, onnxruntime等）
    /// </summary>
    public interface ISuperResolutionEngine
    {
        /// <summary>
        /// 引擎名称
        /// </summary>
        string Name { get; }

        /// <summary>
        /// 引擎版本
        /// </summary>
        string Version { get; }

        /// <summary>
        /// 是否可用
        /// </summary>
        bool IsAvailable { get; }

        /// <summary>
        /// 支持的模型类型
        /// </summary>
        SuperResolutionModel[] SupportedModels { get; }

    /// <summary>
    /// 可选的运算设备列表。
    /// </summary>
    IReadOnlyList<SuperResolutionDeviceInfo> AvailableDevices { get; }

        /// <summary>
        /// 初始化引擎
        /// </summary>
        Task<bool> InitializeAsync(int gpuId = 0);

        /// <summary>
        /// 加载模型
        /// </summary>
        Task<bool> LoadModelAsync(SuperResolutionModel model, string modelPath);

        /// <summary>
        /// 处理图片
        /// </summary>
        /// <param name="inputData">输入图片数据</param>
        /// <param name="scale">缩放倍数</param>
        /// <param name="denoise">降噪等级</param>
        /// <param name="tta">是否使用TTA模式</param>
        /// <param name="tileSize">Tile大小</param>
        /// <param name="cancellationToken">取消令牌</param>
        /// <returns>输出图片数据</returns>
        Task<byte[]> ProcessAsync(
            byte[] inputData,
            double scale,
            int denoise = -1,
            bool tta = false,
            int tileSize = 0,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// 处理图片（指定目标尺寸）
        /// </summary>
        Task<byte[]> ProcessToSizeAsync(
            byte[] inputData,
            int targetWidth,
            int targetHeight,
            int denoise = -1,
            bool tta = false,
            int tileSize = 0,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// 获取最后的错误信息
        /// </summary>
        string GetLastError();

        /// <summary>
        /// 释放资源
        /// </summary>
        void Dispose();
    }

    /// <summary>
    /// 模拟引擎（用于开发和测试）
    /// </summary>
    public class MockSuperResolutionEngine : ISuperResolutionEngine, IDisposable
    {
        private bool _isInitialized;
        private string _lastError = "";
        private SuperResolutionModel _currentModel;
        private readonly IReadOnlyList<SuperResolutionDeviceInfo> _devices = new[]
        {
            new SuperResolutionDeviceInfo(-1, "CPU (模拟)")
        };

        public string Name => "Mock Engine (Demo)";
        public string Version => "1.0.0";
        public bool IsAvailable => _isInitialized;

        public SuperResolutionModel[] SupportedModels => new[]
        {
            SuperResolutionModel.Waifu2xAnime2x,
            SuperResolutionModel.Waifu2xAnime4x,
            SuperResolutionModel.RealESRGANAnime4x,
        };

        public IReadOnlyList<SuperResolutionDeviceInfo> AvailableDevices => _devices;

        public async Task<bool> InitializeAsync(int gpuId = 0)
        {
            try
            {
                // 模拟初始化延迟
                await Task.Delay(100);
                _isInitialized = true;
                return true;
            }
            catch (Exception ex)
            {
                _lastError = ex.Message;
                return false;
            }
        }

        public async Task<bool> LoadModelAsync(SuperResolutionModel model, string modelPath)
        {
            try
            {
                // 模拟模型加载
                await Task.Delay(50);
                _currentModel = model;
                return true;
            }
            catch (Exception ex)
            {
                _lastError = ex.Message;
                return false;
            }
        }

        public async Task<byte[]> ProcessAsync(
            byte[] inputData,
            double scale,
            int denoise = -1,
            bool tta = false,
            int tileSize = 0,
            CancellationToken cancellationToken = default)
        {
            if (!_isInitialized)
                throw new InvalidOperationException("Engine not initialized");

            // 模拟处理时间
            var processingTime = tta ? 2000 : 1000;
            await Task.Delay(processingTime, cancellationToken);

            // 返回原始数据（模拟模式）
            return inputData;
        }

        public async Task<byte[]> ProcessToSizeAsync(
            byte[] inputData,
            int targetWidth,
            int targetHeight,
            int denoise = -1,
            bool tta = false,
            int tileSize = 0,
            CancellationToken cancellationToken = default)
        {
            if (!_isInitialized)
                throw new InvalidOperationException("Engine not initialized");

            // 模拟处理
            await Task.Delay(1000, cancellationToken);
            return inputData;
        }

        public string GetLastError() => _lastError;

        public void Dispose()
        {
            _isInitialized = false;
        }
    }

    /// <summary>
    /// 引擎工厂
    /// </summary>
    public static class SuperResolutionEngineFactory
    {
        /// <summary>
        /// 创建引擎实例
        /// </summary>
        public static ISuperResolutionEngine CreateEngine(SuperResolutionType type)
        {
            return type switch
            {
                SuperResolutionType.None => throw new ArgumentException("Cannot create engine for None type"),
                
                // 使用 Python sr-vulkan 引擎 (picacg-qt 同款)
                SuperResolutionType.Waifu2x => new PythonSuperResolutionEngine(),
                SuperResolutionType.RealESRGAN => new PythonSuperResolutionEngine(),
                SuperResolutionType.RealCUGAN => new PythonSuperResolutionEngine(),
                
                // 兜底返回模拟引擎
                _ => new MockSuperResolutionEngine(),
            };
        }

        /// <summary>
        /// 获取默认引擎
        /// </summary>
        public static ISuperResolutionEngine GetDefaultEngine()
        {
            // 优先使用 Python 引擎
            var pythonEngine = new PythonSuperResolutionEngine();
            if (pythonEngine.IsAvailable)
            {
                return pythonEngine;
            }

            // 如果 Python 不可用,返回模拟引擎
            return new MockSuperResolutionEngine();
        }
    }
}
