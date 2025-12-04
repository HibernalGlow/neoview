/**
 * Font Manager - 全局字体管理器
 * 负责在应用启动时和设置变化时应用自定义字体
 */

import { settingsManager } from '$lib/settings/settingsManager';

export interface FontSettings {
  enabled: boolean;
  fontFamilies: string[];
  uiFontFamilies: string[];
  monoFontFamilies: string[];
}

/**
 * 应用字体设置到 document
 */
export function applyFontSettings(fontSettings?: FontSettings): void {
  if (typeof document === 'undefined') return;
  
  const settings = fontSettings ?? settingsManager.getSettings().theme.customFont;
  if (!settings) return;
  
  const root = document.documentElement;
  
  if (!settings.enabled) {
    // 移除自定义字体，恢复主题默认
    root.style.removeProperty('--font-sans');
    root.style.removeProperty('--font-mono');
    root.style.removeProperty('font-family');
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
  // 首次应用字体设置
  applyFontSettings();
  
  // 监听设置变化
  const handleSettingsChange = () => {
    applyFontSettings();
  };
  
  settingsManager.addListener(handleSettingsChange);
  
  // 返回清理函数
  return () => {
    settingsManager.removeListener(handleSettingsChange);
  };
}
