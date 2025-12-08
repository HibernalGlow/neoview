//! Ollama API 代理命令
//! 通过后端代理绕过 CORS 限制

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Ollama 模型信息
#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
    pub modified_at: Option<String>,
    pub size: Option<u64>,
}

/// Ollama tags 响应
#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaTagsResponse {
    pub models: Vec<OllamaModel>,
}

/// Ollama generate 请求
#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaGenerateRequest {
    pub model: String,
    pub prompt: String,
    #[serde(default)]
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<OllamaOptions>,
}

/// Ollama 选项
#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_predict: Option<i32>,
}

/// Ollama generate 响应
#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaGenerateResponse {
    pub model: String,
    pub response: String,
    #[serde(default)]
    pub done: bool,
}

/// 检查 Ollama 服务状态
#[tauri::command]
pub async fn ollama_check_status(api_url: String) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let url = format!("{}/api/tags", api_url.trim_end_matches('/'));
    
    match client.get(&url).send().await {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// 获取 Ollama 模型列表
#[tauri::command]
pub async fn ollama_get_models(api_url: String) -> Result<Vec<OllamaModel>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let url = format!("{}/api/tags", api_url.trim_end_matches('/'));
    
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Ollama 返回错误: {}", response.status()));
    }

    let tags_response: OllamaTagsResponse = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    Ok(tags_response.models)
}

/// 调用 Ollama generate API
#[tauri::command]
pub async fn ollama_generate(
    api_url: String,
    model: String,
    prompt: String,
    temperature: Option<f32>,
    num_predict: Option<i32>,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let url = format!("{}/api/generate", api_url.trim_end_matches('/'));
    
    let request = OllamaGenerateRequest {
        model,
        prompt,
        stream: false,
        options: Some(OllamaOptions {
            temperature,
            num_predict,
        }),
    };

    let response = client
        .post(&url)
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Ollama 错误: {}", error_text));
    }

    let generate_response: OllamaGenerateResponse = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    Ok(generate_response.response)
}
