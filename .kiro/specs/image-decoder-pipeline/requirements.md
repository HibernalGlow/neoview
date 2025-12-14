# Requirements Document

## Introduction

本文档定义了 NeoView 图像解码管道重构的需求规格。当前项目存在图像解码逻辑分散、代码重复、缺乏统一抽象等问题。本次重构旨在创建统一的 `ImageDecoder` trait，整合 WIC（Windows）、image crate、jxl-oxide 等多个解码后端，并引入 SIMD 加速的图像缩放功能，提升整体性能和代码可维护性。

## Glossary

- **ImageDecoder**: 统一的图像解码器 trait，定义解码、缩放等核心接口
- **WIC**: Windows Imaging Component，Windows 原生图像解码 API，支持硬件加速
- **image crate**: Rust 生态中广泛使用的图像处理库
- **jxl-oxide**: 纯 Rust 实现的 JPEG XL 解码库
- **SIMD**: Single Instruction Multiple Data，单指令多数据并行处理技术
- **fast_image_resize**: 使用 SIMD 加速的 Rust 图像缩放库
- **DecodedImage**: 解码后的图像数据结构，包含像素数据、尺寸、格式信息
- **DecodeBackend**: 解码后端枚举，表示使用的解码器类型（WIC/ImageCrate/JxlOxide）
- **DecodeOptions**: 解码选项配置，包含目标尺寸、质量等参数

## Requirements

### Requirement 1

**User Story:** As a developer, I want a unified image decoder interface, so that I can decode images without worrying about format-specific implementations.

#### Acceptance Criteria

1. THE ImageDecoder trait SHALL define a `decode` method that accepts image data bytes and returns a DecodedImage result
2. THE ImageDecoder trait SHALL define a `decode_with_scale` method that accepts image data bytes and target dimensions, returning a scaled DecodedImage
3. THE ImageDecoder trait SHALL define a `get_dimensions` method that returns image dimensions without full decoding
4. THE ImageDecoder trait SHALL define a `supports_format` method that checks if a given format extension is supported
5. WHEN decoding fails THEN the ImageDecoder SHALL return a descriptive error with the failure reason and attempted backend

### Requirement 2

**User Story:** As a developer, I want automatic backend selection based on platform and format, so that the optimal decoder is always used.

#### Acceptance Criteria

1. WHEN running on Windows AND the format is supported by WIC THEN the system SHALL prefer WIC decoder for hardware acceleration
2. WHEN the format is JXL THEN the system SHALL use jxl-oxide decoder as primary backend
3. WHEN WIC decoding fails on Windows THEN the system SHALL fallback to image crate decoder
4. WHEN jxl-oxide decoding fails THEN the system SHALL attempt WIC fallback on Windows 24H2+
5. THE system SHALL provide a `select_backend` function that returns the optimal DecodeBackend for a given format and platform

### Requirement 3

**User Story:** As a developer, I want optimized image scaling with platform-specific acceleration, so that thumbnail generation and image resizing are faster.

#### Acceptance Criteria

1. WHEN running on Windows THEN the system SHALL use WIC IWICBitmapScaler for image scaling with hardware acceleration
2. WHEN running on non-Windows platforms THEN the system SHALL use fast_image_resize crate with SIMD acceleration as fallback
3. THE scaling function SHALL preserve aspect ratio when only max dimensions are specified
4. THE scaling function SHALL support configurable interpolation mode (Fant for WIC, Lanczos3 for fast_image_resize)
5. WHEN the target size equals or exceeds original size THEN the system SHALL return the original image without scaling

### Requirement 4

**User Story:** As a developer, I want to eliminate duplicate JXL decoding code, so that the codebase is easier to maintain.

#### Acceptance Criteria

1. THE system SHALL provide a single `JxlDecoder` implementation that handles all JXL decoding
2. WHEN JxlDecoder decodes an image THEN it SHALL support grayscale, RGB, and RGBA channel configurations
3. THE JxlDecoder SHALL convert jxl-oxide float buffer (0.0-1.0) to u8 pixel data (0-255)
4. THE JxlDecoder SHALL handle animated JXL by decoding only the first frame
5. WHEN JxlDecoder encounters an unsupported channel count THEN it SHALL return a descriptive error

### Requirement 5

**User Story:** As a developer, I want a unified decode result type, so that all decoders return consistent data structures.

#### Acceptance Criteria

1. THE DecodedImage struct SHALL contain width, height, pixel data (RGBA), and source backend information
2. THE DecodedImage SHALL provide a `to_dynamic_image` method for conversion to image::DynamicImage
3. THE DecodedImage SHALL provide a `to_webp` method for encoding to WebP format with configurable quality
4. THE DecodedImage SHALL provide a `to_png` method for lossless encoding
5. WHEN pixel data is in BGRA format THEN the DecodedImage constructor SHALL convert it to RGBA

### Requirement 6

**User Story:** As a developer, I want panic-safe decoding for background threads, so that decoder crashes don't bring down the application.

#### Acceptance Criteria

1. THE system SHALL provide a `decode_safe` wrapper that catches panics during decoding
2. WHEN a panic occurs during decoding THEN the system SHALL return an error instead of propagating the panic
3. THE panic-safe wrapper SHALL log the panic information before returning the error
4. THE system SHALL use `std::panic::catch_unwind` with `AssertUnwindSafe` for panic capture

### Requirement 7

**User Story:** As a developer, I want to migrate existing code to use the new decoder pipeline, so that the codebase is consistent.

#### Acceptance Criteria

1. THE thumbnail_generator module SHALL use ImageDecoder trait instead of inline decode functions
2. THE image_loader module SHALL use ImageDecoder trait instead of inline decode functions
3. THE archive module SHALL use ImageDecoder trait instead of inline decode functions
4. THE image_loader_mode module SHALL use ImageDecoder trait for bitmap decoding
5. WHEN migrating existing code THEN the system SHALL maintain backward compatibility with existing public APIs

