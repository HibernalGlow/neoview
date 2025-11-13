using System;

namespace NeeView.SuperResolution
{
    /// <summary>
    /// 超分辨率模型信息 (动态从sr-vulkan读取)
    /// </summary>
    public class SuperResolutionModelInfo
    {
        /// <summary>
        /// 模型名称 (如 "MODEL_WAIFU2X_ANIME_UP2X_DENOISE1X")
        /// </summary>
        public string Name { get; set; } = "";

        /// <summary>
        /// 模型ID (sr-vulkan内部整数常量值)
        /// </summary>
        public int Id { get; set; }

        /// <summary>
        /// 显示名称 (从Name清理后的友好名称)
        /// </summary>
        public string DisplayName { get; set; } = "";

        /// <summary>
        /// 缩放倍数 (从模型名提取,如UP2X→2)
        /// </summary>
        public int Scale { get; set; }

        /// <summary>
        /// 降噪等级 (-1=无, 0-3=降噪等级)
        /// </summary>
        public int DenoiseLevel { get; set; } = -1;

        /// <summary>
        /// 是否启用TTA
        /// </summary>
        public bool IsTTA { get; set; }

        public SuperResolutionModelInfo()
        {
        }

        public SuperResolutionModelInfo(string name, int id)
        {
            Name = name;
            Id = id;
            DisplayName = FormatDisplayName(name);
            Scale = ExtractScale(name);
            DenoiseLevel = ExtractDenoiseLevel(name);
            IsTTA = name.Contains("_TTA", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// 从模型名提取缩放倍数
        /// </summary>
        private static int ExtractScale(string modelName)
        {
            if (modelName.Contains("UP4X", StringComparison.OrdinalIgnoreCase))
                return 4;
            if (modelName.Contains("UP3X", StringComparison.OrdinalIgnoreCase))
                return 3;
            if (modelName.Contains("UP2X", StringComparison.OrdinalIgnoreCase))
                return 2;
            if (modelName.Contains("UP1X", StringComparison.OrdinalIgnoreCase))
                return 1;
            return 2; // 默认2x
        }

        /// <summary>
        /// 从模型名提取降噪等级
        /// </summary>
        private static int ExtractDenoiseLevel(string modelName)
        {
            if (modelName.Contains("DENOISE3X", StringComparison.OrdinalIgnoreCase))
                return 3;
            if (modelName.Contains("DENOISE2X", StringComparison.OrdinalIgnoreCase))
                return 2;
            if (modelName.Contains("DENOISE1X", StringComparison.OrdinalIgnoreCase))
                return 1;
            if (modelName.Contains("DENOISE0X", StringComparison.OrdinalIgnoreCase))
                return 0;
            return -1; // 无降噪
        }

        /// <summary>
        /// 格式化显示名称 (移除MODEL_前缀,替换下划线)
        /// </summary>
        private static string FormatDisplayName(string modelName)
        {
            var name = modelName;
            if (name.StartsWith("MODEL_", StringComparison.OrdinalIgnoreCase))
                name = name.Substring(6);
            
            // 替换下划线为空格
            name = name.Replace("_", " ");
            
            return name;
        }

        public override string ToString() => DisplayName;
    }
}
