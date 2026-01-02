use pyo3::prelude::*;
use pyo3::types::{PyBytes, PyDict, PyModule, PyTuple};
use pyo3::IntoPy;
use std::collections::HashMap;
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use std::{fs, io::Cursor};

use ffmpeg_sidecar::command::FfmpegCommand;
use jxl_oxide::JxlImage;

pub struct SrVulkanManager {
    inner: Mutex<SrVulkanManagerInner>,
    /// 当前进度 (0.0 - 100.0)
    current_progress: Arc<Mutex<f32>>,
    /// 当前正在处理的task_id
    current_task_id: Arc<Mutex<Option<i32>>>,
}

struct SrVulkanManagerInner {
    next_task_id: i32,
    tasks: HashMap<i32, SrTaskEntry>,
    job_key_map: HashMap<String, i32>,
    task_key_map: HashMap<i32, String>,
}

struct SrTaskEntry {
    sender: Option<mpsc::Sender<Result<Vec<u8>, String>>>,
}

impl SrVulkanManager {
    pub fn new() -> Result<Arc<Self>, String> {
        Python::with_gil(|py| -> PyResult<()> {
            // 调试：打印 Python 环境和 sr_vulkan 模块信息
            let sys_module = PyModule::import_bound(py, "sys")?;
            let py_exe: String = sys_module
                .getattr("executable")?
                .extract()
                .unwrap_or_default();
            let py_ver: String = sys_module.getattr("version")?.extract().unwrap_or_default();
            println!("[SrVulkanManager] Python executable: {}", py_exe);
            println!("[SrVulkanManager] Python version: {}", py_ver);

            let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")?;

            let sr_file: String = sr_module
                .getattr("__file__")
                .and_then(|v| v.extract())
                .unwrap_or_else(|_| "<unknown>".to_string());
            let sr_version: String = sr_module
                .getattr("getVersion")?
                .call0()?
                .extract()
                .unwrap_or_else(|_| "<unknown>".to_string());

            println!(
                "[SrVulkanManager] sr_vulkan file: {} version: {}",
                sr_file, sr_version
            );

            if let Ok(model_obj) = sr_module.getattr("MODEL_REALESRGAN_ANIMAVIDEOV3_UP2X") {
                if let Ok(model_id) = model_obj.extract::<i32>() {
                    println!(
                        "[SrVulkanManager] MODEL_REALESRGAN_ANIMAVIDEOV3_UP2X id: {}",
                        model_id
                    );
                }
            }

            let _init_result: i32 = sr_module.getattr("init")?.call0()?.extract()?;
            println!("[SrVulkanManager] sr.init() -> {}", _init_result);

            let gpu_info_obj = sr_module.getattr("getGpuInfo")?.call0()?;
            let gpu_info: Option<Vec<String>> = gpu_info_obj.extract().unwrap_or(None);
            let use_gpu = gpu_info.as_ref().map(|v| !v.is_empty()).unwrap_or(false);
            println!("[SrVulkanManager] getGpuInfo -> {:?}", gpu_info);

            let gpu_id = if use_gpu { 0 } else { -1 };
            println!("[SrVulkanManager] selected gpu_id: {}", gpu_id);

            let _init_set_result: i32 = sr_module
                .getattr("initSet")?
                .call1((gpu_id, 0))?
                .extract()?;
            println!(
                "[SrVulkanManager] sr.initSet({}, 0) -> {}",
                gpu_id, _init_set_result
            );

            // 设置 WebP 输出质量为 85
            if let Ok(set_q) = sr_module.getattr("setWebpQuality") {
                let _ = set_q.call1((85,));
                println!("[SrVulkanManager] sr.setWebpQuality(85)");
            }

            Ok(())
        })
        .map_err(|e| format!("初始化 sr_vulkan 失败: {}", e))?;

        let current_progress = Arc::new(Mutex::new(0.0f32));
        let current_task_id = Arc::new(Mutex::new(None::<i32>));

        let manager = Arc::new(SrVulkanManager {
            inner: Mutex::new(SrVulkanManagerInner {
                next_task_id: 0,
                tasks: HashMap::new(),
                job_key_map: HashMap::new(),
                task_key_map: HashMap::new(),
            }),
            current_progress: Arc::clone(&current_progress),
            current_task_id: Arc::clone(&current_task_id),
        });

        SrVulkanManager::spawn_load_thread(Arc::clone(&manager));
        SrVulkanManager::spawn_progress_thread(Arc::clone(&current_progress));

        Ok(manager)
    }

