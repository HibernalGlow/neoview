//! HTTP Bridge - Web 浏览模式 API 服务器
//! 
//! 提供 HTTP API 端点，让浏览器客户端能够调用 Tauri 后端功能：
//! - POST /api/invoke/{command} - 调用 Tauri command
//! - GET /api/asset - 文件服务
//! - GET /api/events - SSE 事件流

use axum::{
    Router,
    routing::{get, post},
    extract::{Path, Query, State},
    response::{Json, Response, IntoResponse, Sse},
    http::{StatusCode, header},
    body::Body,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;
use futures::{stream::Stream, StreamExt};
use tower_http::cors::{CorsLayer, Any};
use base64::Engine as _;

/// HTTP Bridge 配置
#[derive(Clone)]
pub struct HttpBridgeConfig {
    pub port: u16,
    pub host: String,
    pub serve_frontend: bool,  // 是否同时 serve 前端
    pub frontend_dir: Option<std::path::PathBuf>,
}

impl Default for HttpBridgeConfig {
    fn default() -> Self {
        Self {
            port: 3457,
            host: "127.0.0.1".to_string(),
            serve_frontend: true,
            frontend_dir: None,
        }
    }
}

/// API 服务器状态
#[derive(Clone)]
pub struct ApiState {
    pub app_handle: tauri::AppHandle,
    pub event_tx: broadcast::Sender<SseEvent>,
}

/// SSE 事件
#[derive(Clone, Debug, Serialize)]
pub struct SseEvent {
    pub event: String,
    pub data: serde_json::Value,
}

/// API 响应格式
#[derive(Serialize)]
#[serde(untagged)]
pub enum ApiResponse<T> {
    Success { success: bool, data: T },
    Error { success: bool, error: String },
}

impl<T: Serialize> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        ApiResponse::Success { success: true, data }
    }
}

impl ApiResponse<()> {
    pub fn err(error: impl Into<String>) -> ApiResponse<()> {
        ApiResponse::Error { success: false, error: error.into() }
    }
}

/// Asset 查询参数
#[derive(Deserialize)]
pub struct AssetQuery {
    pub path: String,
    pub entry: Option<String>,  // 压缩包内文件路径
}

/// 启动 API 服务器
pub async fn start_api_server(
    app_handle: tauri::AppHandle,
    config: HttpBridgeConfig,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (event_tx, _) = broadcast::channel::<SseEvent>(100);
    
    let state = ApiState {
        app_handle: app_handle.clone(),
        event_tx,
    };

    // 配置 CORS - 允许 localhost:3456 访问
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // 获取前端 dist 目录路径
    let dist_dir = config.frontend_dir.clone().unwrap_or_else(|| {
        // 尝试多个可能的路径
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(std::path::Path::to_path_buf));
        
        // 生产模式：exe 同级的 dist 目录
        if let Some(ref dir) = exe_dir {
            let prod_dist = dir.join("dist");
            if prod_dist.exists() {
                return prod_dist;
            }
        }
        
        // 开发模式：项目根目录的 dist
        let dev_dist = std::path::PathBuf::from("../dist");
        if dev_dist.exists() {
            return dev_dist;
        }
        
        // 默认
        std::path::PathBuf::from("dist")
    });
    
    log::info!("📁 前端目录: {}", dist_dir.display());
    
    // 构建路由
    let mut app = Router::new()
        .route("/api/invoke/{command}", post(handle_invoke))
        .route("/api/asset", get(handle_asset))
        .route("/api/events", get(handle_events))
        .route("/api/health", get(handle_health));
    
    // 如果启用前端服务，添加静态文件服务
    if config.serve_frontend && dist_dir.exists() {
        log::info!("📦 启用前端静态文件服务: {}", dist_dir.display());
        
        // 使用 tower-http 的 ServeDir
        let serve_dir = tower_http::services::ServeDir::new(&dist_dir)
            .append_index_html_on_directories(true)
            .fallback(tower_http::services::ServeFile::new(dist_dir.join("index.html")));
        
        app = app.fallback_service(serve_dir);
    }
    
    let app = app.layer(cors).with_state(state);

    let addr = format!("{}:{}", config.host, config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    
    log::info!("🌐 API Server 启动: http://{}", addr);
    
    axum::serve(listener, app).await?;
    
    Ok(())
}

/// 健康检查端点
async fn handle_health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "neoview-api"
    }))
}

