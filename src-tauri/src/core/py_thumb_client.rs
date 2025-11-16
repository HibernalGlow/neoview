//! NeoView - Python Thumbnail Client
//! 与 Python FastAPI 缩略图服务通信的客户端

use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use tokio::time::sleep;
use reqwest::Client;
use tauri::AppHandle;

/// Python 缩略图服务客户端
pub struct PyThumbClient {
    /// HTTP 客户端
    http: Client,
    /// 服务基础 URL
    base_url: String,
    /// Python 子进程
    python_process: Arc<Mutex<Option<Child>>>,
    /// 服务启动时间
    start_time: Instant,
}

/// 确保缩略图请求
#[derive(Debug, Serialize)]
pub struct EnsureReq {
    pub bookpath: String,
    pub source_path: String,
    #[serde(default)]
    pub is_folder: bool,
    #[serde(default)]
    pub is_archive: bool,
    #[serde(default)]
    pub source_mtime: i64,
    #[serde(default = "default_max_size")]
    pub max_size: i32,
}

fn default_max_size() -> i32 {
    2048
}

/// 预加载请求
#[derive(Debug, Serialize)]
pub struct PrefetchReq {
    pub dir_path: String,
    pub entries: Vec<serde_json::Value>,
}

/// 缩略图响应信息
#[derive(Debug, Deserialize)]
pub struct ThumbnailInfo {
    pub bookpath: String,
    pub width: i32,
    pub height: i32,
    pub file_size: i32,
}

/// 批量响应
#[derive(Debug, Deserialize)]
pub struct BatchResp {
    pub results: Vec<ThumbnailInfo>,
}

/// 健康检查响应
#[derive(Debug, Deserialize)]
pub struct HealthResp {
    pub status: String,
    pub workers: i32,
}

impl PyThumbClient {
    /// 创建新的 Python 缩略图客户端
    pub fn new() -> Result<Self, String> {
        let http = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;
        
        Ok(Self {
            http,
            base_url: "http://127.0.0.1:8899".to_string(),
            python_process: Arc::new(Mutex::new(None)),
            start_time: Instant::now(),
        })
    }
    
    /// 启动 Python 服务
    pub async fn start_service(&self) -> Result<(), String> {
        // 检查服务是否已运行
        if let Ok(_) = self.health_check().await {
            println!("✅ Python 缩略图服务已在运行");
            return Ok(());
        }
        
        // 获取 Python 脚本路径
        let script_path = std::env::current_exe()
            .map_err(|e| format!("获取可执行文件路径失败: {}", e))?
            .parent()
            .ok_or("无法获取可执行文件目录")?
            .join("python")
            .join("thumbnail_service.py");
        
        if !script_path.exists() {
            return Err(format!("Python 脚本不存在: {}", script_path.display()));
        }
        
        // 启动 Python 子进程
        let mut child = Command::new("python")
            .arg(&script_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("启动 Python 服务失败: {}", e))?;
        
        println!("🚀 启动 Python 缩略图服务...");
        
        // 等待服务启动
        let mut retries = 30; // 最多等待 30 秒
        while retries > 0 {
            sleep(Duration::from_secs(1)).await;
            
            match self.health_check().await {
                Ok(_) => {
                    println!("✅ Python 缩略图服务启动成功");
                    // 保存子进程引用
                    if let Ok(mut process_guard) = self.python_process.lock() {
                        *process_guard = Some(child);
                    }
                    return Ok(());
                }
                Err(_) => {
                    retries -= 1;
                    // 检查进程是否还在运行
                    if let Some(status) = child.try_wait().unwrap_or(None) {
                        return Err(format!("Python 服务意外退出: {:?}", status));
                    }
                }
            }
        }
        
        // 超时，杀死进程
        let _ = child.kill();
        Err("Python 服务启动超时".to_string())
    }
    
    /// 健康检查
    pub async fn health_check(&self) -> Result<HealthResp, String> {
        let resp = self.http
            .get(&format!("{}/health", self.base_url))
            .send()
            .await
            .map_err(|e| format!("请求健康检查失败: {}", e))?;
        
        if resp.status().is_success() {
            resp.json::<HealthResp>()
                .await
                .map_err(|e| format!("解析健康检查响应失败: {}", e))
        } else {
            Err(format!("健康检查失败: {}", resp.status()))
        }
    }
    
