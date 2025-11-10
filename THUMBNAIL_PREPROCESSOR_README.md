# NeoView 缩略图预处理器

NeoView 支持预处理文件夹和压缩包的缩略图，以提升浏览时的性能。缩略图以 base64 格式存储在 SQLite 数据库中。

## 功能特性

- 🚀 **预缓存缩略图**：提前生成并缓存缩略图，避免实时生成时的卡顿
- 🗄️ **SQLite 数据库存储**：使用 SQLite 数据库存储缩略图数据，支持高效查询和索引
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

### Python版本

```bash
# 基本用法
python thumbnail_preprocessor.py "D:\Images"

# 递归处理子目录
python thumbnail_preprocessor.py "D:\Images" --recursive

# 自定义尺寸并显示详细进度
python thumbnail_preprocessor.py "D:\Images" --size 128 --recursive --verbose

# 指定自定义缓存目录
python thumbnail_preprocessor.py "D:\Images" --cache-dir "D:\MyCache"

# 查看帮助
python thumbnail_preprocessor.py --help
```

### Python版本批处理脚本

#### Windows

```bash
# 基本用法（缩略图默认保存到 D:\scoop\apps\neoview\thumb）
preprocess_thumbnails_py.bat "D:\Images"

# 递归处理子目录
preprocess_thumbnails_py.bat "D:\Images" --recursive

# 自定义尺寸并显示详细进度
preprocess_thumbnails_py.bat "D:\Images" --size 128 --recursive --verbose

# 指定自定义缓存目录
preprocess_thumbnails_py.bat "D:\Images" --cache-dir "D:\MyCache"
```

#### Linux/macOS

```bash
# 基本用法（缩略图默认保存到系统缓存目录）
./preprocess_thumbnails_py.sh "/home/user/Images"

# 递归处理子目录
./preprocess_thumbnails_py.sh "/home/user/Images" --recursive

# 自定义尺寸并显示详细进度
./preprocess_thumbnails_py.sh "/home/user/Images" --size 128 --recursive --verbose

# 指定自定义缓存目录
./preprocess_thumbnails_py.sh "/home/user/Images" --cache-dir "/tmp/cache"
```

## Python版本依赖

在使用Python版本之前，需要安装所需的依赖包：

```bash
pip install -r requirements.txt
```

### 依赖包说明

- **Pillow**: 图像处理库，支持多种图片格式
- **rarfile**: RAR压缩包处理
- **py7zr**: 7Z压缩包处理
- **platformdirs**: 跨平台目录管理

## 缓存位置

缩略图以base64编码格式存储在SQLite数据库中：
- **数据库文件**: `thumbnails.db`
- **默认位置**: `D:\scoop\apps\neoview\thumb\thumbnails.db`

可以通过 `--cache-dir` 参数自定义数据库目录：
```bash
# 使用自定义数据库目录
python thumbnail_preprocessor.py "D:\Images" --cache-dir "E:\MyThumbnails"
```

## 参数说明

### Rust版本参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `path` | 要处理的目录路径 | 必需 |
| `size` | 缩略图最大尺寸（像素） | 256 |
| `recursive` | 是否递归处理子目录 | false |
| `verbose` | 是否显示详细进度 | false |

### Python版本参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `path` | 要处理的目录路径 | 必需 |
| `--size` | 缩略图最大尺寸（像素） | 256 |
| `--recursive` | 是否递归处理子目录 | false |
| `--verbose` | 是否显示详细进度 | false |
| `--cache-dir` | 自定义数据库目录路径 | `D:\scoop\apps\neoview\thumb` |

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

缩略图以base64编码格式存储在SQLite数据库中：
- **数据库文件**: `thumbnails.db`
- **默认位置**: `D:\scoop\apps\neoview\thumb\thumbnails.db`

可以通过 `--cache-dir` 参数自定义数据库目录：
```bash
# 使用自定义数据库目录
python thumbnail_preprocessor.py "D:\Images" --cache-dir "E:\MyThumbnails"
```

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
# 删除数据库文件
# Windows (默认位置)
del "D:\scoop\apps\neoview\thumb\thumbnails.db"

# Linux/macOS (系统缓存目录)
rm -f ~/.cache/neoview/thumbnails.db

# 或删除自定义位置的数据库文件
rm -f /path/to/your/custom/cache/thumbnails.db
```