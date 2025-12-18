// Runtime theme utilities for NeoView main and settings windows
// 运行时主题工具：从 localStorage 读取主题并应用到当前 WebView
// 支持 Tauri 事件广播实现跨窗口同步

import { listen, type UnlistenFn } from '$lib/api/window';

export type RuntimeThemeMode = 'light' | 'dark' | 'system';

type RuntimeThemeColors = Record<string, string>;

export interface RuntimeThemePayload {
  mode: RuntimeThemeMode;
  themeName?: string;
  themes: {
    light: RuntimeThemeColors;
    dark: RuntimeThemeColors;
  };
}

/**
 * 从 localStorage 读取当前主题配置
 */
export function loadRuntimeThemeFromStorage(): RuntimeThemePayload | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem('runtime-theme');
    if (!stored) return null;

    const parsed = JSON.parse(stored) as RuntimeThemePayload;
    if (!parsed || !parsed.themes || !parsed.themes.light || !parsed.themes.dark) return null;

    const mode =
      parsed.mode === 'light' || parsed.mode === 'dark' || parsed.mode === 'system'
        ? parsed.mode
        : 'system';

    return {
      ...parsed,
      mode
    };
  } catch {
    return null;
  }
}

/**
 * 根据存储的主题配置应用到当前 document.documentElement
 */
export function applyRuntimeThemeFromStorage() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const payload = loadRuntimeThemeFromStorage();
  if (!payload) return;

  const systemPrefersDark =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false;

  const isDark =
    payload.mode === 'dark' || (payload.mode === 'system' && systemPrefersDark);

  const root = document.documentElement;

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  const colors = isDark ? payload.themes.dark : payload.themes.light;
  if (!colors) return;

  for (const [key, value] of Object.entries(colors)) {
    if (typeof value === 'string') {
      root.style.setProperty(`--${key}`, value);
    }
  }
}

/**
 * 直接从 payload 应用主题（用于 Tauri 事件接收）
 */
export function applyRuntimeThemeFromPayload(payload: RuntimeThemePayload) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (!payload || !payload.themes) return;

  const systemPrefersDark =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false;

  const isDark =
    payload.mode === 'dark' || (payload.mode === 'system' && systemPrefersDark);

  const root = document.documentElement;

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  const colors = isDark ? payload.themes.dark : payload.themes.light;
  if (!colors) return;

  for (const [key, value] of Object.entries(colors)) {
    if (typeof value === 'string') {
      root.style.setProperty(`--${key}`, value);
    }
  }
  
  console.log('🎨 主题已通过 Tauri 事件应用:', payload.themeName || 'unknown');
}

/**
 * 初始化当前窗口的主题，并监听系统主题 / 本地存储 / Tauri 事件变化保持同步
 */
export function initializeRuntimeThemeListeners() {
  if (typeof window === 'undefined') return;

  // 初始应用一次
  applyRuntimeThemeFromStorage();

  // 跟随系统暗色模式变化
  if (typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMqChange = () => {
      applyRuntimeThemeFromStorage();
    };

    mq.addEventListener('change', handleMqChange);

    window.addEventListener('beforeunload', () => {
      mq.removeEventListener('change', handleMqChange);
    });
  }

  // 监听其他窗口更新 localStorage 的主题配置
  const handleStorage = (e: StorageEvent) => {
    if (
      e.key === 'runtime-theme' ||
      e.key === 'theme-mode' ||
      e.key === 'theme-name'
    ) {
      applyRuntimeThemeFromStorage();
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener('beforeunload', () => {
    window.removeEventListener('storage', handleStorage);
  });
  
  // 监听 Tauri 事件广播（跨窗口同步）
  let unlisten: UnlistenFn | null = null;
  listen<RuntimeThemePayload>('theme-changed', (event) => {
    if (event.payload) {
      // 同时更新 localStorage 以保持一致性
      try {
        localStorage.setItem('runtime-theme', JSON.stringify(event.payload));
        localStorage.setItem('theme-mode', event.payload.mode);
        if (event.payload.themeName) {
          localStorage.setItem('theme-name', event.payload.themeName);
        }
      } catch {
        // localStorage 写入失败时忽略
      }
      applyRuntimeThemeFromPayload(event.payload);
    }
  }).then(fn => {
    unlisten = fn;
  });
  
  window.addEventListener('beforeunload', () => {
    if (unlisten) unlisten();
  });
}
