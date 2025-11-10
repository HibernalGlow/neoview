# NeoView 缩略图预处理器

NeoView 支持预处理文件夹和压缩包的缩略图，以提升浏览时的性能。

## 功能特性

- 🚀 **预缓存缩略图**：提前生成并缓存缩略图，避免实时生成时的卡顿
- 📁 **智能查找**：自动从文件夹中查找第一张图片，或从压缩包中提取第一张图片
- 🔄 **批量处理**：支持批量处理整个目录树
- 📊 **进度显示**：实时显示处理进度和统计信息
- 🎯 **自定义尺寸**：可自定义缩略图尺寸

## 使用方法

### Windows

```bash
# 基本用法
preprocess_thumbnails.bat "D:\Images"

# 递归处理子目录
preprocess_thumbnails.bat "D:\Images" --recursive

# 自定义尺寸并显示详细进度
preprocess_thumbnails.bat "D:\Images" --size 128 --recursive --verbose

# 查看帮助
preprocess_thumbnails.bat --help
```

### Linux/macOS

```bash
# 基本用法
./preprocess_thumbnails.sh "/home/user/Images"

# 递归处理子目录
./preprocess_thumbnails.sh "/home/user/Images" --recursive

# 自定义尺寸并显示详细进度
./preprocess_thumbnails.sh "/home/user/Images" --size 128 --recursive --verbose

# 查看帮助
./preprocess_thumbnails.sh --help
```

### 直接使用 Cargo

```bash
# 进入 src-tauri 目录
cd src-tauri

# 基本用法
cargo run --release -- preprocess --path "/path/to/images"

# 完整参数示例
cargo run --release -- preprocess --path "/path/to/images" --size 256 --recursive --verbose
```

## 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `path` | 要处理的目录路径 | 必需 |
| `size` | 缩略图最大尺寸（像素） | 256 |
| `recursive` | 是否递归处理子目录 | false |
| `verbose` | 是否显示详细进度 | false |

## 处理逻辑

### 文件夹处理
1. 扫描文件夹中的所有文件
2. 查找第一张支持的图片文件（按文件名排序）
3. 如果没有图片，查找第一个压缩包文件
4. 从压缩包中提取第一张图片
5. 生成缩略图并缓存

### 压缩包处理
1. 扫描压缩包内容
2. 查找第一张图片文件
3. 提取图片数据
4. 生成缩略图并缓存

## 支持的格式

### 图片格式
- JPEG/JPG
- PNG
- GIF
- BMP
- WebP
- AVIF
- JXL

### 压缩包格式
- ZIP/CBZ
- RAR/CBR
- 7Z/CB7

## 缓存位置

缩略图缓存在系统缓存目录中：
- **Windows**: `%LOCALAPPDATA%\neoview\thumbnails\`
- **Linux**: `~/.cache/neoview/thumbnails/`
- **macOS**: `~/Library/Caches/neoview/thumbnails/`

## 注意事项

- 预处理过程可能需要一些时间，取决于文件数量和大小
- 建议在系统空闲时运行预处理
- 预处理后的缩略图会永久缓存，直到手动清除
- 如果源文件发生变化，需要重新运行预处理

## 故障排除

### 常见问题

1. **权限错误**: 确保对目标目录有读取权限
2. **磁盘空间不足**: 缩略图缓存需要额外的磁盘空间
3. **处理速度慢**: 尝试减少 `--size` 参数或不使用 `--recursive`

### 清除缓存

如果需要清除所有缓存的缩略图：

```bash
# 删除缓存目录
# Windows
rmdir /s "%LOCALAPPDATA%\neoview\thumbnails"

# Linux/macOS
rm -rf ~/.cache/neoview/thumbnails
```