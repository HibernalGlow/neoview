/**
 * AiServiceConfigCard 模块导出
 * 
 * AI 翻译服务配置卡片
 * 支持 LibreTranslate 和 Ollama 服务配置
 */

// 类型导出
export interface ServiceStatus {
  online: boolean | null;
  checking: boolean;
}

export interface OllamaModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
  };
  size_vram?: number;
}

// 工具函数
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}
