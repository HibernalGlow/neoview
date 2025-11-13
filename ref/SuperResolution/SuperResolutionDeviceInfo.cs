using System;

namespace NeeView.SuperResolution
{
    /// <summary>
    /// 表示可用的超分辨率运算设备
    /// </summary>
    public sealed class SuperResolutionDeviceInfo
    {
        public SuperResolutionDeviceInfo(int id, string name, string? description = null)
        {
            Id = id;
            Name = string.IsNullOrWhiteSpace(name) ? "Unknown Device" : name.Trim();
            Description = description?.Trim() ?? string.Empty;
        }

        /// <summary>
        /// 设备编号。-1 表示 CPU，>=0 表示 GPU 索引。
        /// </summary>
        public int Id { get; }

        /// <summary>
        /// 设备名称。
        /// </summary>
        public string Name { get; }

        /// <summary>
        /// 设备描述（可选）。
        /// </summary>
        public string Description { get; }

        /// <summary>
        /// 是否为 GPU 设备。
        /// </summary>
        public bool IsGpu => Id >= 0;

        /// <summary>
        /// 用户界面显示名称。
        /// </summary>
        public string DisplayName
        {
            get
            {
                if (string.IsNullOrEmpty(Description))
                {
                    return IsGpu ? $"GPU {Id}: {Name}" : Name;
                }

                return IsGpu
                    ? $"GPU {Id}: {Name} ({Description})"
                    : $"{Name} ({Description})";
            }
        }

        public override string ToString() => DisplayName;
    }
}
