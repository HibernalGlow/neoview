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

// 服务工具函数导出
export {
  checkOllamaStatus,
  startOllamaService,
  checkLibreTranslateStatus,
  applyCleanupRules,
  exportConfigToFile,
  parseImportedConfig,
  formatBytes,
  type AiConfigExport
} from './serviceUtils';
