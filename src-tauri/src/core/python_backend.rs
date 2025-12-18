//! Python Backend Manager
//! 
//! 管理 Python `FastAPI` 后端进程的生命周期：
//! - 启动 Python 进程
//! - 健康检查等待
//! - 进程生命周期管理

use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Python 后端配置
#[derive(Clone, Debug)]
pub struct PythonBackendConfig {
    /// Python 可执行文件路径
    pub python_path: String,
    /// Python 后端目录
    pub backend_dir: String,
    /// 后端端口
    pub port: u16,
    /// 后端主机
    pub host: String,
    /// 健康检查超时（秒）
    pub health_check_timeout: u64,
}

impl Default for PythonBackendConfig {
    fn default() -> Self {
        Self {
            python_path: "python".to_string(),
            backend_dir: "src-python".to_string(),
            port: 8000,
            host: "127.0.0.1".to_string(),
            health_check_timeout: 30,
        }
    }
}

/// Python 后端管理器
pub struct PythonBackendManager {
    config: PythonBackendConfig,
    process: Arc<Mutex<Option<Child>>>,
}

impl PythonBackendManager {
    /// 创建新的管理器
    pub fn new(config: PythonBackendConfig) -> Self {
        Self {
            config,
            process: Arc::new(Mutex::new(None)),
        }
    }

    /// 启动 Python 后端
    pub fn start(&self) -> Result<(), String> {
        let mut process_guard = self.process.lock().map_err(|e| e.to_string())?;
        
        // 如果已经在运行，先停止
        if process_guard.is_some() {
            log::info!("🐍 Python 后端已在运行，跳过启动");
            return Ok(());
        }

        log::info!("🐍 启动 Python 后端...");
        log::info!("   Python: {}", self.config.python_path);
        log::info!("   目录: {}", self.config.backend_dir);
        log::info!("   地址: {}:{}", self.config.host, self.config.port);

        // 构建命令
        let child = Command::new(&self.config.python_path)
            .args([
                "-m", "uvicorn",
                "main:app",
                "--host", &self.config.host,
                "--port", &self.config.port.to_string(),
                "--log-level", "info",
            ])
            .current_dir(&self.config.backend_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("启动 Python 后端失败: {e}"))?;

        *process_guard = Some(child);
        log::info!("✅ Python 后端进程已启动");

        Ok(())
    }

    /// 停止 Python 后端
    pub fn stop(&self) -> Result<(), String> {
        let mut process_guard = self.process.lock().map_err(|e| e.to_string())?;
        
        if let Some(mut child) = process_guard.take() {
            log::info!("🛑 停止 Python 后端...");
            
            // 尝试优雅关闭
            #[cfg(unix)]
            {
                use std::os::unix::process::CommandExt;
                unsafe {
                    libc::kill(child.id() as i32, libc::SIGTERM);
                }
            }
            
            #[cfg(windows)]
            {
                // Windows 上直接 kill
                let _ = child.kill();
            }
            
            // 等待进程退出
            match child.wait() {
                Ok(status) => log::info!("✅ Python 后端已停止: {status}"),
                Err(e) => log::warn!("⚠️ 等待 Python 后端退出失败: {e}"),
            }
        }

        Ok(())
    }

    /// 检查 Python 后端是否正在运行
    pub fn is_running(&self) -> bool {
        let Ok(process_guard) = self.process.lock() else {
            return false;
        };
        
        if let Some(ref child) = *process_guard {
            // 检查进程是否还在运行
            // 注意：这里不能调用 try_wait，因为需要 &mut
            // 简单检查 id 是否存在
            child.id() > 0
        } else {
            false
        }
    }

    /// 等待健康检查通过
    pub async fn wait_for_health(&self) -> Result<(), String> {
        let url = format!("http://{}:{}/health", self.config.host, self.config.port);
        let timeout = Duration::from_secs(self.config.health_check_timeout);
        let interval = Duration::from_millis(500);
        let start = std::time::Instant::now();

        log::info!("⏳ 等待 Python 后端健康检查: {url}");

        while start.elapsed() < timeout {
            match reqwest::get(&url).await {
                Ok(response) if response.status().is_success() => {
                    log::info!("✅ Python 后端健康检查通过");
                    return Ok(());
                }
                Ok(response) => {
                    log::debug!("健康检查返回: {}", response.status());
                }
                Err(e) => {
                    log::debug!("健康检查失败: {e}");
                }
            }
            
            tokio::time::sleep(interval).await;
        }

        Err(format!("Python 后端健康检查超时 ({} 秒)", self.config.health_check_timeout))
    }

    /// 启动并等待健康检查
    pub async fn start_and_wait(&self) -> Result<(), String> {
        self.start()?;
        self.wait_for_health().await
    }

    /// 获取后端 URL
    pub fn get_base_url(&self) -> String {
        format!("http://{}:{}/v1", self.config.host, self.config.port)
    }
}

impl Drop for PythonBackendManager {
    fn drop(&mut self) {
        if let Err(e) = self.stop() {
            log::error!("停止 Python 后端失败: {e}");
        }
    }
}

/// 全局 Python 后端管理器
static PYTHON_BACKEND: std::sync::OnceLock<PythonBackendManager> = std::sync::OnceLock::new();

/// 初始化全局 Python 后端管理器
pub fn init_python_backend(config: PythonBackendConfig) -> &'static PythonBackendManager {
    PYTHON_BACKEND.get_or_init(|| PythonBackendManager::new(config))
}

/// 获取全局 Python 后端管理器
pub fn get_python_backend() -> Option<&'static PythonBackendManager> {
    PYTHON_BACKEND.get()
}
