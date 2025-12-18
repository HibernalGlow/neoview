/**
 * Font Manager - 全局字体管理器
 * 负责在应用启动时和设置变化时应用自定义字体
 * 使用 Tauri 事件实现跨窗口同步
 */

import { listen, emit, type UnlistenFn } from '$lib/api/window';
import { settingsManager } from '$lib/settings/settingsManager';

export interface FontSettings {
  enabled: boolean;
  fontFamilies: string[];
  uiFontFamilies: string[];
  monoFontFamilies: string[];
}

/**
 * 从 localStorage 直接读取字体设置
 */
function loadFontSettingsFromStorage(): FontSettings | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const raw = window.localStorage.getItem('neoview-settings');
    if (!raw) return null;
    
    const parsed = JSON.parse(raw);
    return parsed?.theme?.customFont ?? null;
  } catch {
    return null;
  }
}

/**
 * 应用字体设置到 document
 */
export function applyFontSettings(fontSettings?: FontSettings): void {
  if (typeof document === 'undefined') return;
  
  // 优先使用传入的设置，其次尝试从 settingsManager 获取，最后从 localStorage 直接读取
  let settings = fontSettings;
  if (!settings) {
    try {
      settings = settingsManager.getSettings().theme.customFont;
    } catch {
      settings = loadFontSettingsFromStorage() ?? undefined;
    }
  }
  
  const root = document.documentElement;
  
  if (!settings || !settings.enabled) {
    // 移除自定义字体，恢复主题默认
    root.removeAttribute('data-custom-font');
    root.style.removeProperty('--font-custom-sans');
    root.style.removeProperty('--font-custom-mono');
    console.log('🔤 自定义字体已禁用，恢复主题默认');
    return;
  }

  // 启用自定义字体
  root.setAttribute('data-custom-font', 'enabled');

  // 生成 font-family 字符串
  const mainFonts = settings.fontFamilies.length > 0
    ? settings.fontFamilies.join(', ') + ', sans-serif'
    : null;
  
  const monoFonts = settings.monoFontFamilies.length > 0
    ? settings.monoFontFamilies.join(', ') + ', monospace'
    : null;

  // 应用到 CSS 变量
  if (mainFonts) {
    root.style.setProperty('--font-custom-sans', mainFonts);
  } else {
    root.style.removeProperty('--font-custom-sans');
  }
  
  if (monoFonts) {
    root.style.setProperty('--font-custom-mono', monoFonts);
  } else {
    root.style.removeProperty('--font-custom-mono');
  }
  
  console.log('🔤 字体设置已应用:', {
    enabled: settings.enabled,
    mainFonts,
    monoFonts
  });
}

/**
 * 广播字体设置变更到所有窗口
 */
export async function broadcastFontSettings(fontSettings: FontSettings): Promise<void> {
  try {
    await emit('font-settings-changed', fontSettings);
  } catch {
    // emit 失败时忽略
  }
}

/**
 * 初始化字体管理器
 * 在应用启动时调用，会应用保存的字体设置并监听变化
 */
export function initFontManager(): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  
  // 首次应用字体设置
  applyFontSettings();
  
  // 监听 settingsManager 变化（同窗口内部变化）
  const handleSettingsChange = () => {
    applyFontSettings();
  };
  settingsManager.addListener(handleSettingsChange);
  
  // 监听 Tauri 事件广播（跨窗口同步）
  let unlisten: UnlistenFn | null = null;
  listen<FontSettings>('font-settings-changed', (event) => {
    if (event.payload) {
      console.log('🔤 收到跨窗口字体设置变更');
      applyFontSettings(event.payload);
    }
  }).then(fn => {
    unlisten = fn;
  });
  
  // 返回清理函数
  return () => {
    settingsManager.removeListener(handleSettingsChange);
    if (unlisten) unlisten();
  };
}
