/**
 * API 配置
 * 
 * 统一管理 Python 后端 API 地址
 * 通过环境变量 VITE_PYTHON_API_BASE 配置
 */

// Python 后端 API 基础 URL
// 可通过环境变量 VITE_PYTHON_API_BASE 覆盖
// 默认使用当前页面的 hostname，端口 8000
function getDefaultApiBase(): string {
    if (typeof window !== 'undefined') {
        // 浏览器环境：使用当前 hostname，默认端口 9008
        const hostname = window.location.hostname || 'localhost';
        return `http://${hostname}:9008/v1`;
    }
    // SSR 或其他环境
    return 'http://localhost:9008/v1';
}

export const PYTHON_API_BASE = import.meta.env.VITE_PYTHON_API_BASE || getDefaultApiBase();

/**
 * 获取 API 基础 URL（不含 /v1）
 */
export function getApiBaseUrl(): string {
    return PYTHON_API_BASE.replace('/v1', '');
}

/**
 * 获取 WebSocket 基础 URL
 */
export function getWsBaseUrl(): string {
    return PYTHON_API_BASE.replace('http://', 'ws://').replace('https://', 'wss://');
}
