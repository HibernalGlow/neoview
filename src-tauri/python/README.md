# Python + pyvips 缩略图系统

## 概述

这是一个高性能的缩略图生成系统，使用 Python + pyvips 处理图片，支持压缩包首图早停扫描，通过 SQLite BLOB 存储二进制 WebP 数据。

## 架构

1. **Python FastAPI 服务** (`thumbnail_service.py`)
   - 高性能缩略图生成
   - 压缩包首图早停扫描
   - SQLite BLOB 存储

2. **Rust 客户端** (`py_thumb_client.rs`)
   - HTTP 通信
   - 进程管理
   - 事件桥接

3. **前端集成** (`python_thumbnail.ts`, `thumbnailManager.ts`)
   - 二进制流处理
   - Blob URL 管理
   - 自动降级

## 安装依赖

### Python 依赖
```bash
cd src-tauri/python
pip install -r requirements.txt
```

或手动安装：
```bash
pip install fastapi uvicorn pyvips pydantic
```

### Rust 依赖
已包含在 `Cargo.toml` 中。

## 使用方法

### 1. 启动 Python 服务
```typescript
import { initPythonService } from '$lib/utils/thumbnailManager';

// 启动服务（自动降级）
await initPythonService();
```

### 2. 获取缩略图
```typescript
import { pythonThumbnailAPI } from '$lib/api/python_thumbnail';

// 获取二进制数据
const bytes = await pythonThumbnailAPI.getThumbnailBlob(filePath);
const url = pythonThumbnailAPI.blobUrlFromBytes(bytes);

// 使用后释放
pythonThumbnailAPI.revokeBlobUrl(url);
```

### 3. 批量预加载
```typescript
const entries = [
  { path: '/path/to/image1.jpg', is_image: true },
  { path: '/path/to/image2.jpg', is_image: true }
];

const count = await pythonThumbnailAPI.prefetchThumbnails(dirPath, entries);
```

## 配置选项

```typescript
configureThumbnailManager({
  addThumbnail: (path, url) => { /* 处理缩略图 */ },
  maxConcurrentLocal: 4,      // 本地文件并发数
  maxConcurrentArchive: 2,    // 压缩包并发数
  usePythonService: true      // 是否使用 Python 服务
});
```

## 性能优化

1. **压缩包早停**：只处理首张图片，大幅提升性能
2. **内存缓存**：SQLite BLOB + 内存双重缓存
3. **二进制流**：避免 base64 编码开销
4. **并发控制**：智能调度，避免资源竞争

## 故障排除

### Python 服务启动失败
- 检查依赖：`python check_deps.py`
- 查看日志：Python 服务输出会显示在控制台
- 自动降级：失败时会自动切换到原有实现

### 性能问题
- 调整并发数：`configureThumbnailManager({ maxConcurrentLocal: 8 })`
- 检查磁盘空间：确保有足够空间存储缓存
- 监控内存：大量图片可能消耗较多内存

## 测试

运行测试脚本：
```bash
cd src-tauri/python
python test_thumbnail_system.py
```

## 注意事项

1. **pyvips 依赖**：需要安装 libvips 库
   - Windows：下载预编译版本
   - macOS：`brew install vips`
   - Linux：`apt-get install libvips-tools`

2. **端口占用**：默认使用 8899 端口
   - 可在 `thumbnail_service.py` 中修改

3. **数据库迁移**：首次运行会自动添加 content 字段
   - 旧数据会保留，新数据使用 BLOB 存储