    /// 启动进度轮询线程，捕获Python stdout并解析进度
    fn spawn_progress_thread(current_progress: Arc<Mutex<f32>>) {
        thread::spawn(move || {
            // 设置Python stdout重定向
            let setup_result = Python::with_gil(|py| -> PyResult<()> {
                // 创建一个自定义的stdout捕获类
                py.run_bound(
                    r#"
import sys
import io
import re

class ProgressCapture:
    def __init__(self, original_stream):
        self.progress = 0.0
        self.original_stream = original_stream
        
    def write(self, text):
        self.original_stream.write(text)
        # 解析进度: 匹配 "xx.xx%" 或 "progress: xx.xx" 或 "[xx.xx%]"
        # 支持各种库的常见输出格式
        match = re.search(r'(\d+\.?\d*)\s*%', text)
        if not match:
            # 兼容一些库可能输出 progress: 0.5 这样的格式
            match = re.search(r'progress[:\s]+(\d+\.?\d*)', text.lower())
        
        if match:
            try:
                new_val = float(match.group(1))
                # 过滤掉一些不合理的超大值
                if 0 <= new_val <= 100:
                    self.progress = new_val
            except:
                pass
    
    def flush(self):
        self.original_stream.flush()
    
    def get_progress(self):
        return self.progress
    
    def reset_progress(self):
        self.progress = 0.0

_sr_progress_capture = ProgressCapture(sys.stdout)
sys.stdout = _sr_progress_capture
sys.stderr = ProgressCapture(sys.stderr) # 也捕获 stderr，很多 C 库往这写

def _get_combined_progress():
    # 从两个流中取最大值（通常只有一个在更新）
    p1 = _sr_progress_capture.get_progress()
    p2 = sys.stderr.get_progress() if hasattr(sys.stderr, 'get_progress') else 0.0
    return max(p1, p2)

def _reset_combined_progress():
    _sr_progress_capture.reset_progress()
    if hasattr(sys.stderr, 'reset_progress'):
        sys.stderr.reset_progress()
"#,
                    None,
                    None,
                )?;
                Ok(())
            });

            if let Err(e) = setup_result {
                eprintln!("[SrVulkanManager] 设置进度捕获失败: {}", e);
                return;
            }

            println!("[SrVulkanManager] 进度捕获线程已启动");

            // 定期读取进度
            loop {
                thread::sleep(Duration::from_millis(200));

                let progress = Python::with_gil(|py| -> PyResult<f32> {
                    let progress: f32 = py
                        .eval_bound("_get_combined_progress()", None, None)?
                        .extract()?;
                    Ok(progress)
                });

                if let Ok(progress) = progress {
                    if progress > 0.0 {
                        println!("[SrVulkanManager DBG] Current progress: {}%", progress);
                    }
                    if let Ok(mut p) = current_progress.lock() {
                        *p = progress;
                    }
                }
            }
        });
    }

    fn spawn_load_thread(manager: Arc<SrVulkanManager>) {
        thread::spawn(move || loop {
            let result = Python::with_gil(|py| -> PyResult<()> {
                let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")?;
                let load_func = sr_module.getattr("load")?;
                let obj = load_func.call1((0,))?;

                if obj.is_none() {
                    py.allow_threads(|| thread::sleep(Duration::from_millis(10)));
                    return Ok(());
                }

                let tuple: &Bound<'_, PyTuple> = obj.downcast()?;
                let data_obj = tuple.get_item(0)?;
                let data: Vec<u8> = data_obj.extract()?;
                let task_id_obj = tuple.get_item(2)?;
                let task_id: i32 = task_id_obj.extract()?;

                let mut inner = match manager.inner.lock() {
                    Ok(guard) => guard,
                    Err(poisoned) => poisoned.into_inner(),
                };

                if let Some(entry) = inner.tasks.remove(&task_id) {
                    if let Some(sender) = entry.sender {
                        if data.is_empty() {
                            let _ = sender.send(Err("超分返回空数据".to_string()));
                        } else {
                            let _ = sender.send(Ok(data));
                        }
                    }
                    if let Some(job_key) = inner.task_key_map.remove(&task_id) {
                        inner.job_key_map.remove(&job_key);
                    }
                }

                Ok(())
            });

            if let Err(err) = result {
                eprintln!("sr_vulkan.load 线程错误: {}", err);
                thread::sleep(Duration::from_millis(100));
            }
        });
    }

