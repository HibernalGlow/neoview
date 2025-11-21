// Runtime theme utilities for NeoView main and settings windows
// 运行时主题工具：从 localStorage 读取主题并应用到当前 WebView

export type RuntimeThemeMode = 'light' | 'dark' | 'system';

interface RuntimeThemeColors {
  primary: string;
  background: string;
  foreground: string;
}

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

  root.style.setProperty('--primary', colors.primary);
  root.style.setProperty('--background', colors.background);
  root.style.setProperty('--foreground', colors.foreground);
}

/**
 * 初始化当前窗口的主题，并监听系统主题 / 本地存储变化保持同步
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
}
