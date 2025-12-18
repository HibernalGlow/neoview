/**
 * 启动配置管理
 * 用于前后端共享的配置文件
 * 使用 Python HTTP API 进行通信
 */
import { apiPost, apiGet } from '$lib/api/http-bridge';

/** 超分条件配置（与后端对应） */
export interface UpscaleConditionConfig {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  modelName: string;
  scale: number;
  tileSize: number;
  noiseLevel: number;
  skip: boolean;
}

export interface StartupConfig {
  /** 缓存根目录（缩略图等） */
  cacheDir?: string;
  /** 超分缓存目录 */
  cacheUpscaleDir?: string;
  /** Python 模块路径 */
  pythonModulePath?: string;
  /** 超分条件启用状态 */
  upscaleConditionsEnabled?: boolean;
  /** 超分条件列表 */
  upscaleConditions?: UpscaleConditionConfig[];
}

/**
 * 获取启动配置
 */
export async function getStartupConfig(): Promise<StartupConfig> {
  try {
    return await apiGet<StartupConfig>('/system/startup-config');
  } catch (err) {
    console.error('获取启动配置失败:', err);
    return {};
  }
}

/**
 * 保存启动配置
 */
export async function saveStartupConfig(config: StartupConfig): Promise<void> {
  try {
    await apiPost('/system/startup-config', config);
    console.log('✅ 启动配置已保存');
  } catch (err) {
    console.error('❌ 保存启动配置失败:', err);
    throw err;
  }
}

/**
 * 更新启动配置的单个字段
 */
export async function updateStartupConfigField(
  field: keyof StartupConfig,
  value: string | null
): Promise<void> {
  try {
    await apiPost('/system/startup-config/field', { field, value });
    console.log(`✅ 启动配置字段 ${field} 已更新`);
  } catch (err) {
    console.error(`❌ 更新启动配置字段 ${field} 失败:`, err);
    throw err;
  }
}

/**
 * 同步前端设置到启动配置
 * 在设置页面保存时调用
 */
export async function syncSettingsToStartupConfig(settings: {
  thumbnailDirectory?: string;
}): Promise<void> {
  const config: StartupConfig = {
    cacheDir: settings.thumbnailDirectory,
  };
  
  // 如果有 cacheDir，自动设置 cacheUpscaleDir
  if (config.cacheDir) {
    config.cacheUpscaleDir = `${config.cacheDir}\\pyo3-upscale`;
  }
  
  await saveStartupConfig(config);
}
