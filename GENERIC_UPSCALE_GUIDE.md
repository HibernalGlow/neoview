# 通用超分器使用指南

## 概述

新的通用超分器支持三种主流的超分算法：
- **Real-ESRGAN**: 适合真实世界图像和动漫
- **Waifu2x**: 专门针对动漫/漫画图像优化
- **Real-CUGAN**: 轻量级动漫超分算法

## 前端调用示例

### 1. 初始化通用超分管理器

```javascript
// 在应用启动时初始化
await invoke('init_generic_upscale_manager', {
  thumbnailPath: '/path/to/thumbnails'
});
```

### 2. 获取可用的算法列表

```javascript
const algorithms = await invoke('get_available_algorithms');
console.log(algorithms); // ["realesrgan", "waifu2x", "realcugan"]
```

### 3. 获取算法的默认模型

```javascript
const models = await invoke('get_algorithm_default_models', {
  algorithm: 'realesrgan'
});
console.log(models); // ["realesrgan-x4plus", "realesrgan-x4plus-anime"]
```

### 4. 执行超分处理

```javascript
// Real-ESRGAN 示例
const result = await invoke('generic_upscale_image', {
  imagePath: '/path/to/image.jpg',
  savePath: '/path/to/output.webp',
  algorithm: 'realesrgan',
  model: 'realesrgan-x4plus-anime', // 动漫模型
  gpuId: '0',
  tileSize: '0', // 0 = auto
  tta: false,
  noiseLevel: '1', // 对 Real-ESRGAN 影响较小
  numThreads: '1'
});

// Waifu2x 示例
const result = await invoke('generic_upscale_image', {
  imagePath: '/path/to/anime.jpg',
  savePath: '/path/to/output.webp',
  algorithm: 'waifu2x',
  model: 'upconv_7_anime_style_art_rgb',
  gpuId: '0',
  tileSize: '0',
  tta: false,
  noiseLevel: '2', // 降噪等级 0-3
  numThreads: '4'
});

// Real-CUGAN 示例
const result = await invoke('generic_upscale_image', {
  imagePath: '/path/to/anime.jpg',
  savePath: '/path/to/output.webp',
  algorithm: 'realcugan',
  model: 'anime-denoise',
  gpuId: '0',
  tileSize: '0',
  tta: false,
  noiseLevel: '1', // 降噪等级 0-3
  numThreads: '4'
});
```

### 5. 获取超分保存路径（用于预计算）

```javascript
const savePath = await invoke('get_generic_upscale_save_path', {
  imagePath: '/path/to/image.jpg',
  algorithm: 'realesrgan',
  model: 'realesrgan-x4plus-anime',
  gpuId: '0',
  tileSize: '0',
  tta: false,
  noiseLevel: '1',
  numThreads: '1'
});
```

### 6. 缓存管理

```javascript
// 获取缓存统计
const stats = await invoke('get_generic_upscale_cache_stats');
console.log(stats); // { total_files: 10, total_size: 1048576, cache_dir: "..." }

// 清理过期缓存（30天）
const removedCount = await invoke('cleanup_generic_upscale_cache', {
  maxAgeDays: 30
});
```

## 模型文件管理

### 放置自定义模型

1. 在缩略图目录下创建 `models` 文件夹
2. 将模型文件（`.bin` 和 `.param`）放入该文件夹
3. 调用时使用模型名称（不含扩展名）

```
/path/to/thumbnails/
├── models/
│   ├── my-custom-model.bin
│   ├── my-custom-model.param
│   ├── realesrgan-x4plus.bin
│   └── realesrgan-x4plus.param
└── generic-upscale/
    └── [缓存文件]
```

## 算法选择建议

### Real-ESRGAN
- **适用场景**: 真实照片、复杂图像、高质量动漫
- **默认模型**: `realesrgan-x4plus`
- **动漫模型**: `realesrgan-x4plus-anime`
- **缩放倍数**: 通常为 4x

### Waifu2x
- **适用场景**: 动漫、漫画、线条艺术
- **推荐模型**: `cunet` 或 `upconv_7_anime_style_art_rgb`
- **降噪等级**: 0-3（数值越高降噪越强）
- **缩放倍数**: 通常为 2x

### Real-CUGAN
- **适用场景**: 动漫、轻量级处理
- **推荐模型**: `se` 或 `anime-denoise`
- **降噪等级**: 0-3
- **缩放倍数**: 通常为 2x

## 性能优化建议

1. **GPU 选择**: 使用 `-g` 参数指定 GPU，多 GPU 环境下可并行处理
2. **Tile Size**: 大图像使用较小的 tile size（如 200）避免内存不足
3. **TTA 模式**: 开启 TTA 可提升质量但会增加处理时间
4. **线程数**: Waifu2x 和 Real-CUGAN 支持多线程，可设置 `-j` 参数

## 错误处理

```javascript
try {
  const result = await invoke('generic_upscale_image', { /* 参数 */ });
  // 处理结果
} catch (error) {
  if (error.includes('未安装或不可用')) {
    console.error('请安装对应的超分工具');
  } else if (error.includes('输入文件不存在')) {
    console.error('图片文件路径错误');
  }
  // 其他错误处理
}
```

## 注意事项

1. 确保系统已安装对应的超分工具（realesrgan-ncnn-vulkan、waifu2x-ncnn-vulkan、realcugan-ncnn-vulkan）
2. 模型文件必须与算法匹配
3. 输出格式固定为 WebP，可减少文件大小
4. 缓存文件名包含所有参数，确保不同参数的缓存不冲突