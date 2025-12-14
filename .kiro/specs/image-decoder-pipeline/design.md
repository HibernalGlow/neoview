# Design Document: Image Decoder Pipeline Refactoring

## Overview

本设计文档描述 NeoView 图像解码管道的重构方案。核心目标是创建统一的 `ImageDecoder` trait，整合现有分散的解码逻辑（WIC、image crate、jxl-oxide），消除重复代码，并通过平台优化的缩放策略提升性能。

### 设计目标

1. **统一接口** - 所有解码操作通过 `ImageDecoder` trait 进行
2. **自动后端选择** - 根据平台和格式自动选择最优解码器
3. **平台优化缩放** - Windows 用 WIC 硬件加速，其他平台用 SIMD
4. **消除重复** - 单一 JXL 解码实现，统一错误处理
5. **Panic 安全** - 后台线程解码不会导致应用崩溃

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        调用方                                    │
│  (thumbnail_generator, image_loader, archive, upscale_service)  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ImageDecoder Trait                           │
│  ┌─────────────┬──────────────────┬─────────────────────────┐  │
│  │   decode()  │ decode_with_scale│   get_dimensions()      │  │
│  └─────────────┴──────────────────┴─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    UnifiedDecoder                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              select_backend(format, platform)             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│         ┌────────────────────┼────────────────────┐            │
│         ▼                    ▼                    ▼            │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│  │ WicBackend  │     │ JxlBackend  │     │ImageBackend │      │
│  │ (Windows)   │     │ (jxl-oxide) │     │(image crate)│      │
│  └─────────────┘     └─────────────┘     └─────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DecodedImage                               │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────────┐  │
│  │  width   │  height  │  pixels  │  backend │ to_webp/png  │  │
│  │   u32    │   u32    │ Vec<u8>  │  enum    │   methods    │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 后端选择策略

```
┌─────────────────────────────────────────────────────────────────┐
│                    Backend Selection Flow                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Input: format extension + platform                             │
│                                                                 │
│  ┌─────────────────┐                                           │
│  │ format == "jxl" │──Yes──▶ JxlBackend (primary)              │
│  └────────┬────────┘         └──▶ WicBackend (fallback Win24H2)│
│           │ No                                                  │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │ platform == Win │──Yes──▶ WicBackend (primary)              │
│  │ && WIC supports │         └──▶ ImageBackend (fallback)      │
│  └────────┬────────┘                                           │
│           │ No                                                  │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │  ImageBackend   │ (default for all other cases)             │
│  └─────────────────┘                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. ImageDecoder Trait

```rust
/// 统一图像解码器 trait
pub trait ImageDecoder: Send + Sync {
    /// 解码图像数据
    fn decode(&self, data: &[u8]) -> Result<DecodedImage, DecodeError>;
    
    /// 解码并缩放图像
    fn decode_with_scale(
        &self, 
        data: &[u8], 
        max_width: u32, 
        max_height: u32
    ) -> Result<DecodedImage, DecodeError>;
    
    /// 仅获取图像尺寸（不完整解码）
    fn get_dimensions(&self, data: &[u8]) -> Result<(u32, u32), DecodeError>;
    
    /// 检查是否支持指定格式
    fn supports_format(&self, extension: &str) -> bool;
    
    /// 获取解码器名称
    fn name(&self) -> &'static str;
}
```

### 2. DecodeBackend Enum

```rust
/// 解码后端类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecodeBackend {
    /// Windows Imaging Component (硬件加速)
    Wic,
    /// jxl-oxide (JPEG XL 专用)
    JxlOxide,
    /// image crate (通用回退)
    ImageCrate,
}
```

### 3. DecodedImage Struct

```rust
/// 解码后的图像数据
#[derive(Debug, Clone)]
pub struct DecodedImage {
    /// 图像宽度
    pub width: u32,
    /// 图像高度
    pub height: u32,
    /// RGBA 像素数据
    pub pixels: Vec<u8>,
    /// 使用的解码后端
    pub backend: DecodeBackend,
}

