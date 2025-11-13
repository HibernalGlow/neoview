using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace NeeView.SuperResolution
{
    /// <summary>
    /// 超分辨率任务信息
    /// </summary>
    public class SuperResolutionTask
    {
        public int TaskId { get; set; }
        public string InputPath { get; set; } = "";
        public byte[]? InputData { get; set; }
        public string OutputPath { get; set; } = "";
        public SuperResolutionConfig Config { get; set; } = new();
        public SuperResolutionStatus Status { get; set; } = SuperResolutionStatus.Pending;
        public string ErrorMessage { get; set; } = "";
        public double ProcessingTime { get; set; }
        public int Progress { get; set; }
        public Action<byte[], SuperResolutionStatus, double>? Callback { get; set; }
        public CancellationTokenSource? CancellationTokenSource { get; set; }
    }

    /// <summary>
    /// 超分辨率处理结果
    /// </summary>
    public class SuperResolutionResult
    {
        public bool Success { get; set; }
        public byte[]? OutputData { get; set; }
        public string OutputPath { get; set; } = "";
        public double ProcessingTime { get; set; }
        public string ErrorMessage { get; set; } = "";
        public int OriginalWidth { get; set; }
        public int OriginalHeight { get; set; }
        public int OutputWidth { get; set; }
        public int OutputHeight { get; set; }
    }

    /// <summary>
    /// 超分辨率服务接口
    /// </summary>
    public interface ISuperResolutionService
    {
        /// <summary>
        /// 初始化服务
        /// </summary>
    Task<bool> InitializeAsync(int gpuId = 0, bool force = false);

        /// <summary>
        /// 检查是否可用
        /// </summary>
        bool IsAvailable { get; }

    /// <summary>
    /// 当前可用的运算设备列表。
    /// </summary>
    System.Collections.Generic.IReadOnlyList<SuperResolutionDeviceInfo> AvailableDevices { get; }

        /// <summary>
        /// 获取错误信息
        /// </summary>
        string GetLastError();

        /// <summary>
        /// 处理图片数据
        /// </summary>
        /// <param name="inputData">输入图片数据</param>
        /// <param name="config">配置</param>
        /// <param name="cancellationToken">取消令牌</param>
        /// <returns>处理结果</returns>
        Task<SuperResolutionResult> ProcessAsync(
            byte[] inputData, 
            SuperResolutionConfig config, 
            CancellationToken cancellationToken = default);

        /// <summary>
        /// 处理图片文件
        /// </summary>
        /// <param name="inputPath">输入文件路径</param>
        /// <param name="outputPath">输出文件路径</param>
        /// <param name="config">配置</param>
        /// <param name="cancellationToken">取消令牌</param>
        /// <returns>处理结果</returns>
        Task<SuperResolutionResult> ProcessFileAsync(
            string inputPath, 
            string outputPath, 
            SuperResolutionConfig config, 
            CancellationToken cancellationToken = default);

        /// <summary>
        /// 添加任务到队列
        /// </summary>
        int AddTask(SuperResolutionTask task);

        /// <summary>
        /// 取消任务
        /// </summary>
        void CancelTask(int taskId);

        /// <summary>
        /// 取消所有任务
        /// </summary>
        void CancelAllTasks();

        /// <summary>
        /// 获取任务状态
        /// </summary>
        SuperResolutionTask? GetTask(int taskId);

        /// <summary>
        /// 清理资源
        /// </summary>
        void Dispose();
    }
}
