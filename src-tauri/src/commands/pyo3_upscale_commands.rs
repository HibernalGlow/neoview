//! NeoView - PyO3 upscale commands.

use crate::core::pyo3_upscaler::{CacheStats, PyO3Upscaler, UpscaleModel};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{command, State};

#[derive(Clone)]
pub struct PyO3UpscalerState {
    pub manager: Arc<Mutex<Option<PyO3Upscaler>>>,
}

impl Default for PyO3UpscalerState {
    fn default() -> Self {
        Self {
            manager: Arc::new(Mutex::new(None)),
        }
    }
}

async fn ensure_manager_ready(
    state: &State<'_, PyO3UpscalerState>,
    max_wait_ms: u64,
) -> Result<(), String> {
    let mut waited = 0u64;
    let step = 50u64;

    loop {
        match state.manager.lock() {
            Ok(manager_guard) => {
                if manager_guard.is_some() {
                    return Ok(());
                }
            }
            Err(error) => return Err(format!("Failed to lock PyO3 upscale manager: {error}")),
        }

        if waited >= max_wait_ms {
            break;
        }

        std::thread::sleep(std::time::Duration::from_millis(step));
        waited += step;
    }

    Err("PyO3 upscale manager is not initialized".to_string())
}

fn get_manager(state: &State<'_, PyO3UpscalerState>) -> Result<PyO3Upscaler, String> {
    let manager_guard = state
        .manager
        .lock()
        .map_err(|error| format!("Failed to lock PyO3 upscale manager: {error}"))?;

    manager_guard
        .clone()
        .ok_or_else(|| "PyO3 upscale manager is not initialized".to_string())
}

fn build_model(
    manager: &PyO3Upscaler,
    model_name: String,
    scale: i32,
    tile_size: i32,
    noise_level: i32,
) -> Result<UpscaleModel, String> {
    let model_id = manager.get_model_id(&model_name)?;

    Ok(UpscaleModel {
        model_id,
        model_name,
        scale,
        tile_size,
        noise_level,
    })
}

#[command]
pub async fn init_pyo3_upscaler(
    python_module_path: String,
    cache_dir: String,
    manga_janai_model_dir: Option<String>,
    state: State<'_, PyO3UpscalerState>,
) -> Result<(), String> {
    let python_module_path = PathBuf::from(python_module_path);
    let base_cache_dir = PathBuf::from(cache_dir);
    let cache_dir = base_cache_dir.join("pyo3-upscale");

    let manager = PyO3Upscaler::new(python_module_path, cache_dir)?;
    if let Some(model_dir) = manga_janai_model_dir.as_deref() {
        manager.set_manga_janai_model_dir(model_dir)?;
    }

    println!("Initializing Python upscale module...");
    manager.initialize()?;
    println!("Python upscale module initialized");

    let mut manager_guard = state
        .manager
        .lock()
        .map_err(|error| format!("Failed to lock PyO3 upscale manager: {error}"))?;

    *manager_guard = Some(manager);

    Ok(())
}

#[command]
pub async fn set_pyo3_manga_janai_model_dir(
    model_dir: String,
    state: State<'_, PyO3UpscalerState>,
) -> Result<(), String> {
    ensure_manager_ready(&state, 5000).await?;
    let manager = get_manager(&state)?;
    manager.set_manga_janai_model_dir(&model_dir)
}

#[command]
pub async fn check_pyo3_upscaler_availability(
    state: State<'_, PyO3UpscalerState>,
) -> Result<bool, String> {
    ensure_manager_ready(&state, 5000).await?;
    let manager = get_manager(&state)?;
    manager.check_availability()
}

#[command]
pub async fn get_pyo3_available_models(
    state: State<'_, PyO3UpscalerState>,
) -> Result<Vec<String>, String> {
    ensure_manager_ready(&state, 5000).await?;
    let manager = get_manager(&state)?;
    manager.get_available_models()
}

#[command]
pub async fn get_pyo3_model_id(
    model_name: String,
    state: State<'_, PyO3UpscalerState>,
) -> Result<i32, String> {
    ensure_manager_ready(&state, 5000).await?;
    let manager = get_manager(&state)?;
    manager.get_model_id(&model_name)
}

#[command]
pub async fn pyo3_save_upscale_cache(
    image_hash: String,
    model_name: String,
    scale: i32,
    tile_size: i32,
    noise_level: i32,
    result_data: Vec<u8>,
    state: State<'_, PyO3UpscalerState>,
) -> Result<String, String> {
    ensure_manager_ready(&state, 5000).await?;
    let manager = get_manager(&state)?;
    let model = build_model(&manager, model_name, scale, tile_size, noise_level)?;
    let cache_path = manager.save_upscale_cache(&image_hash, &model, &result_data)?;

    Ok(cache_path.to_string_lossy().to_string())
}