    pub fn upscale_image_sync(
        &self,
        image_data: &[u8],
        model: i32,
        scale: i32,
        tile_size: i32,
        noise_level: i32,
        timeout: f64,
        width: i32,
        height: i32,
        job_key: Option<&str>,
    ) -> Result<Vec<u8>, String> {
        // Rust 端预处理：将 JXL/AVIF 转码为 JPEG(Q85)，其它格式直接透传
        let preprocess_result = preprocess_image_for_sr(image_data)?;

        // 如果调用者传入的尺寸为 0，使用预处理时解码得到的尺寸
        let final_width = if width <= 0 {
            preprocess_result.width.map(|w| w as i32).unwrap_or(0)
        } else {
            width
        };
        let final_height = if height <= 0 {
            preprocess_result.height.map(|h| h as i32).unwrap_or(0)
        } else {
            height
        };

        let (task_id, receiver) = self.add_task(
            &preprocess_result.data,
            model,
            scale,
            tile_size,
            noise_level,
            final_width,
            final_height,
            job_key,
        )?;

        let duration = if timeout.is_sign_positive() {
            Duration::from_secs_f64(timeout)
        } else {
            Duration::from_secs(60)
        };

        match receiver.recv_timeout(duration) {
            Ok(Ok(data)) => Ok(data),
            Ok(Err(err)) => Err(err),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                self.on_timeout(task_id);
                Err("任务超时".to_string())
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => Err("结果通道已断开".to_string()),
        }
    }

    fn add_task(
        &self,
        image_data: &[u8],
        model: i32,
        scale: i32,
        tile_size: i32,
        noise_level: i32,
        width: i32,
        height: i32,
        job_key: Option<&str>,
    ) -> Result<(i32, mpsc::Receiver<Result<Vec<u8>, String>>), String> {
        let (tx, rx) = mpsc::channel();
        let task_id;
        {
            let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
            inner.next_task_id += 1;
            task_id = inner.next_task_id;
            inner
                .tasks
                .insert(task_id, SrTaskEntry { sender: Some(tx) });
            if let Some(key) = job_key {
                inner.job_key_map.insert(key.to_string(), task_id);
                inner.task_key_map.insert(task_id, key.to_string());
            }
        }

        let status_result: Result<i32, PyErr> = Python::with_gil(|py| {
            println!(
                "[SrVulkanManager] add_task -> model={} scale={} width={} height={} tileSize={} job_key={:?}",
                model, scale, width, height, tile_size, job_key
            );

            let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")?;
            let add_func = sr_module.getattr("add")?;
            let data_obj = PyBytes::new_bound(py, image_data);

            // sr.add(data, model, task_id, scale, ...) - 始终传递 scale
            let args = PyTuple::new_bound(
                py,
                &[
                    data_obj.into_py(py),
                    model.into_py(py),
                    task_id.into_py(py),
                    (scale as f64).into_py(py),
                ],
            );

            let kwargs = PyDict::new_bound(py);
            // 强制使用 WebP 作为输出格式
            kwargs.set_item("format", "webp")?;
            kwargs.set_item("tileSize", tile_size)?;
            let status: i32 = add_func.call(args, Some(&kwargs))?.extract()?;
            println!(
                "[SrVulkanManager] sr.add(...) -> status={} (task_id={})",
                status, task_id
            );
            Ok(status)
        });

        let status = status_result.map_err(|e| format!("调用 sr_vulkan.add 失败: {}", e))?;

        if status <= 0 {
            let error = Python::with_gil(|py| -> PyResult<String> {
                let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")?;
                let err: String = sr_module.getattr("getLastError")?.call0()?.extract()?;
                println!(
                    "[SrVulkanManager] sr.add status={} getLastError='{}' (task_id={})",
                    status, err, task_id
                );
                Ok(err)
            })
            .unwrap_or_else(|_| format!("未知错误 (status={})", status));

            let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
            inner.tasks.remove(&task_id);
            if let Some(job_key) = inner.task_key_map.remove(&task_id) {
                inner.job_key_map.remove(&job_key);
            }

            return Err(format!("添加任务失败: {}", error));
        }

        Ok((task_id, rx))
    }

    fn on_timeout(&self, task_id: i32) {
        let task_id_opt = {
            let mut inner = match self.inner.lock() {
                Ok(guard) => guard,
                Err(poisoned) => poisoned.into_inner(),
            };
            inner.tasks.remove(&task_id);
            if let Some(job_key) = inner.task_key_map.remove(&task_id) {
                inner.job_key_map.remove(&job_key);
            }
            Some(task_id)
        };

        if let Some(id) = task_id_opt {
            let _ = Python::with_gil(|py| -> PyResult<()> {
                let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")?;
                let remove = sr_module.getattr("remove")?;
                let list = vec![id];
                remove.call1((list,))?;
                Ok(())
            });
        }
    }

    pub fn cancel_job(&self, job_key: &str) -> Result<(), String> {
        // 先从任务表中移除，并通知等待方任务已被取消
        let task_id_opt = {
            let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
            if let Some(task_id) = inner.job_key_map.remove(job_key) {
                inner.task_key_map.remove(&task_id);
                if let Some(entry) = inner.tasks.remove(&task_id) {
                    if let Some(sender) = entry.sender {
                        let _ = sender.send(Err("任务被取消".to_string()));
                    }
                }
                Some(task_id)
            } else {
                None
            }
        };

        // 再通知 sr_vulkan 侧移除底层任务
        if let Some(task_id) = task_id_opt {
            let _ = Python::with_gil(|py| -> PyResult<()> {
                let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")?;
                let remove = sr_module.getattr("remove")?;
                let list = vec![task_id];
                remove.call1((list,))?;
                Ok(())
            });
        }

        Ok(())
    }

