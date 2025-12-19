/**
 * 主题状态管理 store
 * 用于在多个子组件间共享主题相关状态和方法
 */
import { emit } from '@tauri-apps/api/event';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemeColorsVariant = Record<string, string>;

export interface ThemeConfig {
	name: string;
	description: string;
	colors: {
		light: ThemeColorsVariant;
		dark: ThemeColorsVariant;
	};
}

// 预设主题颜色方案
export const presetThemes: ThemeConfig[] = [
	{
		name: 'Amethyst Haze',
		description: '优雅的紫色调主题',
		colors: {
			light: {
				primary: 'oklch(0.5569 0.2403 293.3426)',
				background: 'oklch(0.9777 0.0041 301.4256)',
				foreground: 'oklch(0.3651 0.0325 287.0807)'
			},
			dark: {
				primary: 'oklch(0.7137 0.2210 293.5570)',
				background: 'oklch(0.2166 0.0215 292.8474)',
				foreground: 'oklch(0.9053 0.0245 293.5570)'
			}
		}
	},
	{
		name: 'Ocean Breeze',
		description: '清新的海洋蓝主题',
		colors: {
			light: {
				primary: 'oklch(0.5569 0.1803 240.0000)',
				background: 'oklch(0.9777 0.0041 240.0000)',
				foreground: 'oklch(0.3651 0.0325 240.0000)'
			},
			dark: {
				primary: 'oklch(0.7137 0.1610 240.0000)',
				background: 'oklch(0.2166 0.0215 240.0000)',
				foreground: 'oklch(0.9053 0.0245 240.0000)'
			}
		}
	},
	{
		name: 'Forest Mist',
		description: '自然的森林绿主题',
		colors: {
			light: {
				primary: 'oklch(0.5569 0.1803 140.0000)',
				background: 'oklch(0.9777 0.0041 140.0000)',
				foreground: 'oklch(0.3651 0.0325 140.0000)'
			},
			dark: {
				primary: 'oklch(0.7137 0.1610 140.0000)',
				background: 'oklch(0.2166 0.0215 140.0000)',
				foreground: 'oklch(0.9053 0.0245 140.0000)'
			}
		}
	},
	{
		name: 'Sunset Glow',
		description: '温暖的日落橙主题',
		colors: {
			light: {
				primary: 'oklch(0.5569 0.1803 40.0000)',
				background: 'oklch(0.9777 0.0041 40.0000)',
				foreground: 'oklch(0.3651 0.0325 40.0000)'
			},
			dark: {
				primary: 'oklch(0.7137 0.1610 40.0000)',
				background: 'oklch(0.2166 0.0215 40.0000)',
				foreground: 'oklch(0.9053 0.0245 40.0000)'
			}
		}
	}
];

/** 检测系统主题偏好 */
export function checkSystemTheme(): boolean {
	if (typeof window !== 'undefined') {
		return window.matchMedia('(prefers-color-scheme: dark)').matches;
	}
	return false;
}

/** 应用主题到 DOM */
export function applyTheme(mode: ThemeMode, theme: ThemeConfig, systemPrefersDark: boolean) {
	const root = document.documentElement;
	const isDark = mode === 'dark' || (mode === 'system' && systemPrefersDark);

	if (isDark) {
		root.classList.add('dark');
	} else {
		root.classList.remove('dark');
	}

	const colors = isDark ? theme.colors.dark : theme.colors.light;
	for (const [key, value] of Object.entries(colors)) {
		if (typeof value === 'string') {
			root.style.setProperty(`--${key}`, value);
		}
	}

	try {
		const runtimeThemePayload = {
			mode,
			themeName: theme.name,
			themes: theme.colors
		};
		localStorage.setItem('theme-mode', mode);
		localStorage.setItem('theme-name', theme.name);
		localStorage.setItem('runtime-theme', JSON.stringify(runtimeThemePayload));
		emit('theme-changed', runtimeThemePayload).catch(() => {});
	} catch {}
}

/** 从 localStorage 加载自定义主题 */
export function loadCustomThemes(): ThemeConfig[] {
	try {
		const rawCustom = localStorage.getItem('custom-themes');
		if (rawCustom) {
			const parsed = JSON.parse(rawCustom);
			if (Array.isArray(parsed)) {
				return parsed as ThemeConfig[];
			}
		}
	} catch {}
	return [];
}

/** 保存自定义主题到 localStorage */
export function persistCustomThemes(themes: ThemeConfig[]) {
	try {
		localStorage.setItem('custom-themes', JSON.stringify(themes));
	} catch {}
}

/** 解析 CSS 主题格式 */
export function parseCssTheme(css: string): { light: Record<string, string>; dark: Record<string, string> } | null {
	const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const light: Record<string, string> = {};
	const dark: Record<string, string> = {};

	const parseVars = (str: string, target: Record<string, string>) => {
		const regex = /--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
		let match;
		while ((match = regex.exec(str)) !== null) {
			target[match[1]] = match[2].trim();
		}
	};

	const rootMatch = cleanCss.match(/:root\s*{([^}]*)}/);
	if (rootMatch) parseVars(rootMatch[1], light);

	const darkMatch = cleanCss.match(/\.dark\s*{([^}]*)}/);
	if (darkMatch) parseVars(darkMatch[1], dark);

	if (Object.keys(light).length === 0 && Object.keys(dark).length === 0) {
		parseVars(cleanCss, light);
	}

	if (Object.keys(light).length === 0 && Object.keys(dark).length === 0) return null;

	if (Object.keys(dark).length === 0) Object.assign(dark, light);
	if (Object.keys(light).length === 0) Object.assign(light, dark);

	return { light, dark };
}
