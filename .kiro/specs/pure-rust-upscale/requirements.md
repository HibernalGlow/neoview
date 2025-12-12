# Requirements Document

## Introduction

本文档定义了扩展 sr-vulkan 库以支持新超分模型的需求。当前 sr-vulkan 的模型列表是硬编码的，无法动态添加新模型。目标是 fork sr-vulkan 并修改其源码，使其支持更多模型或动态模型加载。

## Glossary

- **sr-vulkan**: 基于 ncnn 的 Python 超分模块，通过 PyO3 调用
- **AllModel**: sr-vulkan 中硬编码的模型名称数组
- **ncnn**: 腾讯开源的高性能神经网络推理框架
- **RealESRGAN**: 一种流行的图像超分模型
- **Waifu2x**: 专为动漫图像设计的超分模型
- **RealCUGAN**: 针对动漫图像优化的超分模型
- **param/bin 文件**: ncnn 模型的参数文件和权重文件

## Requirements

### Requirement 1

**User Story:** As a user, I want to use newer super resolution models, so that I can get better upscaling quality for my images.

#### Acceptance Criteria

1. WHEN the sr-vulkan library is forked THEN the System SHALL maintain compatibility with existing model loading code
2. WHEN new models are added to AllModel array THEN the System SHALL correctly map model indices to model types
3. WHEN a new model is selected THEN the System SHALL load the corresponding param and bin files

### Requirement 2

**User Story:** As a developer, I want to easily add new models to sr-vulkan, so that I can keep up with the latest super resolution research.

#### Acceptance Criteria

1. WHEN adding a new model THEN the Developer SHALL only need to add the model name to AllModel array
2. WHEN adding a new model THEN the Developer SHALL place param/bin files in the correct model directory
3. WHEN the model type is determined THEN the System SHALL use naming convention to identify model category (WAIFU2X, REALCUGAN, REALSR, REALESRGAN)

### Requirement 3

**User Story:** As a user, I want the new models to work with the existing NeoView interface, so that I don't need to learn new workflows.

#### Acceptance Criteria

1. WHEN new models are available THEN the System SHALL expose them through the existing get_available_models API
2. WHEN a new model is used THEN the System SHALL use the same caching and processing pipeline
3. WHEN model parameters are configured THEN the System SHALL support the same scale and noise level options

## Current Model List (AllModel[])

```cpp
// Waifu2x models (19 models)
"WAIFU2X_CUNET_UP1X_DENOISE0X" ... "WAIFU2X_PHOTO_UP2X_DENOISE3X"

// RealCUGAN models (18 models)  
"REALCUGAN_PRO_UP2X" ... "REALCUGAN_SE_UP4X_DENOISE3X"

// RealSR models (1 model)
"REALSR_DF2K_UP4X"

// RealESRGAN models (5 models)
"REALESRGAN_ANIMAVIDEOV3_UP2X"
"REALESRGAN_ANIMAVIDEOV3_UP3X"
"REALESRGAN_ANIMAVIDEOV3_UP4X"
"REALESRGAN_X4PLUS_UP4X"
"REALESRGAN_X4PLUSANIME_UP4X"
```

## Proposed New Models to Add

根据 ncnn-vulkan 生态系统中可用的模型：

1. **RealESRGAN 新模型**
   - `REALESRGAN_X2PLUS_UP2X` - 2x 放大版本
   - `REALESRGAN_ANIMEVIDEOV3_UP1X` - 1x 降噪版本

2. **其他潜在模型**
   - 用户自定义模型支持（需要更大改动）
