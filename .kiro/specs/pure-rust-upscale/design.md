# Design Document: Pure Rust Upscale System

## Overview

本设计文档描述了将 NeoView 超分系统从 PyO3 + Python (sr_vulkan) 迁移到纯 Rust 实现的技术方案。

### 背景分析

当前 sr_vulkan 的架构：
- **底层**: ncnn C++ 库 + Vulkan GPU 加速
- **中间层**: Python C API 绑定 (waifu2x_py.cpp)
- **上层**: Python 模块 (sr_vulkan)
- **调用方**: Rust PyO3 绑定

调用链路：`Rust (PyO3) → Python → C++ (ncnn) → Vulkan GPU`

### 核心目标

1. **零 Python 依赖** - 完全移除 PyO3 和 Python 运行时
2. **性能提升** - 减少跨语言调用开销
3. **部署简化** - 无需打包 Python 环境
4. **API 兼容** - 保持与现有 UpscaleService 的接口兼容

### 技术方案选择

**方案 A: 命令行工具调用 (推荐)**
- 调用 realesrgan-ncnn-vulkan / waifu2x-ncnn-vulkan 等命令行工具
- 优点：实现简单、稳定可靠、工具成熟
- 缺点：需要打包外部可执行文件、进程间通信开销

**方案 B: Rust FFI 绑定 ncnn**
- 使用 ncnn-rs 或自定义 FFI 绑定
- 优点：无外部依赖、性能最优
- 缺点：实现复杂、需要处理 Vulkan 初始化

**选择方案 A**，原因：
1. 现有 generic_upscaler.rs 已有命令行调用框架
2. ncnn-vulkan 工具链成熟稳定
3. 实现周期短，风险可控
4. 可后续迁移到方案 B

### 技术选型

- **超分引擎**: realesrgan-ncnn-vulkan, waifu2x-ncnn-vulkan, realcugan-ncnn-vulkan
- **进程管理**: std::process::Command + tokio 异步
- **图像处理**: image crate + WIC (Windows)
- **并发模型**: tokio + 工作线程池

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Svelte)                         │
│                    (保持不变，通过 Tauri IPC 调用)                  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      UpscaleService (现有)                       │
│              (保持不变，只替换底层超分实现)                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RustUpscaler (新模块)                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ ToolManager     │  │ ProcessRunner   │  │ ImageProcessor  │  │
│  │                 │  │                 │  │                 │  │
│  │ - 工具发现      │  │ - 进程启动      │  │ - 图像解码      │  │
│  │ - 模型路径管理  │  │ - 超时控制      │  │ - 临时文件管理  │  │
│  │ - 参数构建      │  │ - 取消支持      │  │ - WebP 编码     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              ncnn-vulkan 命令行工具 (外部进程)                    │
│  realesrgan-ncnn-vulkan | waifu2x-ncnn-vulkan | realcugan-ncnn  │
└─────────────────────────────────────────────────────────────────┘
```

### 工具打包策略

ncnn-vulkan 工具将打包在应用资源目录中：
```
resources/
├── bin/
│   ├── realesrgan-ncnn-vulkan.exe
│   ├── waifu2x-ncnn-vulkan.exe
│   └── realcugan-ncnn-vulkan.exe
└── models/
    ├── realesrgan-x4plus/
    ├── realesrgan-x4plus-anime/
    ├── waifu2x-cunet/
    └── realcugan-se/
```

## Components and Interfaces

### 1. RustUpscaler (主模块)

```rust
/// 纯 Rust 超分器 - 替代 PyO3Upscaler
pub struct RustUpscaler {
    /// 工具管理器
    tool_manager: ToolManager,
    /// 进程运行器
    process_runner: ProcessRunner,
    /// 缓存目录
    cache_dir: PathBuf,
    /// 是否已初始化
    initialized: AtomicBool,
    /// 运行中的任务
    running_tasks: RwLock<HashMap<String, RunningTask>>,
}

impl RustUpscaler {
    /// 创建新实例
    pub fn new(resources_dir: PathBuf, cache_dir: PathBuf) -> Result<Self, UpscaleError>;
    
    /// 初始化 (检查工具可用性)
    pub fn initialize(&self) -> Result<(), UpscaleError>;
    
    /// 检查可用性
    pub fn check_availability(&self) -> Result<bool, UpscaleError>;
    
    /// 获取可用模型列表
    pub fn get_available_models(&self) -> Result<Vec<ModelInfo>, UpscaleError>;
    
    /// 执行超分 (内存版本，与 PyO3Upscaler 接口兼容)
    pub fn upscale_image_memory(
        &self,
        image_data: &[u8],
        model: &UpscaleModel,
        timeout: f64,
        width: i32,
        height: i32,
        job_key: Option<&str>,
    ) -> Result<Vec<u8>, UpscaleError>;
    
    /// 取消任务
    pub fn cancel_job(&self, job_key: &str) -> Result<(), UpscaleError>;
    
