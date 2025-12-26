/**
 * 文件系统 API 工具函数
 * 包含共享的辅助函数
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * 带重试的 invoke 包装（解决 IPC 协议偶发失败问题）
 * @param cmd 命令名称
 * @param args 命令参数
 * @param maxRetries 最大重试次数
 */
export async function invokeWithRetry<T>(
  cmd: string,
  args: Record<string, unknown>,
  maxRetries = 2
): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await invoke<T>(cmd, args);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      // 如果是 IPC 连接错误，等待后重试
      if (i < maxRetries && lastError.message.includes('Failed to fetch')) {
        await new Promise(r => setTimeout(r, 50 * (i + 1)));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError;
}

/**
 * 根据文件扩展名获取 MIME type
 * @param filePath 文件路径
 */
export function getMimeTypeFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'avif': 'image/avif',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',
    'tiff': 'image/tiff',
    'tif': 'image/tiff',
    'svg': 'image/svg+xml',
    'jxl': 'image/png', // JXL 在后端已转换为 PNG
  };
  return mimeTypes[ext] || 'image/jpeg'; // 默认 JPEG
}

/**
 * Base64 字符串转 ArrayBuffer
 * @param base64 Base64 编码的字符串
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