impl DecodedImage {
    /// 从 BGRA 数据创建（自动转换为 RGBA）
    pub fn from_bgra(width: u32, height: u32, bgra: Vec<u8>, backend: DecodeBackend) -> Self;
    
    /// 转换为 image::DynamicImage
    pub fn to_dynamic_image(&self) -> Result<DynamicImage, String>;
    
    /// 编码为 WebP
    pub fn to_webp(&self, quality: u8) -> Result<Vec<u8>, String>;
    
    /// 编码为 PNG（无损）
    pub fn to_png(&self) -> Result<Vec<u8>, String>;
    
    /// 缩放图像
    pub fn scale(&self, max_width: u32, max_height: u32) -> Result<DecodedImage, String>;
}
```

### 4. DecodeError Type

```rust
/// 解码错误类型
#[derive(Debug, thiserror::Error)]
pub enum DecodeError {
    #[error("不支持的格式: {format}")]
    UnsupportedFormat { format: String },
    
    #[error("解码失败 ({backend:?}): {message}")]
    DecodeFailed { backend: DecodeBackend, message: String },
    
    #[error("获取尺寸失败: {0}")]
    DimensionError(String),
    
    #[error("缩放失败: {0}")]
    ScaleError(String),
    
    #[error("编码失败: {0}")]
    EncodeError(String),
    
    #[error("解码时发生 panic: {0}")]
    Panic(String),
}
```

### 5. UnifiedDecoder

```rust
/// 统一解码器 - 自动选择最优后端
pub struct UnifiedDecoder {
    /// 格式提示（可选）
    format_hint: Option<String>,
}

impl UnifiedDecoder {
    pub fn new() -> Self;
    
    /// 带格式提示创建
    pub fn with_format(format: &str) -> Self;
    
    /// 选择最优后端
    fn select_backend(&self, data: &[u8], format: Option<&str>) -> DecodeBackend;
    
    /// Panic 安全解码
    pub fn decode_safe(&self, data: &[u8]) -> Result<DecodedImage, DecodeError>;
}

impl ImageDecoder for UnifiedDecoder { ... }
```

### 6. 平台特定后端

```rust
// Windows 专用
#[cfg(target_os = "windows")]
pub struct WicDecoder;

#[cfg(target_os = "windows")]
impl ImageDecoder for WicDecoder { ... }

// JXL 专用
pub struct JxlDecoder;
impl ImageDecoder for JxlDecoder { ... }

// 通用后端
pub struct ImageCrateDecoder;
impl ImageDecoder for ImageCrateDecoder { ... }
```

## Data Models

### 文件结构

```
src-tauri/src/core/
├── image_decoder/           # 新模块目录
│   ├── mod.rs              # 模块导出
│   ├── traits.rs           # ImageDecoder trait 定义
│   ├── types.rs            # DecodedImage, DecodeError 等类型
│   ├── unified.rs          # UnifiedDecoder 实现
│   ├── backends/
│   │   ├── mod.rs
│   │   ├── wic.rs          # WIC 后端 (Windows)
│   │   ├── jxl.rs          # jxl-oxide 后端
│   │   └── image_crate.rs  # image crate 后端
│   └── scaler.rs           # 图像缩放（WIC/fast_image_resize）
├── mod.rs                   # 添加 image_decoder 导出
└── ... (existing files)
```

### 依赖变更 (Cargo.toml)

```toml
[dependencies]
# 新增
fast_image_resize = "5"  # SIMD 加速缩放（非 Windows 回退）

# 现有（保持）
image = { version = "0.25.9", features = [...] }
jxl-oxide = { version = "0.12.2", features = ["image"] }

[target.'cfg(target_os = "windows")'.dependencies]
windows = { version = "0.58", features = [...] }  # 现有
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Decode produces valid dimensions
*For any* valid image data, calling `decode()` SHALL return a DecodedImage where `width * height * 4 == pixels.len()`
**Validates: Requirements 1.1, 5.1**