    /// 获取缓存路径 (与现有格式兼容)
    pub fn get_cache_path(&self, image_hash: &str, model: &UpscaleModel) -> PathBuf;
    
    /// 检查缓存
    pub fn check_cache(&self, image_hash: &str, model: &UpscaleModel) -> Option<PathBuf>;
}
```

### 2. ToolManager (工具管理器)

```rust
/// 超分工具类型
#[derive(Debug, Clone, Copy)]
pub enum UpscaleTool {
    RealESRGAN,
    Waifu2x,
    RealCUGAN,
}

/// 工具管理器 - 管理 ncnn-vulkan 命令行工具
pub struct ToolManager {
    /// 资源目录
    resources_dir: PathBuf,
    /// 已发现的工具
    tools: HashMap<UpscaleTool, PathBuf>,
    /// 模型目录
    models_dir: PathBuf,
}

impl ToolManager {
    /// 创建工具管理器
    pub fn new(resources_dir: PathBuf) -> Self;
    
    /// 扫描可用工具
    pub fn scan_tools(&mut self) -> Result<(), UpscaleError>;
    
    /// 检查工具是否可用
    pub fn is_tool_available(&self, tool: UpscaleTool) -> bool;
    
    /// 获取工具路径
    pub fn get_tool_path(&self, tool: UpscaleTool) -> Option<&PathBuf>;
    
    /// 根据模型名称确定工具类型
    pub fn get_tool_for_model(&self, model_name: &str) -> Option<UpscaleTool>;
    
    /// 获取模型目录
    pub fn get_models_dir(&self) -> &PathBuf;
    
    /// 构建命令参数
    pub fn build_args(
        &self,
        tool: UpscaleTool,
        input_path: &Path,
        output_path: &Path,
        model: &UpscaleModel,
    ) -> Vec<String>;
}
```

### 3. ProcessRunner (进程运行器)

```rust
/// 运行中的任务
pub struct RunningTask {
    /// 子进程
    child: Child,
    /// 取消标记
    cancelled: Arc<AtomicBool>,
    /// 开始时间
    started_at: Instant,
}

/// 进程运行器 - 管理超分进程的生命周期
pub struct ProcessRunner {
    /// 最大并发数
    max_concurrent: usize,
    /// 当前运行数
    running_count: AtomicUsize,
}

impl ProcessRunner {
    /// 创建进程运行器
    pub fn new(max_concurrent: usize) -> Self;
    
    /// 运行超分进程
    pub async fn run(
        &self,
        tool_path: &Path,
        args: Vec<String>,
        timeout: Duration,
        cancel_flag: Arc<AtomicBool>,
    ) -> Result<(), UpscaleError>;
    
    /// 检查是否可以启动新任务
    pub fn can_start(&self) -> bool;
}
```

### 4. 模型信息

```rust
/// 模型信息
#[derive(Debug, Clone, Serialize)]
pub struct ModelInfo {
    /// 模型名称 (如 "realesrgan-x4plus-anime")
    pub name: String,
    /// 显示名称
    pub display_name: String,
    /// 工具类型
    pub tool: UpscaleTool,
    /// 支持的缩放倍数
    pub supported_scales: Vec<i32>,
    /// 是否支持降噪
    pub supports_denoise: bool,
    /// 模型目录路径
    pub model_dir: PathBuf,
}

/// 预定义模型列表
pub const BUILTIN_MODELS: &[ModelInfo] = &[
    // RealESRGAN 模型
    ModelInfo { name: "realesrgan-x4plus", tool: UpscaleTool::RealESRGAN, ... },
    ModelInfo { name: "realesrgan-x4plus-anime", tool: UpscaleTool::RealESRGAN, ... },
    ModelInfo { name: "realesrgan-animevideov3", tool: UpscaleTool::RealESRGAN, ... },
    // Waifu2x 模型
    ModelInfo { name: "waifu2x-cunet", tool: UpscaleTool::Waifu2x, ... },
    // RealCUGAN 模型
    ModelInfo { name: "realcugan-se", tool: UpscaleTool::RealCUGAN, ... },
];
```

### 5. 错误类型

```rust
/// 超分错误类型
#[derive(Debug, thiserror::Error)]
pub enum UpscaleError {
    #[error("模型未找到: {0}")]
    ModelNotFound(String),
    
    #[error("GPU 初始化失败: {0}")]
    GpuInitFailed(String),
    
    #[error("图像解码失败: {0}")]
    ImageDecodeFailed(String),
    
    #[error("推理失败: {0}")]
    InferenceFailed(String),
    
    #[error("任务超时")]
    Timeout,
    