/// 处理 invoke 请求
async fn handle_invoke(
    State(state): State<ApiState>,
    Path(command): Path<String>,
    body: String,
) -> impl IntoResponse {
    // 解析请求体为 JSON
    let args: serde_json::Value = if body.is_empty() {
        serde_json::Value::Object(serde_json::Map::new())
    } else {
        match serde_json::from_str(&body) {
            Ok(v) => v,
            Err(e) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({
                        "success": false,
                        "error": format!("Invalid JSON: {}", e)
                    }))
                );
            }
        }
    };

    // 调用命令路由器
    match execute_command(&state.app_handle, &command, args).await {
        Ok(result) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "data": result
            }))
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "error": e
            }))
        ),
    }
}

/// 执行命令 - 路由到对应的处理函数
/// 
/// 由于 Tauri commands 使用 State<'_> 参数，我们需要直接调用底层逻辑
async fn execute_command(
    app_handle: &tauri::AppHandle,
    command: &str,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    use tauri::Manager;
    
    match command {
        // ===== 文件系统命令 =====
        "path_exists" => {
            let path = args.get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing path parameter")?;
            
            let exists = std::path::Path::new(path).exists();
            Ok(serde_json::Value::Bool(exists))
        }
        
        "browse_directory" => {
            let path = args.get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing path parameter")?;
            
            // 直接使用文件系统操作
            let entries = browse_directory_internal(path).await?;
            Ok(serde_json::to_value(entries).unwrap_or_default())
        }
        
        "read_directory" => {
            let path = args.get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing path parameter")?;
            
            let entries = read_directory_internal(path).await?;
            Ok(serde_json::to_value(entries).unwrap_or_default())
        }
        
        "get_file_info" => {
            let path = args.get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing path parameter")?;
            
            let info = get_file_info_internal(path).await?;
            Ok(serde_json::to_value(info).unwrap_or_default())
        }
        
        // ===== Book 命令 =====
        "get_current_book" => {
            let book_state = app_handle.state::<std::sync::Mutex<crate::core::BookManager>>();
            let manager = book_state.lock().map_err(|e| e.to_string())?;
            let book = manager.get_current_book().cloned();
            Ok(serde_json::to_value(book).unwrap_or_default())
        }
        
        // ===== 图片命令 =====
        "load_image_base64" => {
            let path = args.get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing path parameter")?;
            
            let data = load_image_base64_internal(path).await?;
            Ok(serde_json::Value::String(data))
        }
        
        "get_image_dimensions" => {
            let path = args.get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing path parameter")?;
            
            let dims = get_image_dimensions_internal(path).await?;
            Ok(serde_json::to_value(dims).unwrap_or_default())
        }
        
        // ===== 压缩包命令 =====
        "list_archive_contents" => {
            let path = args.get("path")
                .and_then(|v| v.as_str())
                .ok_or("Missing path parameter")?;
            
            let fs_state = app_handle.state::<crate::commands::fs_commands::FsState>();
            let archive_manager = fs_state.archive_manager.lock().map_err(|e| e.to_string())?;
            let path_buf = std::path::Path::new(path);
            let contents = archive_manager.list_contents(path_buf).map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(contents).unwrap_or_default())
        }
        
        "load_image_from_archive_base64" => {
            let archive_path = args.get("archivePath")
                .and_then(|v| v.as_str())
                .ok_or("Missing archivePath parameter")?;
            let entry_path = args.get("entryPath")
                .and_then(|v| v.as_str())
                .ok_or("Missing entryPath parameter")?;
            
            let fs_state = app_handle.state::<crate::commands::fs_commands::FsState>();
            let archive_manager = fs_state.archive_manager.lock().map_err(|e| e.to_string())?;
            let archive_path_buf = std::path::Path::new(archive_path);
            let data = archive_manager.extract_file(archive_path_buf, entry_path).map_err(|e| e.to_string())?;
            let base64_data = base64::engine::general_purpose::STANDARD.encode(&data);
            Ok(serde_json::Value::String(base64_data))
        }
        
        // ===== 缩略图命令 =====
        "has_thumbnail" => {
            let key = args.get("key")
                .and_then(|v| v.as_str())
                .ok_or("Missing key parameter")?;
            
            let thumb_state = app_handle.state::<crate::commands::thumbnail_commands::ThumbnailState>();
            // has_thumbnail 需要额外参数，简化为检查是否存在
            let has = thumb_state.db.has_thumbnail(key, 0, 0).unwrap_or(false);
            Ok(serde_json::Value::Bool(has))
        }
        
        "load_thumbnail_from_db" => {
            let key = args.get("key")
                .and_then(|v| v.as_str())
                .ok_or("Missing key parameter")?;
            
            let thumb_state = app_handle.state::<crate::commands::thumbnail_commands::ThumbnailState>();
            // 使用 load_thumbnail 方法，传入默认的 size 和 ghash
            match thumb_state.db.load_thumbnail(key, 0, 0) {
                Ok(Some(data)) => {
                    let base64_data = base64::engine::general_purpose::STANDARD.encode(&data);
                    Ok(serde_json::json!({
                        "data": base64_data,
                        "found": true
                    }))
                }
                Ok(None) => Ok(serde_json::json!({ "found": false })),
                Err(e) => Err(e.to_string()),
            }
        }
        
        // ===== 启动配置命令 =====
        "get_startup_config" => {
            // 返回默认配置
            Ok(serde_json::json!({
                "cacheDir": null,
                "upscaleEnabled": false,
                "preloadPages": 3
            }))
        }
        
        // ===== EMM 命令 =====
        "find_emm_databases" => {
            // 返回空数组
            Ok(serde_json::json!([]))
        }
        
        "find_emm_translation_database" => {
            Ok(serde_json::Value::Null)
        }
        
        "find_emm_setting_file" => {
            Ok(serde_json::Value::Null)
        }
        
        "load_emm_metadata" | "load_emm_metadata_by_path" => {
            Ok(serde_json::Value::Null)
        }
        
        // ===== 性能设置命令 =====
        "get_performance_settings" => {
            Ok(serde_json::json!({
                "preloadCount": 3,
                "cacheSize": 100
            }))
        }
        
        // ===== 超分设置命令 =====
        "get_upscale_settings" => {
            Ok(serde_json::json!({
                "enabled": false,
                "model": "default"
            }))
        }
        
        "get_global_upscale_enabled" => {
            Ok(serde_json::Value::Bool(false))
        }
        
        // ===== 系统命令 =====
        "get_system_stats" => {
            Ok(serde_json::json!({
                "cpuUsage": 0.0,
                "memoryUsage": 0.0
            }))
        }
        
        "check_ffmpeg_available" => {
            Ok(serde_json::Value::Bool(false))
        }
        
        // 默认：命令未实现，返回 null 而不是错误
        _ => {
            log::warn!("HTTP Bridge: 未实现的命令 '{}', 返回 null", command);
            // 返回 null 而不是错误，让前端能继续运行
            Ok(serde_json::Value::Null)
        }
    }
}