### Property 2: Decode with scale preserves aspect ratio
*For any* image with original dimensions (W, H) and target max dimensions (maxW, maxH), the scaled result SHALL have dimensions (w, h) where `|w/h - W/H| < 0.01` (aspect ratio preserved within 1% tolerance)
**Validates: Requirements 1.2, 3.3**

### Property 3: Get dimensions matches decode dimensions
*For any* valid image data, `get_dimensions(data)` SHALL return the same (width, height) as `decode(data).width, decode(data).height`
**Validates: Requirements 1.3**

### Property 4: No upscaling when target exceeds original
*For any* image with dimensions (W, H) and target (maxW, maxH) where maxW >= W AND maxH >= H, `decode_with_scale()` SHALL return dimensions equal to (W, H)
**Validates: Requirements 3.5**

### Property 5: JXL pixel values in valid range
*For any* JXL image decoded by JxlDecoder, all pixel values in the result SHALL be in range [0, 255]
**Validates: Requirements 4.3**

### Property 6: BGRA to RGBA conversion correctness
*For any* BGRA pixel data, `DecodedImage::from_bgra()` SHALL produce RGBA data where for each pixel: `rgba[0] == bgra[2]`, `rgba[1] == bgra[1]`, `rgba[2] == bgra[0]`, `rgba[3] == bgra[3]`
**Validates: Requirements 5.5**

### Property 7: PNG round-trip preserves pixels
*For any* DecodedImage, encoding to PNG and decoding back SHALL produce identical pixel data (lossless)
**Validates: Requirements 5.4**

### Property 8: WebP round-trip preserves dimensions
*For any* DecodedImage, encoding to WebP and decoding back SHALL produce the same width and height
**Validates: Requirements 5.3**

### Property 9: to_dynamic_image preserves dimensions
*For any* DecodedImage, `to_dynamic_image()` SHALL return a DynamicImage with the same width and height
**Validates: Requirements 5.2**

### Property 10: Backend selection determinism
*For any* format string and platform, `select_backend()` SHALL always return the same DecodeBackend
**Validates: Requirements 2.5**

## Error Handling

### 错误处理策略

1. **分层错误** - 使用 `DecodeError` enum 区分不同错误类型
2. **后端信息** - 错误中包含尝试的后端信息，便于调试
3. **自动回退** - 主后端失败时自动尝试回退后端
4. **Panic 捕获** - 使用 `catch_unwind` 防止解码器崩溃传播

### 回退链

```
JXL 格式:
  jxl-oxide → WIC (Win24H2+) → 返回错误

其他格式 (Windows):
  WIC → image crate → 返回错误

其他格式 (非 Windows):
  image crate → 返回错误
```

## Testing Strategy

### 双重测试方法

本项目采用单元测试和属性测试相结合的方式：

- **单元测试**: 验证特定示例、边界情况和错误条件
- **属性测试**: 验证应在所有输入上成立的通用属性

### 属性测试框架

使用 `proptest` crate（已在 dev-dependencies 中）进行属性测试。每个属性测试配置运行至少 100 次迭代。

### 测试文件结构

```
src-tauri/src/core/image_decoder/
├── tests/
│   ├── mod.rs
│   ├── unit_tests.rs       # 单元测试
│   └── property_tests.rs   # 属性测试
```

### 单元测试覆盖

1. 各格式解码（PNG, JPEG, WebP, AVIF, JXL, GIF, BMP）
2. 错误处理（无效数据、不支持格式）
3. 后端选择逻辑
4. BGRA/RGBA 转换
5. 编码输出验证

### 属性测试覆盖

每个属性测试必须使用以下格式标注：
```rust
// **Feature: image-decoder-pipeline, Property {number}: {property_text}**
// **Validates: Requirements X.Y**
```
