# Requirements Document

## Introduction

本文档定义了将 NeoView 图像超分系统从 PyO3 + Python (sr_vulkan) 架构迁移到纯 Rust 实现的需求。目标是消除 Python 运行时依赖，提升性能和部署便捷性，同时保持与现有前端接口的兼容性。

## Glossary

- **NeoView**: 本项目的图像查看器应用
- **超分 (Super Resolution)**: 使用深度学习模型将低分辨率图像放大为高分辨率图像的技术
- **PyO3**: Rust 与 Python 互操作的库
- **sr_vulkan**: 当前使用的 Python 超分模块，基于 Vulkan GPU 加速
- **ncnn**: 腾讯开源的高性能神经网络推理框架，支持 Vulkan GPU 加速
- **RealESRGAN**: 一种流行的图像超分模型
- **Waifu2x**: 专为动漫图像设计的超分模型
- **RealCUGAN**: 针对动漫图像优化的超分模型
- **Tile Processing**: 将大图像分割成小块处理以减少显存占用的技术
- **UpscaleService**: 后端超分服务，管理任务队列和缓存

## Requirements

### Requirement 1

**User Story:** As a developer, I want to replace PyO3/Python dependencies with pure Rust implementation, so that the application has fewer runtime dependencies and easier deployment.

#### Acceptance Criteria

1. WHEN the application starts THEN the Upscale_System SHALL initialize without requiring Python runtime
2. WHEN the Upscale_System initializes THEN the Upscale_System SHALL detect available Vulkan GPU devices
3. WHEN no Vulkan GPU is available THEN the Upscale_System SHALL fall back to CPU processing mode
4. WHEN the Upscale_System initializes THEN the Upscale_System SHALL load ncnn models from the bundled model directory

### Requirement 2

**User Story:** As a user, I want the same super resolution models available as before, so that I can continue using my preferred upscaling settings.

#### Acceptance Criteria

1. WHEN querying available models THEN the Upscale_System SHALL return a list containing RealESRGAN, Waifu2x, and RealCUGAN model variants
2. WHEN a model is selected THEN the Upscale_System SHALL support scale factors of 2x and 4x
3. WHEN using Waifu2x or RealCUGAN models THEN the Upscale_System SHALL support noise reduction levels from -1 to 3
4. WHEN a model name is provided THEN the Upscale_System SHALL resolve it to the corresponding ncnn model files

### Requirement 3

**User Story:** As a user, I want to upscale images with the same quality as before, so that my viewing experience is not degraded.

#### Acceptance Criteria

1. WHEN processing an image THEN the Upscale_System SHALL produce output with visual quality comparable to the Python sr_vulkan implementation
2. WHEN processing an image THEN the Upscale_System SHALL preserve the original aspect ratio
3. WHEN processing an image THEN the Upscale_System SHALL output in WebP format with configurable quality
4. WHEN processing completes THEN the Upscale_System SHALL return the upscaled image data to the caller

### Requirement 4

**User Story:** As a user, I want large images to be processed without running out of GPU memory, so that upscaling works reliably on all my images.

#### Acceptance Criteria

1. WHEN processing a large image THEN the Upscale_System SHALL use tile-based processing to limit memory usage
2. WHEN tile size is set to 0 THEN the Upscale_System SHALL automatically determine optimal tile size based on available GPU memory
3. WHEN processing tiles THEN the Upscale_System SHALL seamlessly blend tile boundaries to avoid visible seams
4. WHEN a custom tile size is specified THEN the Upscale_System SHALL use that tile size for processing

### Requirement 5

**User Story:** As a user, I want upscaling to be fast and responsive, so that I don't have to wait long for results.

#### Acceptance Criteria

1. WHEN a Vulkan GPU is available THEN the Upscale_System SHALL use GPU acceleration for inference
2. WHEN processing multiple images THEN the Upscale_System SHALL support concurrent processing up to a configurable limit
3. WHEN a timeout is specified THEN the Upscale_System SHALL cancel processing if the timeout is exceeded
4. WHEN a job is cancelled THEN the Upscale_System SHALL release resources and return a cancellation status

### Requirement 6

**User Story:** As a developer, I want the new implementation to maintain API compatibility, so that existing frontend code continues to work without changes.

#### Acceptance Criteria

1. WHEN the UpscaleService requests upscaling THEN the Upscale_System SHALL accept the same parameters as the current PyO3 implementation
2. WHEN upscaling completes THEN the Upscale_System SHALL emit the same events as the current implementation
3. WHEN caching results THEN the Upscale_System SHALL use the same cache path format as the current implementation
4. WHEN checking cache THEN the Upscale_System SHALL return cached results in the same format as before

### Requirement 7

**User Story:** As a user, I want to be able to cancel ongoing upscale operations, so that I can stop processing when I no longer need the result.

#### Acceptance Criteria

1. WHEN a cancel request is received with a job key THEN the Upscale_System SHALL stop the corresponding processing task
2. WHEN a task is cancelled THEN the Upscale_System SHALL notify the caller with a cancellation status
3. WHEN switching books THEN the Upscale_System SHALL cancel all pending tasks for the previous book

### Requirement 8

**User Story:** As a developer, I want comprehensive error handling, so that failures are reported clearly and the system remains stable.

#### Acceptance Criteria

1. WHEN model files are missing THEN the Upscale_System SHALL return a descriptive error message
2. WHEN GPU initialization fails THEN the Upscale_System SHALL log the error and attempt CPU fallback
3. WHEN image decoding fails THEN the Upscale_System SHALL return an error with the failure reason
4. WHEN an unexpected error occurs THEN the Upscale_System SHALL not crash and SHALL return an error status

### Requirement 9

**User Story:** As a developer, I want the upscale module to be well-structured and maintainable, so that future enhancements are easy to implement.

#### Acceptance Criteria

1. WHEN implementing the module THEN the Upscale_System SHALL separate concerns into distinct components (model loading, inference, image processing)
2. WHEN adding new models THEN the Upscale_System SHALL support adding models without modifying core inference code
3. WHEN the module is built THEN the Upscale_System SHALL compile without warnings on stable Rust