// ===== 内部辅助函数 =====

/// 浏览目录 - 返回文件和文件夹列表
async fn browse_directory_internal(path: &str) -> Result<Vec<serde_json::Value>, String> {
    let path = std::path::Path::new(path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }
    
    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(path).map_err(|e| e.to_string())?;
    
    for entry in read_dir.flatten() {
        let entry_path = entry.path();
        let metadata = entry.metadata().ok();
        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
        
        entries.push(serde_json::json!({
            "name": entry.file_name().to_string_lossy(),
            "path": entry_path.to_string_lossy(),
            "isDirectory": is_dir,
            "size": size,
        }));
    }
    
    Ok(entries)
}

/// 读取目录 - 与 browse_directory 类似
async fn read_directory_internal(path: &str) -> Result<Vec<serde_json::Value>, String> {
    browse_directory_internal(path).await
}

/// 获取文件信息
async fn get_file_info_internal(path: &str) -> Result<serde_json::Value, String> {
    let path = std::path::Path::new(path);
    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    
    Ok(serde_json::json!({
        "path": path.to_string_lossy(),
        "name": path.file_name().map(|n| n.to_string_lossy().to_string()),
        "isDirectory": metadata.is_dir(),
        "isFile": metadata.is_file(),
        "size": metadata.len(),
        "readonly": metadata.permissions().readonly(),
    }))
}

/// 加载图片为 base64
async fn load_image_base64_internal(path: &str) -> Result<String, String> {
    let data = tokio::fs::read(path).await.map_err(|e| e.to_string())?;
    let base64_data = base64::engine::general_purpose::STANDARD.encode(&data);
    
    // 检测 MIME 类型
    let mime = mime_guess::from_path(path).first_or_octet_stream().to_string();
    
    Ok(format!("data:{};base64,{}", mime, base64_data))
}

