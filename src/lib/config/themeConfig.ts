/**
 * 主题配置持久化
 * 将主题和字体设置保存到 config/theme.json 文件
 */
import { readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { emit } from '@tauri-apps/api/event';
import type { RuntimeThemePayload } from '$lib/utils/runtimeTheme';
import type { FontSettings } from '$lib/utils/fontManager';

export interface ThemeConfig {
  /** 运行时主题配置 */
  runtimeTheme?: RuntimeThemePayload;
  /** 字体设置 */
  fontSettings?: FontSettings;
  /** 最后更新时间 */
  lastUpdated?: string;
}

let configPath: string | null = null;

/**
 * 获取配置文件路径
 */
async function getConfigPath(): Promise<string> {
  if (configPath) return configPath;
  
  const dataDir = await appDataDir();
  configPath = await join(dataDir, 'theme.json');
  return configPath;
}

/**
 * 确保配置目录存在
 */
async function ensureConfigDir(): Promise<void> {
  const dataDir = await appDataDir();
  if (!(await exists(dataDir))) {
    await mkdir(dataDir, { recursive: true });
  }
}

/**
 * 加载主题配置
 */
export async function loadThemeConfig(): Promise<ThemeConfig> {
  try {
    const path = await getConfigPath();
    if (!(await exists(path))) {
      return {};
    }
    
    const content = await readTextFile(path);
    const config = JSON.parse(content) as ThemeConfig;
    console.log('📂 主题配置已从文件加载:', path);
    return config;
  } catch (err) {
    console.warn('加载主题配置失败，使用默认值:', err);
    return {};
  }
}

/**
 * 保存主题配置
 */
export async function saveThemeConfig(config: ThemeConfig): Promise<void> {
  try {
    await ensureConfigDir();
    const path = await getConfigPath();
    
    config.lastUpdated = new Date().toISOString();
    const content = JSON.stringify(config, null, 2);
    await writeTextFile(path, content);
    
    console.log('💾 主题配置已保存到文件:', path);
  } catch (err) {
    console.error('保存主题配置失败:', err);
    throw err;
  }
}

/**
 * 保存运行时主题并广播
 */
export async function saveRuntimeTheme(payload: RuntimeThemePayload): Promise<void> {
  const config = await loadThemeConfig();
  config.runtimeTheme = payload;
  await saveThemeConfig(config);
  
  // 广播到其他窗口
  await emit('theme-changed', payload).catch(() => {});
  
  // 同步到 localStorage 以便快速访问
  try {
    localStorage.setItem('runtime-theme', JSON.stringify(payload));
    localStorage.setItem('theme-mode', payload.mode);
    if (payload.themeName) {
      localStorage.setItem('theme-name', payload.themeName);
    }
  } catch {
    // localStorage 写入失败时忽略
  }
}

/**
 * 保存字体设置并广播
 */
export async function saveFontSettings(fontSettings: FontSettings): Promise<void> {
  const config = await loadThemeConfig();
  config.fontSettings = fontSettings;
  await saveThemeConfig(config);
  
  // 广播到其他窗口
  await emit('font-settings-changed', fontSettings).catch(() => {});
}

/**
 * 初始化：从文件加载配置到 localStorage
 */
export async function initThemeConfigFromFile(): Promise<ThemeConfig> {
  const config = await loadThemeConfig();
  
  // 同步到 localStorage
  if (config.runtimeTheme) {
    try {
      localStorage.setItem('runtime-theme', JSON.stringify(config.runtimeTheme));
      localStorage.setItem('theme-mode', config.runtimeTheme.mode);
      if (config.runtimeTheme.themeName) {
        localStorage.setItem('theme-name', config.runtimeTheme.themeName);
      }
    } catch {
      // 忽略
    }
  }
  
  return config;
}
