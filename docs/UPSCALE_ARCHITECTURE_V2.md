# NeoView 超分架构 V2

## 概述

重构超分功能，参考缩略图和 StackView 的通信模型，实现后端主导的超分计算与预加载系统。

## 核心设计原则

1. **后端主导**：前端只发请求，后端负责条件检查、超分计算、缓存管理
2. **复用图片系统**：超分图作为普通图片进入 imagePool，复用现有缩放/视图功能
3. **本地缓存**：超分结果保存为本地文件，用 `convertFileSrc` 转 URL
4. **条件超分**：后端使用 WIC 读取图片尺寸，判断是否满足超分条件
5. **完全关闭**：关闭超分时彻底停止所有任务，不干涉任何显示

## 架构对比

### 旧架构问题

| 问题 | 描述 |
|------|------|
| 前端负担重 | 前端负责条件检查、进度管理、Blob 处理 |
| 独立显示层 | UpscaleLayer 独立于原图，需要单独处理缩放/旋转 |
| Blob 内存占用 | 超分结果通过 Blob URL 传输，占用大量内存 |
| Python 依赖 | AVIF/JXL 需要 Python 转换 |

### 新架构优势

| 优势 | 描述 |
|------|------|
| 后端主导 | 条件检查、缓存管理全在后端 |
| 复用系统 | 超分图进入 imagePool，复用缩放/视图 |
| 文件缓存 | 结果保存本地，`convertFileSrc` 转 URL |
| WIC 处理 | 直接用 WIC 处理 AVIF/JXL，无需 Python 转换 |

## 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                           前端                                   │
├─────────────────────────────────────────────────────────────────┤
│  StackView                                                      │
│     │                                                           │
│     ├─→ imagePool.get(pageIndex)  ←──────────────────────┐     │
│     │                                                     │     │
│     └─→ upscaleStore.request(pageIndex)                  │     │
│              │                                           │     │
│              ▼                                           │     │
│     ┌──────────────────┐                                │     │
│     │   upscaleStore   │                                │     │
│     │  - 管理状态      │   完成后调用                    │     │
│     │  - 缓存路径映射  │ ──────────────────────────────→│     │
│     └──────────────────┘   imagePool.setUpscaled()      │     │
│              │                                                  │
│              │ invoke                                           │
├──────────────│──────────────────────────────────────────────────┤
│              ▼                           后端                   │
│     ┌──────────────────┐                                       │
│     │  UpscaleService  │                                       │
│     │  - WIC 读尺寸    │                                       │
│     │  - 条件检查      │                                       │
│     │  - PyO3 超分     │                                       │
│     │  - 保存缓存      │                                       │
│     └──────────────────┘                                       │
│              │                                                  │
│              │ emit("upscale-ready")                           │
│              │ payload: { cachePath, pageIndex, ... }          │
│              ▼                                                  │
│     前端监听事件，更新 upscaleStore                             │
│     upscaleStore 通知 imagePool 替换槽位                        │
└─────────────────────────────────────────────────────────────────┘
```

## 文件结构

### 后端

```
src-tauri/src/core/
├── upscale_service.rs      # 超分服务（重构）
├── wic_decoder.rs          # WIC 解码器（添加 WebP 编码）
└── pyo3_upscaler.rs        # PyO3 超分器（复用）

src-tauri/src/commands/
└── upscale_service_commands.rs  # Tauri 命令
```

### 前端

```
src/lib/stackview/stores/
├── upscaleStore.svelte.ts  # 超分状态管理（简化）
└── imagePool.svelte.ts     # 图片池（添加超分替换方法）
```

## 缓存策略

### 缓存路径

```
{app_data}/upscale_cache/{image_hash}_sr[{model}_{scale}x].webp
```

示例：
```
C:\Users\xxx\AppData\Roaming\neoview\upscale_cache\
└── abc123_sr[cunet_2x].webp
```

### 缓存命中

1. 前端请求超分时，先检查本地缓存
2. 缓存命中：直接返回路径，`convertFileSrc` 转 URL
3. 缓存未命中：执行超分，保存缓存，返回路径

## 条件超分

### 条件类型

| 条件 | 描述 | 后端实现 |
|------|------|----------|
| 分辨率范围 | min/max width/height | WIC 读取尺寸 |
| 路径匹配 | 包含/排除特定路径 | 字符串匹配 |
| 文件类型 | 仅处理特定格式 | 扩展名检查 |
| 宽高比 | 只处理特定比例 | WIC 读取后计算 |

### 后端检查流程

```rust
fn check_conditions(&self, path: &str, width: u32, height: u32) -> bool {
    let settings = self.condition_settings.read().unwrap();
    
    if !settings.enabled {
        return true; // 未启用条件检查，全部通过
    }
    
    // 检查尺寸范围
    if !settings.check_dimensions(width, height) {
        return false;
    }
    
    // 检查宽高比
    if !settings.check_aspect_ratio(width, height) {
        return false;
    }
    
    // 检查路径匹配
    if !settings.check_path(path) {
        return false;
    }
    
    true
}
```

## WIC 处理流程

### 输入支持

WIC 原生支持（Windows 安装编解码器后）：
- AVIF
- JXL (JPEG XL)
- HEIC/HEIF
- WebP
- 常规格式（JPG, PNG, GIF, BMP, TIFF）

### 处理流程

```
输入文件 (AVIF/JXL/etc)
    │
    ▼