/// 获取图片尺寸
async fn get_image_dimensions_internal(path: &str) -> Result<serde_json::Value, String> {
    let data = tokio::fs::read(path).await.map_err(|e| e.to_string())?;
    
    // 使用 image crate 获取尺寸
    let reader = image::ImageReader::new(std::io::Cursor::new(&data))
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    
    let dims = reader.into_dimensions().map_err(|e| e.to_string())?;
    
    Ok(serde_json::json!({
        "width": dims.0,
        "height": dims.1
    }))
}

/// 处理 asset 请求 - 文件服务
async fn handle_asset(
    State(state): State<ApiState>,
    Query(query): Query<AssetQuery>,
) -> impl IntoResponse {
    let path = &query.path;
    
    // 如果有 entry 参数，从压缩包提取
    if let Some(entry) = &query.entry {
        return serve_archive_entry(&state.app_handle, path, entry).await;
    }
    
    // 普通文件服务
    serve_file(path).await
}

/// 服务普通文件
async fn serve_file(path: &str) -> Response<Body> {
    match tokio::fs::read(path).await {
        Ok(data) => {
            let mime = mime_guess::from_path(path)
                .first_or_octet_stream()
                .to_string();
            
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime)
                .header(header::CACHE_CONTROL, "max-age=3600")
                .body(Body::from(data))
                .unwrap()
        }
        Err(e) => {
            Response::builder()
                .status(StatusCode::NOT_FOUND)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::json!({
                    "success": false,
                    "error": format!("File not found: {}", e)
                }).to_string()))
                .unwrap()
        }
    }
}

/// 从压缩包提取并服务文件
async fn serve_archive_entry(
    app_handle: &tauri::AppHandle,
    archive_path: &str,
    entry_path: &str,
) -> Response<Body> {
    use tauri::Manager;
    
    let fs_state = app_handle.state::<crate::commands::fs_commands::FsState>();
    
    // 使用 ArchiveManager 提取文件
    let result = {
        let archive_manager = match fs_state.archive_manager.lock() {
            Ok(m) => m,
            Err(e) => {
                return Response::builder()
                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(serde_json::json!({
                        "success": false,
                        "error": format!("Lock error: {}", e)
                    }).to_string()))
                    .unwrap();
            }
        };
        let archive_path_buf = std::path::Path::new(archive_path);
        archive_manager.extract_file(archive_path_buf, entry_path)
    };
    
    match result {
        Ok(data) => {
            let mime = mime_guess::from_path(entry_path)
                .first_or_octet_stream()
                .to_string();
            
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime)
                .header(header::CACHE_CONTROL, "max-age=3600")
                .body(Body::from(data))
                .unwrap()
        }
        Err(e) => {
            Response::builder()
                .status(StatusCode::NOT_FOUND)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::json!({
                    "success": false,
                    "error": format!("Failed to extract: {}", e)
                }).to_string()))
                .unwrap()
        }
    }
}

/// 处理 SSE 事件流
async fn handle_events(
    State(state): State<ApiState>,
) -> Sse<impl Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>>> {
    let rx = state.event_tx.subscribe();
    
    let stream = futures::stream::unfold(rx, |mut rx| async move {
        match rx.recv().await {
            Ok(event) => {
                let data = serde_json::to_string(&event.data).unwrap_or_default();
                let sse_event = axum::response::sse::Event::default()
                    .event(&event.event)
                    .data(data);
                Some((Ok(sse_event), rx))
            }
            Err(broadcast::error::RecvError::Lagged(_)) => {
                // 客户端落后，发送一个空事件继续
                let sse_event = axum::response::sse::Event::default()
                    .event("ping")
                    .data("{}");
                Some((Ok(sse_event), rx))
            }
            Err(broadcast::error::RecvError::Closed) => {
                // 通道关闭，结束流
                None
            }
        }
    });
    
    // 先发送连接成功事件
    let initial = futures::stream::once(async {
        Ok(axum::response::sse::Event::default()
            .event("connected")
            .data("{}"))
    });
    
    let combined = futures::stream::select(initial, stream);
    
    Sse::new(combined).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(30))
            .text("ping")
    )
}

/// 广播事件到所有 SSE 客户端
pub fn broadcast_event(state: &ApiState, event: &str, data: serde_json::Value) {
    let _ = state.event_tx.send(SseEvent {
        event: event.to_string(),
        data,
    });
}
