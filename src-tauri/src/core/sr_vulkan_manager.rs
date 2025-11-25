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

        let manager = Arc::new(SrVulkanManager {
            inner: Mutex::new(SrVulkanManagerInner {
                next_task_id: 0,
                tasks: HashMap::new(),
                job_key_map: HashMap::new(),
                task_key_map: HashMap::new(),
            }),
        });

        SrVulkanManager::spawn_load_thread(Arc::clone(&manager));

        Ok(manager)
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
        // Rust 端预处理：将 JXL/AVIF 转码为 JPEG(Q80)，其它格式直接透传
        let processed_data = preprocess_image_for_sr(image_data)?;

        let (task_id, receiver) = self.add_task(
            &processed_data,
            model,
            scale,
            tile_size,
            noise_level,
            width,
            height,
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

            let args = if width > 0 && height > 0 {
                PyTuple::new_bound(
                    py,
                    &[
                        data_obj.into_py(py),
                        model.into_py(py),
                        task_id.into_py(py),
                        width.into_py(py),
                        height.into_py(py),
                    ],
                )
            } else {
                PyTuple::new_bound(
                    py,
                    &[
                        data_obj.into_py(py),
                        model.into_py(py),
                        task_id.into_py(py),
                        (scale as f64).into_py(py),
                    ],
                )
            };

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
}

fn preprocess_image_for_sr(image_data: &[u8]) -> Result<Vec<u8>, String> {
    if is_jxl_image(image_data) {
        println!("[SrVulkanManager] Detected JXL image, transcoding to JPEG(Q80) before sr_vulkan");
        transcode_jxl_to_jpeg_q80(image_data)
    } else if is_avif_image(image_data) {
        println!(
            "[SrVulkanManager] Detected AVIF image, transcoding to JPEG(Q80) before sr_vulkan"
        );
        transcode_avif_to_jpeg_q80(image_data)
    } else {
        // 其他格式直接透传
        Ok(image_data.to_vec())
    }
}

fn is_jxl_image(data: &[u8]) -> bool {
    data.len() >= 12 && &data[0..8] == b"\x00\x00\x00\x0cjxl "
}

fn is_avif_image(data: &[u8]) -> bool {
    if data.len() < 12 {
        return false;
    }
    let marker = &data[4..12];
    marker == b"ftypavif" || marker == b"ftypavis"
}

fn transcode_jxl_to_jpeg_q80(data: &[u8]) -> Result<Vec<u8>, String> {
    let img = decode_jxl_to_dynamic_image(data)?;
    encode_dynamic_to_jpeg_q80(&img)
}

fn transcode_avif_to_jpeg_q80(data: &[u8]) -> Result<Vec<u8>, String> {
    if let Some(jpeg) = transcode_avif_with_ffmpeg(data) {
        return Ok(jpeg);
    }

    // 回退到 image crate 解码 AVIF
    println!("[SrVulkanManager] FFmpeg AVIF 转码失败，回退到 image crate");
    let img = image::load_from_memory_with_format(data, image::ImageFormat::Avif)
        .map_err(|e| format!("解码 AVIF 失败: {}", e))?;
    encode_dynamic_to_jpeg_q80(&img)
}

fn transcode_avif_with_ffmpeg(data: &[u8]) -> Option<Vec<u8>> {
    let temp_dir = std::env::temp_dir();
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?;
    let input_path = temp_dir.join(format!(
        "sr_avif_input_{}_{}.avif",
        std::process::id(),
        ts.as_nanos()
    ));
    let output_path = temp_dir.join(format!(
        "sr_avif_output_{}_{}.jpg",
        std::process::id(),
        ts.as_nanos()
    ));

    if let Err(e) = fs::write(&input_path, data) {
        eprintln!("[SrVulkanManager] 写入临时 AVIF 文件失败: {}", e);
        return None;
    }

    let mut cmd = FfmpegCommand::new();
    cmd.input(input_path.to_string_lossy().as_ref());

    // 单帧图像，输出 JPEG，使用适中的质量（约等于 Q80）
    cmd.args(&["-y", "-f", "image2", "-frames:v", "1", "-qscale:v", "4"]);
    cmd.output(output_path.to_string_lossy().as_ref());

    let result = match cmd.spawn() {
        Ok(mut child) => match child.wait() {
            Ok(status) if status.success() => fs::read(&output_path).map_err(|e| {
                eprintln!(
                    "[SrVulkanManager] 读取 FFmpeg AVIF 输出失败: {} - {}",
                    output_path.display(),
                    e
                );
                e
            }),
            Ok(_) => {
                eprintln!("[SrVulkanManager] FFmpeg AVIF 转码退出状态非 0");
                Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "ffmpeg avif transcode failed",
                ))
            }
            Err(e) => {
                eprintln!("[SrVulkanManager] 等待 FFmpeg AVIF 转码失败: {}", e);
                Err(e)
            }
        },
        Err(e) => {
            eprintln!("[SrVulkanManager] 启动 FFmpeg AVIF 转码失败: {}", e);
            Err(e)
        }
    };

    let _ = fs::remove_file(&input_path);
    let _ = fs::remove_file(&output_path);

    result.ok()
}

fn decode_jxl_to_dynamic_image(data: &[u8]) -> Result<image::DynamicImage, String> {
    let mut reader = Cursor::new(data);
    let jxl_image = JxlImage::builder()
        .read(&mut reader)
        .map_err(|e| format!("解码 JXL 失败: {}", e))?;

    let render = jxl_image
        .render_frame(0)
        .map_err(|e| format!("渲染 JXL 帧失败: {}", e))?;

    let fb = render.image_all_channels();
    let width = fb.width() as u32;
    let height = fb.height() as u32;
    let channels = fb.channels();
    let float_buf = fb.buf();

    if channels == 1 {
        let gray_data: Vec<u8> = float_buf
            .iter()
            .map(|&v| (v.clamp(0.0, 1.0) * 255.0) as u8)
            .collect();

        let gray_img = image::GrayImage::from_raw(width, height, gray_data)
            .ok_or_else(|| "Failed to create gray image from JXL data".to_string())?;
        return Ok(image::DynamicImage::ImageLuma8(gray_img));
    }

    if channels == 3 {
        let rgb_data: Vec<u8> = float_buf
            .iter()
            .map(|&v| (v.clamp(0.0, 1.0) * 255.0) as u8)
            .collect();

        let rgb_img = image::RgbImage::from_raw(width, height, rgb_data)
            .ok_or_else(|| "Failed to create RGB image from JXL data".to_string())?;
        return Ok(image::DynamicImage::ImageRgb8(rgb_img));
    }

    if channels >= 4 {
        let rgba_data: Vec<u8> = float_buf
            .chunks(channels)
            .flat_map(|chunk| {
                vec![
                    (chunk[0].clamp(0.0, 1.0) * 255.0) as u8,
                    (chunk[1].clamp(0.0, 1.0) * 255.0) as u8,
                    (chunk[2].clamp(0.0, 1.0) * 255.0) as u8,
                    (chunk.get(3).copied().unwrap_or(1.0).clamp(0.0, 1.0) * 255.0) as u8,
                ]
            })
            .collect();

        let rgba_img = image::RgbaImage::from_raw(width, height, rgba_data)
            .ok_or_else(|| "Failed to create RGBA image from JXL data".to_string())?;
        return Ok(image::DynamicImage::ImageRgba8(rgba_img));
    }

    Err(format!("Unsupported JXL channel count: {}", channels))
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