WIC 解码 → BGRA Bitmap
    │
    ▼
PyO3 超分 (接收 BGRA)
    │
    ▼
超分结果 (BGRA Bitmap)
    │
    ▼
WIC 编码 → WebP 文件
    │
    ▼
保存到缓存目录
```

### 为什么输出 WebP

1. **压缩率高**：同质量下文件更小
2. **WIC 支持**：Windows 原生支持编解码
3. **浏览器兼容**：WebView 完美支持
4. **无损/有损**：可选无损模式保留质量

## imagePool 集成

### 槽位结构扩展

```typescript
interface PoolEntry {
  url: string;           // 原图 URL
  upscaledUrl?: string;  // 超分图 URL（可选）
  useUpscaled: boolean;  // 是否使用超分图
  // ... 其他字段
}
```

### 替换方法

```typescript
class ImagePool {
  /** 设置超分图 URL */
  setUpscaled(pageIndex: number, cachePath: string) {
    const url = convertFileSrc(cachePath);
    const entry = this.pool.get(pageIndex);
    if (entry) {
      entry.upscaledUrl = url;
      entry.useUpscaled = true;
    }
  }
  
  /** 获取当前显示 URL */
  getDisplayUrl(pageIndex: number): string | null {
    const entry = this.pool.get(pageIndex);
    if (!entry) return null;
    return entry.useUpscaled && entry.upscaledUrl 
      ? entry.upscaledUrl 
      : entry.url;
  }
  
  /** 清除超分图 */
  clearUpscaled(pageIndex: number) {
    const entry = this.pool.get(pageIndex);
    if (entry) {
      entry.upscaledUrl = undefined;
      entry.useUpscaled = false;
    }
  }
}
```

## 开关控制

### 启用超分

1. 设置 `upscaleStore.enabled = true`
2. 后端服务开始处理队列
3. 前端监听事件，完成后调用 `imagePool.setUpscaled()`

### 禁用超分

1. 设置 `upscaleStore.enabled = false`
2. 后端服务停止处理，清空队列
3. 前端清除所有超分槽位：`imagePool.clearAllUpscaled()`
4. 显示回退到原图

## 预加载策略

### 触发时机

- 当前页面加载完成后
- 翻页时

### 预加载范围

```typescript
const PRELOAD_RANGE = 3; // 前后各 3 页

function getPreloadIndices(currentIndex: number, totalPages: number): number[] {
  const indices: number[] = [];
  
  for (let i = currentIndex - PRELOAD_RANGE; i <= currentIndex + PRELOAD_RANGE; i++) {
    if (i >= 0 && i < totalPages && i !== currentIndex) {
      indices.push(i);
    }
  }
  
  return indices;
}
```

## 性能评估

### 内存占用对比

| 方案 | 单页内存 | 10页预加载 |
|------|----------|------------|
| Blob URL | ~50MB | ~500MB |
| 文件缓存 | ~5MB (引用) | ~50MB (引用) |

### 加载速度

| 场景 | Blob 传输 | 文件缓存 |
|------|-----------|----------|
| 首次加载 | 慢（需传输） | 快（本地读取） |
| 缓存命中 | N/A | 极快 |

## 迁移计划

1. ✅ 创建设计文档
2. 修改后端 UpscaleService
3. 添加 WIC WebP 编码
4. 简化前端 upscaleStore
5. 扩展 imagePool
6. 删除独立 UpscaleLayer
7. 集成测试

## 注意事项

1. **WIC 编解码器**：需要用户安装 AVIF/JXL 编解码器扩展
2. **缓存清理**：提供手动清理和自动过期机制
3. **错误处理**：超分失败时保持显示原图
4. **并发控制**：限制同时处理的任务数
