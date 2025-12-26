//! 基准测试类型定义
//! 包含所有基准测试相关的数据结构

use serde::Serialize;

/// 基准测试结果
#[derive(Serialize, Clone)]
pub struct BenchmarkResult {
    /// 测试方法名称
    pub method: String,
    /// 图像格式
    pub format: String,
    /// 耗时（毫秒）
    pub duration_ms: f64,
    /// 是否成功
    pub success: bool,
    /// 错误信息
    pub error: Option<String>,
    /// 图像尺寸
    pub image_size: Option<(u32, u32)>,
    /// 输出文件大小（字节）
    pub output_size: Option<usize>,
}

/// 基准测试报告
#[derive(Serialize)]
pub struct BenchmarkReport {
    /// 文件路径
    pub file_path: String,
    /// 文件大小
    pub file_size: u64,
    /// 测试结果列表
    pub results: Vec<BenchmarkResult>,
}

/// 压缩包扫描结果
#[derive(Serialize, Clone)]
pub struct ArchiveScanResult {
    /// 压缩包总数
    pub total_count: usize,
    /// 文件夹路径
    pub folder_path: String,
}

/// 详细分步计时结果
#[derive(Serialize, Clone)]
pub struct DetailedBenchmarkResult {
    /// 测试方法名称
    pub method: String,
    /// 图像格式
    pub format: String,
    /// 解压用时（毫秒）
    pub extract_ms: f64,
    /// 解码用时（毫秒）
    pub decode_ms: f64,
    /// 缩放用时（毫秒）
    pub scale_ms: f64,
    /// 编码用时（毫秒）
    pub encode_ms: f64,
    /// 总用时（毫秒）
    pub total_ms: f64,
    /// 是否成功
    pub success: bool,
    /// 错误信息
    pub error: Option<String>,
    /// 输入大小（字节）
    pub input_size: usize,
    /// 输出大小（字节）
    pub output_size: Option<usize>,
    /// 原始尺寸
    pub original_dims: Option<(u32, u32)>,
    /// 输出尺寸
    pub output_dims: Option<(u32, u32)>,
}

/// 图片加载模式测试结果
#[derive(Debug, Clone, Serialize)]
pub struct LoadModeTestResult {
    /// 加载模式
    pub mode: String,
    /// 图像格式
    pub format: String,
    /// 输入大小（字节）
    pub input_size: usize,
    /// 输出大小（字节）
    pub output_size: usize,
    /// 解码耗时（毫秒）
    pub decode_ms: f64,
    /// 图像宽度
    pub width: Option<u32>,
    /// 图像高度
    pub height: Option<u32>,
    /// 是否成功
    pub success: bool,
    /// 错误信息
    pub error: Option<String>,
}

/// Bitmap 加载结果（用于前端 Canvas 渲染）
#[derive(Debug, Clone, Serialize)]
pub struct BitmapLoadResult {
    /// 像素数据
    pub data: Vec<u8>,
    /// 图像宽度
    pub width: u32,
    /// 图像高度
    pub height: u32,
    /// 解码耗时（毫秒）
    pub decode_ms: f64,
}

/// 真实场景测试结果
#[derive(Debug, Clone, Serialize)]
pub struct RealWorldTestResult {
    /// 视口大小
    pub viewport_size: usize,
    /// 总文件数
    pub total_files: usize,
    /// 总耗时（毫秒）
    pub total_time_ms: f64,
    /// 平均耗时（毫秒）
    pub avg_time_ms: f64,
    /// 缓存命中数
    pub cached_count: usize,
    /// 生成数
    pub generated_count: usize,
    /// 失败数
    pub failed_count: usize,
    /// 吞吐量（文件/秒）
    pub throughput: f64,
}

/// WIC + LZ4 压缩传输测试结果
#[derive(Debug, Clone, Serialize)]
pub struct WicLz4Result {
    /// 图像宽度
    pub width: u32,
    /// 图像高度
    pub height: u32,
    /// 原始大小（字节）
    pub original_size: usize,
    /// 压缩后大小（字节）
    pub compressed_size: usize,
    /// 压缩比
    pub compression_ratio: f64,
    /// WIC 解码耗时（毫秒）
    pub wic_decode_ms: f64,
    /// LZ4 压缩耗时（毫秒）
    pub lz4_compress_ms: f64,
    /// 总耗时（毫秒）
    pub total_ms: f64,
    /// 是否成功
    pub success: bool,
    /// 错误信息
    pub error: Option<String>,
    /// 压缩后的数据
    pub compressed_data: Vec<u8>,
}

/// 转码基准测试结果
#[derive(Serialize, Clone)]
pub struct TranscodeBenchmarkResult {
    /// 测试方法名称
    pub method: String,
    /// 输入格式
    pub input_format: String,
    /// 输出格式
    pub output_format: String,
    /// 解码耗时（毫秒）
    pub decode_ms: f64,
    /// 编码耗时（毫秒）
    pub encode_ms: f64,
    /// 总耗时（毫秒）
    pub total_ms: f64,
    /// 输入大小（字节）
    pub input_size: usize,
    /// 输出大小（字节）
    pub output_size: usize,
    /// 图像尺寸
    pub image_size: Option<(u32, u32)>,
    /// 是否成功
    pub success: bool,
    /// 错误信息
    pub error: Option<String>,
}

/// 转码基准测试报告
#[derive(Serialize)]
pub struct TranscodeBenchmarkReport {
    /// 文件路径
    pub file_path: String,
    /// 文件大小
    pub file_size: u64,
    /// 检测到的格式
    pub detected_format: String,
    /// 测试结果列表
    pub results: Vec<TranscodeBenchmarkResult>,
}