    #[error("任务已取消")]
    Cancelled,
    
    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),
}
```

## Data Models

### UpscaleModel (保持兼容)

```rust
/// 超分模型配置 (与现有 PyO3 版本兼容)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpscaleModel {
    /// 模型 ID (兼容旧接口，新实现可忽略)
    pub model_id: i32,
    /// 模型名称
    pub model_name: String,
    /// 缩放倍数 (2 或 4)
    pub scale: i32,
    /// Tile 大小 (0 表示自动)
    pub tile_size: i32,
    /// 降噪等级 (-1, 0, 1, 2, 3)
    pub noise_level: i32,
}
```

### UpscaleOptions (新增)

```rust
/// 超分选项
#[derive(Debug, Clone)]
pub struct UpscaleOptions {
    /// 超时时间 (秒)
    pub timeout: f64,
    /// 任务标识 (用于取消)
    pub job_key: Option<String>,
    /// 输入图像尺寸 (可选，用于优化)
    pub input_size: Option<(u32, u32)>,
}
```

### GpuInfo

```rust
/// GPU 信息
#[derive(Debug, Clone, Serialize)]
pub struct GpuInfo {
    /// GPU 索引
    pub index: i32,
    /// GPU 名称
    pub name: String,
    /// 显存大小 (字节)
    pub memory: u64,
    /// 是否支持 Vulkan
    pub vulkan_support: bool,
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Aspect Ratio Preservation
*For any* input image with dimensions (W, H) and scale factor S, the output image dimensions SHALL be (W*S, H*S), preserving the original aspect ratio.
**Validates: Requirements 3.2**

### Property 2: WebP Output Format
*For any* successfully processed image, the output data SHALL be valid WebP format that can be decoded by standard WebP decoders.
**Validates: Requirements 3.3**

### Property 3: Non-Empty Output
*For any* valid input image and model configuration, successful processing SHALL return non-empty image data.
**Validates: Requirements 3.4**

### Property 4: Model Name Resolution
*For any* valid model name in the supported model list, the system SHALL resolve it to existing param and bin file paths.
**Validates: Requirements 2.4**

### Property 5: Scale Factor Support
*For any* loaded model, the system SHALL accept scale factors that are in the model's supported_scales list.
**Validates: Requirements 2.2**

### Property 6: Noise Level Validation
*For any* Waifu2x or RealCUGAN model, noise levels in the range [-1, 3] SHALL be accepted.
**Validates: Requirements 2.3**

### Property 7: Tile Size Respect
*For any* specified non-zero tile size, the system SHALL use that tile size for processing (not a different size).
**Validates: Requirements 4.4**

### Property 8: Timeout Enforcement
*For any* processing with a specified timeout T, if processing exceeds T seconds, the system SHALL return a timeout error.
**Validates: Requirements 5.3**

### Property 9: Cancellation Response
*For any* running task with a job key, calling cancel_job with that key SHALL result in the task stopping and returning a cancellation status.
**Validates: Requirements 5.4, 7.1, 7.2**

### Property 10: Cache Path Format
*For any* image hash H and model name M, the cache path SHALL be formatted as "{H}_sr[{M}].webp".
**Validates: Requirements 6.3**

### Property 11: Invalid Image Error
*For any* invalid or corrupted image data, the system SHALL return an error with a descriptive message (not crash).
**Validates: Requirements 8.3, 8.4**

### Property 12: Book Switch Cancellation
*For any* book switch operation, all pending tasks for the previous book SHALL be cancelled.
**Validates: Requirements 7.3**

## Error Handling

### 错误分类

1. **可恢复错误**
   - 单个图像处理失败 → 返回错误，继续处理其他任务
   - GPU 内存不足 → 减小 tile size 重试
   - 网络加载失败 → 尝试其他模型或 CPU 模式

2. **不可恢复错误**
   - ncnn 库加载失败 → 禁用超分功能
   - 模型目录不存在 → 返回初始化错误

### 错误传播

```rust
// 错误转换示例
impl From<ncnn::Error> for UpscaleError {
    fn from(e: ncnn::Error) -> Self {
        UpscaleError::InferenceFailed(e.to_string())
    }
}
```

### 日志策略

- **INFO**: 初始化成功、GPU 检测结果、模型加载
- **WARN**: CPU 回退、tile size 调整
- **ERROR**: 处理失败、资源释放失败
- **DEBUG**: 详细推理时间、内存使用

## Testing Strategy

### 单元测试

1. **ModelLoader 测试**
   - 模型目录扫描
   - 模型名称解析
   - 无效模型处理

2. **ImageProcessor 测试**
   - 图像解码 (各种格式)
   - WebP 编码
   - Tile 分割/合并

3. **NcnnEngine 测试**
   - GPU 检测
   - 网络加载
   - 推理执行

### 属性测试 (Property-Based Testing)

使用 `proptest` 或 `quickcheck` 库：

1. **尺寸保持属性** - 验证输出尺寸 = 输入尺寸 × 缩放倍数
2. **格式有效性** - 验证输出是有效 WebP
3. **超时属性** - 验证超时机制正常工作
4. **取消属性** - 验证取消机制正常工作

### 集成测试

1. **端到端测试** - 从 UpscaleService 调用到结果返回
2. **缓存测试** - 验证缓存路径和格式兼容性
3. **并发测试** - 多任务并发处理

### 测试框架

- 单元测试: Rust 内置测试框架
- 属性测试: `proptest` crate
- 集成测试: Tauri 测试工具
