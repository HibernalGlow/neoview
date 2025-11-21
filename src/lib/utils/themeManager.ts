/**
 * NeoView - 主题管理工具
 * 用于从 tweakcn.com 导入和应用主题
 */

import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir } from '@tauri-apps/api/path';

export interface TweakcnTheme {
    name: string;
    cssVars: {
        light: Record<string, string>;
        dark: Record<string, string>;
        theme?: Record<string, string>;
    };
}

/**
 * 从 tweakcn JSON 生成 CSS 变量
 */
export function generateCSSFromTheme(theme: TweakcnTheme): string {
    const { light, dark, theme: themeVars } = theme.cssVars;

    // 生成 :root 变量
    let css = ':root {\n';
    if (themeVars?.radius) {
        css += `\t--radius: ${themeVars.radius};\n`;
    }
    for (const [key, value] of Object.entries(light)) {
        css += `\t--${key}: ${value};\n`;
    }
    css += '}\n\n';

    // 生成 .dark 变量
    css += '.dark {\n';
    for (const [key, value] of Object.entries(dark)) {
        css += `\t--${key}: ${value};\n`;
    }
    css += '}\n';

    return css;
}

/**
 * 应用主题到 app.css
 */
export async function applyThemeToCSS(theme: TweakcnTheme, cssFilePath: string) {
    try {
        // 读取现有的 CSS 文件
        const cssContent = await readTextFile(cssFilePath);

        // 生成新的主题 CSS
        const newThemeCSS = generateCSSFromTheme(theme);

        // 替换 :root 和 .dark 部分
        const updatedCSS = cssContent.replace(
            /:root\s*\{[^}]*\}\s*\.dark\s*\{[^}]*\}/s,
            newThemeCSS
        );

        // 写回文件
        await writeTextFile(cssFilePath, updatedCSS);

        console.log('✅ 主题已应用:', theme.name);
        return true;
    } catch (error) {
        console.error('❌ 应用主题失败:', error);
        throw error;
    }
}

/**
 * 保存主题到本地
 */
export async function saveTheme(theme: TweakcnTheme) {
    try {
        const dataDir = await appDataDir();
        const themePath = `${dataDir}/themes/${theme.name}.json`;
        await writeTextFile(themePath, JSON.stringify(theme, null, 2));
        console.log('✅ 主题已保存:', themePath);
    } catch (error) {
        console.error('❌ 保存主题失败:', error);
        throw error;
    }
}

/**
 * 从 URL 获取主题
 */
export async function fetchThemeFromURL(url: string): Promise<TweakcnTheme> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const theme = await response.json();
        return theme;
    } catch (error) {
        console.error('❌ 获取主题失败:', error);
        throw error;
    }
}

/**
 * 预设主题列表
 */
export const PRESET_THEMES = [
    {
        name: 'Amethyst Haze',
        url: 'https://tweakcn.com/r/themes/amethyst-haze.json',
        description: '优雅的紫色调主题'
    },
    {
        name: 'Ocean Breeze',
        url: 'https://tweakcn.com/r/themes/ocean-breeze.json',
        description: '清新的海洋蓝主题'
    },
    {
        name: 'Forest Mist',
        url: 'https://tweakcn.com/r/themes/forest-mist.json',
        description: '自然的森林绿主题'
    },
    {
        name: 'Sunset Glow',
        url: 'https://tweakcn.com/r/themes/sunset-glow.json',
        description: '温暖的日落橙主题'
    }
];
