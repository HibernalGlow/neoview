# 超分辨率功能安装指南

## 概述

NeeView 超分辨率功能基于 **picacg-qt** 使用的 **sr-vulkan** Python 库,可实现高质量的图片放大。

## 必需组件

### 1. Python 环境
- **Python 3.10 或 3.11** (推荐 3.11)
- 下载地址: https://www.python.org/downloads/

安装时务必勾选:
- ✅ Add Python to PATH
- ✅ Install pip

### 2. 安装 sr-vulkan 及模型

打开命令提示符(CMD)或 PowerShell,执行:

```powershell
# 安装核心库
pip install sr-vulkan

# 安装模型包 (可选择需要的)
pip install sr-vulkan-model-waifu2x          # Waifu2x 动漫图片
pip install sr-vulkan-model-realesrgan       # RealESRGAN 通用图片
pip install sr-vulkan-model-realcugan        # RealCUGAN 动漫视频
```

### 3. GPU 支持 (推荐)

sr-vulkan 使用 Vulkan API 加速,支持:
- **NVIDIA** 显卡 (GeForce GTX 600+)
- **AMD** 显卡 (GCN架构+)
- **Intel** 核显 (Gen7+)

确保显卡驱动为最新版本。

## 配置 NeeView

### 方法1: 自动检测 (推荐)

如果 Python 安装时添加到了 PATH,NeeView 会自动检测。

### 方法2: 手动配置

如果自动检测失败,需要在 NeeView 设置中指定 Python 路径:

1. 查找 Python 安装路径:
   ```powershell
   python -c "import sys; print(sys.prefix)"
   ```
   示例输出: `C:\Python311`

2. 在 NeeView 配置文件中添加:
   ```json
   {
     "SuperResolution": {
       "PythonPath": "C:\\Python311"
     }
   }
   ```

## 验证安装

在 Python 中运行测试:

```python
import sr_vulkan
print("sr-vulkan version:", sr_vulkan.__version__)

# 查看可用模型
dir(sr_vulkan.sr_vulkan)
```

应该看到以下模型:
- `waifu2x_cunet`
- `waifu2x_upconv_7_anime_style_art_rgb`
- `realesrgan_animevideo`
- `realcugan_conservative`
- 等等

## 使用方法

1. **启动 NeeView**
2. **按 S+R** 打开超分辨率面板
3. **选择算法和模型**
   - Waifu2x: 适合动漫插画
   - RealESRGAN: 适合照片/真实图片
   - RealCUGAN: 适合动漫视频帧
4. **设置缩放参数**
   - 按倍数: 2x, 3x, 4x
   - 按目标尺寸: 自定义宽高
5. **点击"应用超分辨率"**

## 支持的模型

### Waifu2x 系列
- `Waifu2x CUNet`: 高质量动漫放大
- `Waifu2x UpConv7 Anime`: 快速动漫处理
- `Waifu2x UpConv7 Photo`: 照片处理

### RealESRGAN 系列
- `RealESRGAN AnimeVideo`: 动漫视频优化
- `RealESRGAN Plus`: 通用场景

### RealCUGAN 系列
- `RealCUGAN Conservative`: 保守模式(细节保留)
- `RealCUGAN Denoise3x`: 3倍降噪放大

## 高级选项

### TTA模式
Test-Time Augmentation,提高质量但速度慢8倍:
- ✅ 启用TTA: 最高质量
- ❌ 关闭TTA: 更快速度

### 输出格式
- PNG: 无损压缩(推荐)
- JPG: 有损压缩(更小)
- WebP: 现代格式
- BMP: 未压缩

## 常见问题

### Q: 提示 "Python 初始化失败"
**A:** 检查 Python 是否正确安装:
```powershell
python --version
pip --version
```

### Q: 提示 "ModuleNotFoundError: No module named 'sr_vulkan'"
**A:** 安装缺失的包:
```powershell
pip install sr-vulkan
```

### Q: 处理速度很慢
**A:** 
1. 确保安装了 GPU 驱动
2. 关闭 TTA 模式
3. 减少并发处理数
4. 使用更快的模型(UpConv7 比 CUNet 快)

### Q: 提示 "Vulkan driver not found"
**A:** 更新显卡驱动到最新版本

### Q: 内存不足
**A:**
1. 降低 Tile Size
2. 减少并发数
3. 处理较小的图片

## 性能参考

典型处理时间 (1920x1080 → 3840x2160):

| 显卡型号        | Waifu2x CUNet | RealESRGAN | RealCUGAN |
|----------------|---------------|------------|-----------|
| RTX 3060       | 2-3秒         | 1-2秒      | 3-4秒     |
| GTX 1660 Ti    | 4-5秒         | 2-3秒      | 5-6秒     |
| Intel UHD 630  | 15-20秒       | 10-15秒    | 20-25秒   |

## 更多信息

- **sr-vulkan GitHub**: https://github.com/k4yt3x/sr-vulkan
- **picacg-qt GitHub**: https://github.com/tonquer/picacg-qt
- **NeeView 文档**: https://bitbucket.org/neelabo/neeview/wiki/

## 卸载

如需移除超分辨率功能:

```powershell
pip uninstall sr-vulkan sr-vulkan-model-waifu2x sr-vulkan-model-realesrgan sr-vulkan-model-realcugan
```

---

**注意**: 首次使用时,模型会自动下载到 `%USERPROFILE%\.cache\sr-vulkan\`,约 50-200MB。