#[command]
pub async fn pyo3_upscale_image_memory(
    image_data: Vec<u8>,
    model_name: String,
    scale: i32,
    tile_size: i32,
    noise_level: i32,
    timeout: f64,
    width: i32,
    height: i32,
    job_key: Option<String>,
    state: State<'_, PyO3UpscalerState>,
) -> Result<Vec<u8>, String> {
    println!("Rust received PyO3 upscale request:");
    println!("  image_data.len(): {}", image_data.len());
    println!("  model_name: {model_name}");
    println!("  scale: {scale}");
    println!("  tile_size: {tile_size}");
    println!("  noise_level: {noise_level}");
    println!("  timeout: {timeout}");
    println!("  job_key: {job_key:?}");

    ensure_manager_ready(&state, 5000).await?;
    let manager = get_manager(&state)?;
    let model = build_model(&manager, model_name, scale, tile_size, noise_level)?;

    manager.upscale_image_memory(
        &image_data,
        &model,
        timeout,
        width,
        height,
        job_key.as_deref(),
    )
}

#[command]
pub async fn pyo3_upscale_image(
    image_path: String,
    model_name: String,
    scale: i32,
    tile_size: i32,
    noise_level: i32,
    timeout: f64,
    state: State<'_, PyO3UpscalerState>,
) -> Result<Vec<u8>, String> {
    ensure_manager_ready(&state, 5000).await?;
    let manager = get_manager(&state)?;
    let model = build_model(&manager, model_name, scale, tile_size, noise_level)?;
    let image_path = PathBuf::from(image_path);

    manager.upscale_and_cache(&image_path, &model, timeout)
}

#[command]
pub async fn check_pyo3_upscale_cache(
    image_hash: String,
    model_name: String,
    scale: i32,
    tile_size: i32,
    noise_level: i32,
    state: State<'_, PyO3UpscalerState>,
) -> Result<Option<String>, String> {
    ensure_manager_ready(&state, 5000).await?;
    let manager = get_manager(&state)?;
    let model = build_model(&manager, model_name, scale, tile_size, noise_level)?;

    Ok(manager
        .check_cache(&image_hash, &model)
        .map(|path| path.to_string_lossy().to_string()))
}

#[command]
pub async fn get_pyo3_cache_stats(
    state: State<'_, PyO3UpscalerState>,
) -> Result<CacheStats, String> {
    ensure_manager_ready(&state, 5000).await?;
    let manager = get_manager(&state)?;
    manager.get_cache_stats()
}

#[command]
pub async fn cleanup_pyo3_cache(
    max_age_days: Option<u32>,
    state: State<'_, PyO3UpscalerState>,
) -> Result<usize, String> {
    ensure_manager_ready(&state, 5000).await?;
    let manager = get_manager(&state)?;
    manager.cleanup_cache(max_age_days.unwrap_or(30))
}

#[command]
pub async fn pyo3_cancel_job(
    job_key: String,
    state: State<'_, PyO3UpscalerState>,
) -> Result<(), String> {
    ensure_manager_ready(&state, 5000).await?;
    let manager = get_manager(&state)?;
    manager.cancel_job(&job_key)
}

#[command]
pub async fn test_pyo3_upscaler(
    test_image_path: String,
    state: State<'_, PyO3UpscalerState>,
) -> Result<String, String> {
    ensure_manager_ready(&state, 5000).await?;
    let manager = get_manager(&state)?;
    let test_image_path = PathBuf::from(test_image_path);

    if !test_image_path.exists() {
        return Err(format!(
            "Test image does not exist: {}",
            test_image_path.display()
        ));
    }

    let model = UpscaleModel {
        model_id: 0,
        model_name: "cunet".to_string(),
        scale: 2,
        tile_size: 0,
        noise_level: 0,
    };

    let result = manager.upscale_and_cache(&test_image_path, &model, 60.0)?;

    use crate::core::path_utils::{build_path_key, calculate_path_hash};
    use crate::models::BookType;

    let path_key = build_path_key(
        test_image_path.to_str().unwrap_or(""),
        test_image_path.to_str().unwrap_or(""),
        &BookType::Folder,
        None,
    );
    let image_hash = calculate_path_hash(&path_key);
    let cache_path = manager.get_cache_path(&image_hash, &model)?;

    Ok(format!(
        "Test succeeded\nInput: {}\nOutput size: {} bytes\nCache path: {}",
        test_image_path.display(),
        result.len(),
        cache_path.display()
    ))
}

#[command]
pub async fn read_upscale_cache_file(cache_path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&cache_path).map_err(|error| format!("Failed to read cache file: {error}"))
}

#[command]
pub async fn get_image_data_for_upscale(
    image_path: String,
    _inner_path: Option<String>,
) -> Result<Vec<u8>, String> {
    std::fs::read(&image_path).map_err(|error| format!("Failed to read image file: {error}"))
}