    /// 获取当前超分进度 (0.0 - 100.0)
    pub fn get_progress(&self) -> f32 {
        self.current_progress.lock().map(|p| *p).unwrap_or(0.0)
    }

    /// 重置进度
    pub fn reset_progress(&self) {
        if let Ok(mut p) = self.current_progress.lock() {
            *p = 0.0;
        }
        // 同时重置Python端的进度
        let _ = Python::with_gil(|py| -> PyResult<()> {
            py.run_bound("_reset_combined_progress()", None, None)?;
            Ok(())
        });
    }
}

/// 预处理结果：包含转码后的数据和解码得到的尺寸
struct PreprocessResult {
    data: Vec<u8>,
    width: Option<u32>,
    height: Option<u32>,
}

/// 预处理图片：使用 WIC 解码 AVIF/JXL 等格式，转换为 JPEG 传给 PyO3
fn preprocess_image_for_sr(image_data: &[u8]) -> Result<PreprocessResult, String> {
    // 检测是否需要转码的格式
    if is_jxl_image(image_data) || is_avif_image(image_data) {
        let format_name = if is_jxl_image(image_data) {
            "JXL"
        } else {
            "AVIF"
        };
        println!(
            "[SrVulkanManager] Detected {} image, using WIC to transcode to JPEG",
            format_name
        );
        transcode_with_wic_and_size(image_data)
    } else {
        // 其他格式直接透传（PNG/JPEG/WebP 等 sr_vulkan 原生支持的）
        Ok(PreprocessResult {
            data: image_data.to_vec(),
            width: None,
            height: None,
        })
    }
}

fn is_jxl_image(data: &[u8]) -> bool {
    // JPEG XL 签名：裸码流 0xFF0A 或 容器格式 0x0000000C6A584C20
    if data.len() >= 2 && data[0] == 0xFF && data[1] == 0x0A {
        return true;
    }
    if data.len() >= 12 {
        let sig = &data[0..12];
        // Container format signature
        if sig[0..4] == [0x00, 0x00, 0x00, 0x0C] && &sig[4..8] == b"JXL " {
            return true;
        }
    }
    false
}

fn is_avif_image(data: &[u8]) -> bool {
    if data.len() < 12 {
        return false;
    }
    let marker = &data[4..12];
    marker == b"ftypavif" || marker == b"ftypavis" || marker == b"ftypheic" || marker == b"ftypheix"
}

/// 使用 WIC 解码图片，然后编码为 JPEG（Q85），同时返回尺寸
fn transcode_with_wic_and_size(image_data: &[u8]) -> Result<PreprocessResult, String> {
    use crate::core::wic_decoder::decode_image_from_memory_with_wic;

    // 使用 WIC 解码（支持 AVIF/JXL，需要安装对应编解码器）
    let decode_result = decode_image_from_memory_with_wic(image_data)
        .map_err(|e| format!("WIC 解码失败: {}", e))?;

    let width = decode_result.width;
    let height = decode_result.height;
    let bgra_pixels = decode_result.pixels;

    println!(
        "[SrVulkanManager] WIC decoded: {}x{}, {} bytes",
        width,
        height,
        bgra_pixels.len()
    );

    // BGRA -> RGB（JPEG 不支持 alpha 通道）
    let rgb_pixels: Vec<u8> = bgra_pixels
        .chunks_exact(4)
        .flat_map(|c| [c[2], c[1], c[0]]) // BGRA -> RGB
        .collect();

    // 使用 image crate 编码为 JPEG（Q85，速度快且保持质量）
    let mut output = Vec::new();
    {
        use image::codecs::jpeg::JpegEncoder;
        use image::ImageEncoder;
        let encoder = JpegEncoder::new_with_quality(&mut output, 85);
        encoder
            .write_image(&rgb_pixels, width, height, image::ExtendedColorType::Rgb8)
            .map_err(|e| format!("JPEG 编码失败: {}", e))?;
    }

    println!(
        "[SrVulkanManager] Transcoded to JPEG: {} bytes",
        output.len()
    );

    Ok(PreprocessResult {
        data: output,
        width: Some(width),
        height: Some(height),
    })
}

fn encode_dynamic_to_jpeg_q80(img: &image::DynamicImage) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    {
        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, 80);
        encoder
            .encode_image(img)
            .map_err(|e| format!("编码 JPEG 失败: {}", e))?;
    }
    Ok(output)
}
