/**
 * Font Manager - 全局字体管理器
 * 负责在应用启动时和设置变化时应用自定义字体
 * 支持跨窗口同步（通过 localStorage 事件）
 */

import { settingsManager } from '$lib/settings/settingsManager';

export interface FontSettings {
  enabled: boolean;
  fontFamilies: string[];
  uiFontFamilies: string[];
  monoFontFamilies: string[];
}

/**
 * 从 localStorage 直接读取字体设置（用于跨窗口同步）
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
  
  if (!settings) {
    console.log('🔤 没有找到字体设置，跳过应用');
    return;
  }
  
  const root = document.documentElement;
  
  if (!settings.enabled) {
    // 移除自定义字体，恢复主题默认
    root.style.removeProperty('--font-sans');
    root.style.removeProperty('--font-mono');
    root.style.removeProperty('font-family');
    console.log('🔤 自定义字体已禁用，恢复主题默认');
    return;
  }

  // 生成 font-family 字符串
  const mainFonts = settings.fontFamilies.length > 0
    ? settings.fontFamilies.join(', ') + ', sans-serif'
    : null;
  
  const uiFonts = settings.uiFontFamilies.length > 0
    ? settings.uiFontFamilies.join(', ') + ', sans-serif'
    : mainFonts;
  
  const monoFonts = settings.monoFontFamilies.length > 0
    ? settings.monoFontFamilies.join(', ') + ', monospace'
    : null;

  // 应用到 CSS 变量
  if (mainFonts || uiFonts) {
    root.style.setProperty('--font-sans', uiFonts || mainFonts || '');
    root.style.setProperty('font-family', mainFonts || uiFonts || '');
  }
  
  if (monoFonts) {
    root.style.setProperty('--font-mono', monoFonts);
  }
  
  console.log('🔤 字体设置已应用:', {
    enabled: settings.enabled,
    mainFonts,
    uiFonts,
    monoFonts
  });
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
  
  // 监听 localStorage 变化（跨窗口同步，生产环境下 storage 事件可能无法正常触发）
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === 'neoview-settings' && e.newValue) {
      console.log('🔤 检测到跨窗口设置变化，重新应用字体');
      // 从新值中解析字体设置
      try {
        const parsed = JSON.parse(e.newValue);
        const fontSettings = parsed?.theme?.customFont;
        if (fontSettings) {
          applyFontSettings(fontSettings);
        }
      } catch {
        // 解析失败，使用 settingsManager
        applyFontSettings();
      }
    }
  };
  window.addEventListener('storage', handleStorageChange);
  
  // 返回清理函数
  return () => {
    settingsManager.removeListener(handleSettingsChange);
    window.removeEventListener('storage', handleStorageChange);
  };
}