    /// 确保缩略图存在（返回 WebP 二进制数据）
    pub async fn ensure_thumbnail(&self, req: EnsureReq) -> Result<Vec<u8>, String> {
        let resp = self.http
            .post(&format!("{}/ensure", self.base_url))
            .json(&req)
            .send()
            .await
            .map_err(|e| format!("请求缩略图失败: {}", e))?;
        
        if resp.status().is_success() {
            resp.bytes()
                .await
                .map(|b| b.to_vec())
                .map_err(|e| format!("读取缩略图数据失败: {}", e))
        } else {
            let text = resp.text().await.unwrap_or_default();
            Err(format!("生成缩略图失败: {} - {}", resp.status(), text))
        }
    }
    
    /// 预加载目录缩略图
    pub async fn prefetch_directory(&self, req: PrefetchReq) -> Result<i32, String> {
        let resp = self.http
            .post(&format!("{}/prefetch", self.base_url))
            .json(&req)
            .send()
            .await
            .map_err(|e| format!("请求预加载失败: {}", e))?;
        
        if resp.status().is_success() {
            let json: serde_json::Value = resp.json()
                .await
                .map_err(|e| format!("解析预加载响应失败: {}", e))?;
            
            Ok(json["processed"].as_i64().unwrap_or(0) as i32)
        } else {
            let text = resp.text().await.unwrap_or_default();
            Err(format!("预加载失败: {} - {}", resp.status(), text))
        }
    }
    
    /// 批量获取缩略图信息（不含二进制数据）
    pub async fn batch_thumbnails(&self, bookpaths: &[String]) -> Result<Vec<ThumbnailInfo>, String> {
        if bookpaths.is_empty() {
            return Ok(Vec::new());
        }
        
        let paths_json = serde_json::to_string(bookpaths)
            .map_err(|e| format!("序列化路径失败: {}", e))?;
        
        let resp = self.http
            .get(&format!("{}/batch", self.base_url))
            .query(&[("bookpaths", &paths_json)])
            .send()
            .await
            .map_err(|e| format!("请求批量缩略图失败: {}", e))?;
        
        if resp.status().is_success() {
            let batch: BatchResp = resp.json()
                .await
                .map_err(|e| format!("解析批量响应失败: {}", e))?;
            Ok(batch.results)
        } else {
            let text = resp.text().await.unwrap_or_default();
            Err(format!("批量获取失败: {} - {}", resp.status(), text))
        }
    }
    
    /// 停止服务
    pub fn stop_service(&self) -> Result<(), String> {
        if let Ok(mut process_guard) = self.python_process.lock() {
            if let Some(mut child) = process_guard.take() {
                match child.kill() {
                    Ok(_) => {
                        println!("🛑 Python 缩略图服务已停止");
                        Ok(())
                    }
                    Err(e) => Err(format!("停止 Python 服务失败: {}", e))
                }
            } else {
                Ok(()) // 服务未运行
            }
        } else {
            Err("无法获取进程锁".to_string())
        }
    }
}

/// 全局 Python 客户端实例
pub struct PyThumbState {
    pub client: Arc<Mutex<Option<PyThumbClient>>>,
}

impl Default for PyThumbState {
    fn default() -> Self {
        Self {
            client: Arc::new(Mutex::new(None)),
        }
    }
}

/// 获取或创建客户端
async fn get_client(state: &tauri::State<'_, PyThumbState>) -> Result<PyThumbClient, String> {
    // 检查是否已有客户端
    {
        let client_guard = state.client.lock().unwrap();
        if let Some(ref client) = *client_guard {
            // 检查服务是否健康
            if let Ok(_) = client.health_check().await {
                return Ok(client.clone());
            }
        }
    }
    
    // 创建新客户端
    let client = PyThumbClient::new()?;
    
    // 启动服务
    client.start_service().await?;
    
    // 保存到状态
    {
        let mut client_guard = state.client.lock().unwrap();
        *client_guard = Some(client.clone());
    }
    
    Ok(client)
}

/// 获取文件修改时间
fn get_file_mtime(path: &Path) -> i64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH))
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 规范化路径（使用正斜杠）
fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}