# 模型和测试图片目录结构

## 目录结构

在缩略图根目录下创建以下目录结构：

```
thumbnails/
├── models/                 # 模型文件目录
│   ├── testimg/            # 测试图片目录
│   │   ├── test1.jpg       # 测试图片1
│   │   ├── test2.png       # 测试图片2
│   │   └── anime.jpg       # 动漫测试图片
│   ├── realesrgan-x4plus.bin
│   ├── realesrgan-x4plus.param
│   ├── realesrgan-x4plus-anime.bin
│   ├── realesrgan-x4plus-anime.param
│   ├── cunet.bin
│   ├── cunet.param
│   ├── upconv_7_anime_style_art_rgb.bin
│   ├── upconv_7_anime_style_art_rgb.param
│   ├── se.bin
│   ├── se.param
│   └── anime-denoise.bin
│       └── anime-denoise.param
└── generic-upscale/        # 通用超分缓存目录
    ├── [缓存文件...]
```

## 模型文件说明

### Real-ESRGAN 模型
- `realesrgan-x4plus.bin/.param`: 通用模型，适合真实世界图像
- `realesrgan-x4plus-anime.bin/.param`: 动漫模型，专门针对动漫图像优化

### Waifu2x 模型
- `cunet.bin/.param`: 标准模型，通用动漫图像
- `upconv_7_anime_style_art_rgb.bin/.param`: 动漫风格艺术模型

### Real-CUGAN 模型
- `se.bin/.param`: 标准模型
- `anime-denoise.bin/.param`: 动漫降噪模型

## 测试图片

将测试图片放在 `models/testimg/` 目录下：

1. **真实照片**: `test1.jpg` - 用于测试通用模型
2. **动漫图片**: `anime.jpg` - 用于测试动漫专用模型
3. **线条艺术**: `test2.png` - 用于测试线条处理能力

## 使用方法

1. 在右侧边栏的超分面板中切换到"算法测试"标签
2. 点击"测试所有算法"按钮测试所有可用的算法
3. 选择特定算法后点击"测试 X 模型"按钮测试该算法的不同模型
4. 点击"打开模型文件夹"按钮可以直接打开模型目录

## 日志输出

测试过程中的详细日志会在控制台中显示，包括：
- 算法可用性检查
- 文件信息（大小、格式等）
- 处理参数
- 执行时间
- 输出文件信息
- 错误信息（如果有）

## 注意事项

1. 确保模型文件是 NCNN 格式（.bin 和 .param 文件对）
2. 测试图片建议使用小尺寸图片（如 512x512）以加快测试速度
3. 不同算法需要安装对应的命令行工具：
   - Real-ESRGAN: `realesrgan-ncnn-vulkan`
   - Waifu2x: `waifu2x-ncnn-vulkan`
   - Real-CUGAN: `realcugan-ncnn-vulkan`