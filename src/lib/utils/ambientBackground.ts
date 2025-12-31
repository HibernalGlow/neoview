/**
 * Ambient Background - 流光溢彩背景效果
 * 使用 Vibrant.js 从图片中提取主色调
 * 类似苹果灵动岛播放音乐时的效果
 */

import { Vibrant } from 'node-vibrant/browser';

// Swatch 类型定义
interface VibrantSwatch {
  hex: string;
  rgb: [number, number, number];
  hsl: [number, number, number];
  population: number;
}

// 颜色调色板缓存
const paletteCache = new Map<string, string[]>();

// 正在处理的请求，避免重复请求
const pendingRequests = new Map<string, Promise<string[]>>();

export interface PaletteOptions {
  /** 要提取的颜色数量（默认 6） */
  count?: number;
  /** 采样质量 1-10，越小越精确但越慢（默认 5） */
  quality?: number;
  /** 是否增强颜色饱和度（默认 true） */
  enhance?: boolean;
}

/**
 * 增强颜色 - 提高饱和度和调整亮度使其更适合流光效果
 */
function enhanceColor(hex: string): string {
  // 解析 hex 颜色
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  
  // RGB to HSL
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  // 增强：提高饱和度，调整亮度到中等偏亮
  const enhancedS = Math.min(1, s * 1.3 + 0.2);
  const enhancedL = Math.max(0.35, Math.min(0.65, l));
  
  // HSL to RGB
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  const q = enhancedL < 0.5 ? enhancedL * (1 + enhancedS) : enhancedL + enhancedS - enhancedL * enhancedS;
  const p = 2 * enhancedL - q;
  r = hue2rgb(p, q, h + 1/3);
  g = hue2rgb(p, q, h);
  b = hue2rgb(p, q, h - 1/3);
  
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

/**
 * 将 Vibrant Swatch 转换为 CSS 颜色字符串
 */
function swatchToColor(swatch: VibrantSwatch | null, enhance: boolean): string | null {
  if (!swatch) return null;
  const hex = swatch.hex;
  return enhance ? enhanceColor(hex) : hex;
}

/**
 * 从图片中提取调色板（使用 Vibrant.js）
 * 返回 6 种主色调：Vibrant, Muted, DarkVibrant, DarkMuted, LightVibrant, LightMuted
 */
export async function extractPalette(
  src: string,
  options: PaletteOptions = {}
): Promise<string[]> {
  const { count = 6, quality = 5, enhance = true } = options;
  
  if (typeof document === 'undefined' || !src) {
    return [];
  }
  
  // 检查缓存
  const cacheKey = `${src}:${count}:${enhance}`;
  if (paletteCache.has(cacheKey)) {
    return paletteCache.get(cacheKey) ?? [];
  }
  
  // 检查是否已有相同请求在处理中
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)!;
  }
  
  // 创建新请求
  const request = (async () => {
    try {
      // 使用 Vibrant.js 提取颜色
      const vibrant = new Vibrant(src, {
        quality: quality,
        colorCount: 64, // 内部采样数量
      });
      
      const palette = await vibrant.getPalette();
      
      // 按优先级提取颜色
      const swatches = [
        palette.Vibrant,
        palette.LightVibrant,
        palette.DarkVibrant,
        palette.Muted,
        palette.LightMuted,
        palette.DarkMuted,
      ];
      
      // 转换为颜色字符串，过滤空值
      const colors = swatches
        .map(swatch => swatchToColor(swatch, enhance))
        .filter((c): c is string => c !== null)
        .slice(0, count);
      
      // 如果提取的颜色不够，用默认颜色填充
      const defaultColors = [
        'rgb(99, 102, 241)',   // indigo
        'rgb(236, 72, 153)',   // pink
        'rgb(34, 197, 94)',    // green
        'rgb(234, 179, 8)',    // yellow
        'rgb(59, 130, 246)',   // blue
        'rgb(168, 85, 247)',   // purple
      ];
      
      while (colors.length < count) {
        colors.push(defaultColors[colors.length % defaultColors.length]);
      }
      
      // 缓存结果
      paletteCache.set(cacheKey, colors);
      
      return colors;
    } catch (error) {
      console.warn('[AmbientBackground] Vibrant.js extraction failed:', error);
      // 返回默认颜色
      return [
        'rgb(99, 102, 241)',
        'rgb(236, 72, 153)',
        'rgb(34, 197, 94)',
        'rgb(234, 179, 8)',
        'rgb(59, 130, 246)',
        'rgb(168, 85, 247)',
      ].slice(0, count);
    } finally {
      // 清理 pending 请求
      pendingRequests.delete(cacheKey);
    }
  })();
  
  pendingRequests.set(cacheKey, request);
  return request;
}

/**
 * 从 ImageBitmap 提取调色板
 * 用于已经加载的图片，避免重复加载
 */
export async function extractPaletteFromBitmap(
  bitmap: ImageBitmap,
  cacheKey: string,
  options: PaletteOptions = {}
): Promise<string[]> {
  const { count = 6, enhance = true } = options;
  
  // 检查缓存
  const fullCacheKey = `bitmap:${cacheKey}:${count}:${enhance}`;
  if (paletteCache.has(fullCacheKey)) {
    return paletteCache.get(fullCacheKey) ?? [];
  }
  
  try {
    // 将 ImageBitmap 转换为 canvas
    const canvas = document.createElement('canvas');
    const maxSize = 100; // 缩小尺寸以提高性能
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.floor(bitmap.width * scale));
    canvas.height = Math.max(1, Math.floor(bitmap.height * scale));
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    
    // 转换为 data URL
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    
    // 使用 Vibrant.js 提取
    const colors = await extractPalette(dataUrl, { count, enhance });
    
    // 缓存结果
    paletteCache.set(fullCacheKey, colors);
    
    return colors;
  } catch (error) {
    console.warn('[AmbientBackground] Bitmap extraction failed:', error);
    return [
      'rgb(99, 102, 241)',
      'rgb(236, 72, 153)',
      'rgb(34, 197, 94)',
      'rgb(234, 179, 8)',
      'rgb(59, 130, 246)',
      'rgb(168, 85, 247)',
    ].slice(0, count);
  }
}

/**
 * 清除调色板缓存
 */
export function clearPaletteCache(): void {
  paletteCache.clear();
  pendingRequests.clear();
}

/**
 * 获取缓存大小
 */
export function getPaletteCacheSize(): number {
  return paletteCache.size;
}

/**
 * 预加载图片的调色板
 */
export async function preloadPalette(src: string, options?: PaletteOptions): Promise<void> {
  await extractPalette(src, options);
}

/**
 * 批量预加载调色板
 */
export async function preloadPalettes(
  sources: string[],
  options?: PaletteOptions
): Promise<void> {
  await Promise.all(sources.map(src => extractPalette(src, options)));
}
