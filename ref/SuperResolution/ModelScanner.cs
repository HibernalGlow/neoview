using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace NeeView.SuperResolution
{
    /// <summary>
    /// 模型文件扫描器 - 扫描模型文件夹并识别可用的模型
    /// </summary>
    public class ModelScanner
    {
        /// <summary>
        /// 扫描模型文件夹,返回识别到的模型信息
        /// </summary>
        public static List<DetectedModel> ScanModelDirectory(string modelPath)
        {
            var detectedModels = new List<DetectedModel>();

            if (string.IsNullOrEmpty(modelPath) || !Directory.Exists(modelPath))
            {
                SuperResolutionLogger.Warning($"模型路径无效或不存在: {modelPath}");
                return detectedModels;
            }

            SuperResolutionLogger.Info($"开始扫描模型文件夹: {modelPath}");

            try
            {
                // 查找所有 .param 和 .bin 文件对
                var paramFiles = Directory.GetFiles(modelPath, "*.param", SearchOption.AllDirectories);
                SuperResolutionLogger.Info($"找到 {paramFiles.Length} 个 .param 文件");

                foreach (var paramFile in paramFiles)
                {
                    var modelName = Path.GetFileNameWithoutExtension(paramFile);
                    var binFile = Path.Combine(Path.GetDirectoryName(paramFile)!, $"{modelName}.bin");

                    if (File.Exists(binFile))
                    {
                        var model = AnalyzeModelFile(modelName, paramFile, binFile);
                        detectedModels.Add(model);
                        SuperResolutionLogger.DebugLog($"  ✓ 识别模型: {modelName} ({model.ModelType})");
                    }
                    else
                    {
                        SuperResolutionLogger.Warning($"  ✗ 缺少 .bin 文件: {modelName}");
                    }
                }

                SuperResolutionLogger.Info($"扫描完成,共识别 {detectedModels.Count} 个可用模型");
            }
            catch (Exception ex)
            {
                SuperResolutionLogger.Error($"扫描模型文件夹失败: {ex.Message}", ex);
            }

            return detectedModels.OrderBy(m => m.ModelType).ThenBy(m => m.ModelName).ToList();
        }

        /// <summary>
        /// 分析模型文件,提取模型信息
        /// </summary>
        private static DetectedModel AnalyzeModelFile(string modelName, string paramFile, string binFile)
        {
            var model = new DetectedModel
            {
                ModelName = modelName,
                ParamFilePath = paramFile,
                BinFilePath = binFile,
                ParamFileSize = new FileInfo(paramFile).Length,
                BinFileSize = new FileInfo(binFile).Length
            };

            // 根据文件名判断模型类型
            var upperName = modelName.ToUpperInvariant();

            if (upperName.Contains("WAIFU2X"))
            {
                model.ModelType = ModelType.Waifu2x;
                
                // 提取缩放倍数
                if (upperName.Contains("UP1X")) model.Scale = 1;
                else if (upperName.Contains("UP2X")) model.Scale = 2;
                else if (upperName.Contains("UP3X")) model.Scale = 3;
                else if (upperName.Contains("UP4X")) model.Scale = 4;

                // 提取降噪等级
                if (upperName.Contains("DENOISE0X")) model.DenoiseLevel = 0;
                else if (upperName.Contains("DENOISE1X")) model.DenoiseLevel = 1;
                else if (upperName.Contains("DENOISE2X")) model.DenoiseLevel = 2;
                else if (upperName.Contains("DENOISE3X")) model.DenoiseLevel = 3;

                // 检测是否有 TTA
                model.SupportsTTA = upperName.Contains("TTA");

                // 判断是 ANIME 还是 CUNET
                if (upperName.Contains("ANIME"))
                    model.SubType = "Anime";
                else if (upperName.Contains("CUNET"))
                    model.SubType = "CUNet";
                else if (upperName.Contains("PHOTO"))
                    model.SubType = "Photo";
            }
            else if (upperName.Contains("REALESRGAN"))
            {
                model.ModelType = ModelType.RealESRGAN;
                
                if (upperName.Contains("UP2X")) model.Scale = 2;
                else if (upperName.Contains("UP3X")) model.Scale = 3;
                else if (upperName.Contains("UP4X")) model.Scale = 4;

                model.SupportsTTA = upperName.Contains("TTA");

                if (upperName.Contains("ANIMEVIDEO"))
                    model.SubType = "AnimeVideo";
                else if (upperName.Contains("ANIMEILLUST"))
                    model.SubType = "AnimeIllust";
            }
            else if (upperName.Contains("REALCUGAN"))
            {
                model.ModelType = ModelType.RealCUGAN;
                
                if (upperName.Contains("UP2X")) model.Scale = 2;
                else if (upperName.Contains("UP3X")) model.Scale = 3;
                else if (upperName.Contains("UP4X")) model.Scale = 4;

                if (upperName.Contains("DENOISE1X")) model.DenoiseLevel = 1;
                else if (upperName.Contains("DENOISE2X")) model.DenoiseLevel = 2;
                else if (upperName.Contains("DENOISE3X")) model.DenoiseLevel = 3;

                model.SupportsTTA = upperName.Contains("TTA");

                if (upperName.Contains("PRO"))
                    model.SubType = "Pro";
                else if (upperName.Contains("SE"))
                    model.SubType = "SE";

                if (upperName.Contains("CONSERVATIVE"))
                    model.SubType += " (Conservative)";
                else if (upperName.Contains("NOCROP"))
                    model.SubType += " (NoCrop)";
            }

            return model;
        }

        /// <summary>
        /// 获取模型的显示名称
        /// </summary>
        public static string GetDisplayName(DetectedModel model)
        {
            var parts = new List<string>();

            parts.Add(model.ModelType.ToString());

            if (!string.IsNullOrEmpty(model.SubType))
                parts.Add(model.SubType);

            if (model.Scale > 0)
                parts.Add($"{model.Scale}x");

            if (model.DenoiseLevel >= 0)
                parts.Add($"Denoise{model.DenoiseLevel}");

            if (model.SupportsTTA)
                parts.Add("TTA");

            return string.Join(" - ", parts);
        }
    }

    /// <summary>
    /// 检测到的模型信息
    /// </summary>
    public class DetectedModel
    {
        public string ModelName { get; set; } = "";
        public ModelType ModelType { get; set; } = ModelType.Unknown;
        public string SubType { get; set; } = "";
        public int Scale { get; set; } = 0;
        public int DenoiseLevel { get; set; } = -1;
        public bool SupportsTTA { get; set; } = false;
        public string ParamFilePath { get; set; } = "";
        public string BinFilePath { get; set; } = "";
        public long ParamFileSize { get; set; }
        public long BinFileSize { get; set; }

        public string DisplayName => ModelScanner.GetDisplayName(this);

        public override string ToString() => DisplayName;
    }

    /// <summary>
    /// 模型类型
    /// </summary>
    public enum ModelType
    {
        Unknown,
        Waifu2x,
        RealESRGAN,
        RealCUGAN
    }
}
