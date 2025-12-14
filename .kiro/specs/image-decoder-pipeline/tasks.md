# Implementation Plan

- [x] 1. 创建 image_decoder 模块基础结构







  - [x] 1.1 创建 `src-tauri/src/core/image_decoder/mod.rs` 模块入口

    - 定义模块导出
    - _Requirements: 1.1, 5.1_

  - [x] 1.2 创建 `src-tauri/src/core/image_decoder/types.rs` 类型定义

    - 实现 DecodeBackend enum
    - 实现 DecodedImage struct 及其方法 (from_bgra, to_dynamic_image, to_webp, to_png)
    - 实现 DecodeError enum
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [ ]* 1.3 编写属性测试：BGRA→RGBA 转换
    - **Property 6: BGRA to RGBA conversion correctness**
    - **Validates: Requirements 5.5**
  - [ ]* 1.4 编写属性测试：PNG 往返
    - **Property 7: PNG round-trip preserves pixels**
    - **Validates: Requirements 5.4**

  - [x] 1.5 创建 `src-tauri/src/core/image_decoder/traits.rs` trait 定义

    - 定义 ImageDecoder trait
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. 实现解码后端


  - [x] 2.1 创建 `src-tauri/src/core/image_decoder/backends/mod.rs`


    - 导出所有后端
    - _Requirements: 2.1, 2.2_
  - [x] 2.2 创建 `src-tauri/src/core/image_decoder/backends/jxl.rs` JXL 后端


    - 实现 JxlDecoder struct
    - 实现 ImageDecoder trait for JxlDecoder
    - 支持 grayscale/RGB/RGBA 通道配置
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ]* 2.3 编写属性测试：JXL 像素值范围
    - **Property 5: JXL pixel values in valid range**
    - **Validates: Requirements 4.3**
  - [x] 2.4 创建 `src-tauri/src/core/image_decoder/backends/wic.rs` WIC 后端 (Windows)


    - 实现 WicDecoder struct
    - 实现 ImageDecoder trait for WicDecoder
    - 复用现有 wic_decoder.rs 逻辑
    - _Requirements: 2.1, 3.1_
  - [x] 2.5 创建 `src-tauri/src/core/image_decoder/backends/image_crate.rs` 通用后端


    - 实现 ImageCrateDecoder struct
    - 实现 ImageDecoder trait for ImageCrateDecoder
    - _Requirements: 2.3_


- [-] 3. 实现统一解码器和缩放器

  - [x] 3.1 创建 `src-tauri/src/core/image_decoder/scaler.rs` 图像缩放


    - Windows: 使用 WIC IWICBitmapScaler
    - 非 Windows: 使用 fast_image_resize
    - 实现 scale_image 函数
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [ ]* 3.2 编写属性测试：缩放保持宽高比
    - **Property 2: Decode with scale preserves aspect ratio**
    - **Validates: Requirements 1.2, 3.3**
  - [ ]* 3.3 编写属性测试：不放大
    - **Property 4: No upscaling when target exceeds original**
    - **Validates: Requirements 3.5**
  - [x] 3.4 创建 `src-tauri/src/core/image_decoder/unified.rs` 统一解码器


    - 实现 UnifiedDecoder struct
    - 实现 select_backend 函数
    - 实现 decode_safe panic 安全包装
    - 实现 ImageDecoder trait for UnifiedDecoder
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 6.2, 6.4_
  - [ ]* 3.5 编写属性测试：后端选择确定性
    - **Property 10: Backend selection determinism**
    - **Validates: Requirements 2.5**
  - [ ]* 3.6 编写属性测试：解码产生有效尺寸
    - **Property 1: Decode produces valid dimensions**
    - **Validates: Requirements 1.1, 5.1**
  - [ ]* 3.7 编写属性测试：get_dimensions 一致性
    - **Property 3: Get dimensions matches decode dimensions**
    - **Validates: Requirements 1.3**

- [x] 4. Checkpoint - 确保所有测试通过

  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. 更新 Cargo.toml 依赖


  - [x] 5.1 添加 fast_image_resize 依赖


    - 仅用于非 Windows 平台回退
    - _Requirements: 3.2_
  - [x] 5.2 更新 core/mod.rs 导出 image_decoder 模块


    - _Requirements: 7.1_



- [ ] 6. 迁移 thumbnail_generator 模块
  - [x] 6.1 重构 thumbnail_generator.rs 使用 UnifiedDecoder


    - 移除 decode_jxl_image 函数
    - 移除 decode_image_safe 函数
    - 移除 decode_avif_with_wic 函数
    - 使用 UnifiedDecoder::decode_with_scale 替代
    - _Requirements: 7.1_
  - [ ]* 6.2 编写属性测试：to_dynamic_image 保持尺寸
    - **Property 9: to_dynamic_image preserves dimensions**
    - **Validates: Requirements 5.2**
  - [ ]* 6.3 编写属性测试：WebP 往返保持尺寸
    - **Property 8: WebP round-trip preserves dimensions**
    - **Validates: Requirements 5.3**


- [-] 7. 迁移 image_loader 模块

  - [x] 7.1 重构 image_loader.rs 使用 UnifiedDecoder


    - 移除 decode_jxl_image 方法
    - 使用 UnifiedDecoder 替代内联解码逻辑
    - _Requirements: 7.2_


- [x] 8. 迁移其他模块



  - [x] 8.1 重构 archive.rs 使用 UnifiedDecoder

    - 移除 decode_jxl_image 方法
    - _Requirements: 7.3_
  - [x] 8.2 重构 image_loader_mode.rs 使用 UnifiedDecoder

    - 移除 decode_to_bitmap 函数
    - _Requirements: 7.4_

- [x] 9. 清理旧代码


  - [x] 9.1 移除 wic_decoder.rs 中的重复函数


    - 保留 WicDecodeResult 类型供兼容
    - 将核心逻辑迁移到 backends/wic.rs
    - _Requirements: 7.1, 7.2, 7.3, 7.4_



- [ ] 10. Final Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.
