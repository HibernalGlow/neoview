/**
 * Ambient Background - 流光溢彩背景效果
 * 类似苹果灵动岛播放音乐时的效果
 * 从图片中提取多个主色调，生成流动的渐变动画
 */

const paletteCache = new Map<string, string[]>();

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * RGB 转 HSL
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
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

  return [h * 360, s * 100, l * 100];
}

/**
 * HSL 转 RGB
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  s /= 100;
  l /= 100;
  
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * 增强颜色饱和度和亮度，使其更适合流光效果
 */
function enhanceColor(r: number, g: number, b: number): string {
  const [h, s, l] = rgbToHsl(r, g, b);
  // 增加饱和度，调整亮度到中等偏亮
  const enhancedS = Math.min(100, s * 1.3 + 20);
  const enhancedL = clamp(l, 35, 65);
  const [er, eg, eb] = hslToRgb(h, enhancedS, enhancedL);
  return `rgb(${er}, ${eg}, ${eb})`;
}

/**
 * 计算两个颜色之间的差异
 */
function colorDistance(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export interface PaletteOptions {
  /** 要提取的颜色数量（默认 4） */
  count?: number;
  /** 采样的最大分辨率（默认 100） */
  maxDimension?: number;
  /** 是否增强颜色（默认 true） */
  enhance?: boolean;
}

interface ColorBin {
  count: number;
  r: number;
  g: number;
  b: number;
}

/**
 * 从图片中提取调色板（多个主色调）
 */
export async function extractPalette(
  src: string, 
  options: PaletteOptions = {}
): Promise<string[]> {
  const { count = 4, maxDimension = 100, enhance = true } = options;
  
  if (typeof document === "undefined" || !src) {
    return [];
  }
  
  // 检查缓存
  const cacheKey = `${src}:${count}`;
  if (paletteCache.has(cacheKey)) {
    return paletteCache.get(cacheKey) ?? [];
  }

  return new Promise((resolve) => {
    const img = new Image();
    let resolved = false;
    
    const done = (colors: string[]) => {
      if (resolved) return;
      resolved = true;
      if (colors.length > 0) {
        paletteCache.set(cacheKey, colors);
      }
      resolve(colors);
    };

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const naturalWidth = img.naturalWidth || img.width || 1;
        const naturalHeight = img.naturalHeight || img.height || 1;
        const maxSide = Math.max(naturalWidth, naturalHeight) || 1;
        const scale = maxSide > maxDimension ? maxDimension / maxSide : 1;
        const width = Math.max(1, Math.floor(naturalWidth * scale));
        const height = Math.max(1, Math.floor(naturalHeight * scale));
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          done([]);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        
        const colors = extractColorsFromCanvas(ctx, width, height, count, enhance);
        done(colors);
      } catch {
        done([]);
      }
    };
    
    img.onerror = () => {
      done([]);
    };
    
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}

/**
 * 从 ImageBitmap 提取调色板（复用已解码的图片）
 */
export function extractPaletteFromBitmap(
  bitmap: ImageBitmap,
  cacheKey?: string,
  options: PaletteOptions = {}
): string[] {
  const { count = 4, maxDimension = 100, enhance = true } = options;
  
  if (typeof document === "undefined") {
    return [];
  }
  
  // 检查缓存
  if (cacheKey) {
    const fullCacheKey = `${cacheKey}:${count}`;
    if (paletteCache.has(fullCacheKey)) {
      return paletteCache.get(fullCacheKey) ?? [];
    }
  }

  try {
    const canvas = document.createElement("canvas");
    const naturalWidth = bitmap.width || 1;
    const naturalHeight = bitmap.height || 1;
    const maxSide = Math.max(naturalWidth, naturalHeight) || 1;
    const scale = maxSide > maxDimension ? maxDimension / maxSide : 1;
    const width = Math.max(1, Math.floor(naturalWidth * scale));
    const height = Math.max(1, Math.floor(naturalHeight * scale));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return [];
    }
    
    ctx.drawImage(bitmap, 0, 0, width, height);
    
    const colors = extractColorsFromCanvas(ctx, width, height, count, enhance);
    
    if (colors.length > 0 && cacheKey) {
      paletteCache.set(`${cacheKey}:${count}`, colors);
    }
    
    return colors;
  } catch {
    return [];
  }
}

/**
 * 从 Canvas 中提取多个主色调
 */
function extractColorsFromCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  count: number,
  enhance: boolean
): string[] {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 50));
  
  // 使用更粗的量化来分组颜色
  const bins = new Map<number, ColorBin>();
  const quantize = (c: number) => Math.floor(c / 32); // 8 个级别
  
  // 采样整个图片
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      if (alpha < 128) continue; // 跳过透明像素
      
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      
      // 跳过接近灰色的颜色（饱和度太低）
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      if (saturation < 0.15) continue;
      
      const qr = quantize(r);
      const qg = quantize(g);
      const qb = quantize(b);
      const key = (qr << 8) | (qg << 4) | qb;
      
      let bin = bins.get(key);
      if (!bin) {
        bin = { count: 0, r: 0, g: 0, b: 0 };
        bins.set(key, bin);
      }
      bin.count += 1;
      bin.r += r;
      bin.g += g;
      bin.b += b;
    }
  }
  
  if (bins.size === 0) {
    // 没有找到饱和色，返回默认颜色
    return generateDefaultPalette(count);
  }
  
  // 按出现频率排序
  const sortedBins = Array.from(bins.values()).sort((a, b) => b.count - a.count);
  
  // 选择差异足够大的颜色
  const selectedColors: { r: number; g: number; b: number }[] = [];
  const minDistance = 60; // 最小颜色差异
  
  for (const bin of sortedBins) {
    if (selectedColors.length >= count) break;
    
    const avgR = Math.round(bin.r / bin.count);
    const avgG = Math.round(bin.g / bin.count);
    const avgB = Math.round(bin.b / bin.count);
    const candidate = { r: avgR, g: avgG, b: avgB };
    
    // 检查与已选颜色的距离
    const isTooClose = selectedColors.some(c => colorDistance(c, candidate) < minDistance);
    
    if (!isTooClose) {
      selectedColors.push(candidate);
    }
  }
  
  // 如果颜色不够，放宽条件再选一些
  if (selectedColors.length < count) {
    for (const bin of sortedBins) {
      if (selectedColors.length >= count) break;
      
      const avgR = Math.round(bin.r / bin.count);
      const avgG = Math.round(bin.g / bin.count);
      const avgB = Math.round(bin.b / bin.count);
      const candidate = { r: avgR, g: avgG, b: avgB };
      
      const isAlreadySelected = selectedColors.some(
        c => c.r === candidate.r && c.g === candidate.g && c.b === candidate.b
      );
      
      if (!isAlreadySelected) {
        selectedColors.push(candidate);
      }
    }
  }
  
  // 转换为 CSS 颜色字符串
  return selectedColors.map(c => {
    if (enhance) {
      return enhanceColor(c.r, c.g, c.b);
    }
    return `rgb(${c.r}, ${c.g}, ${c.b})`;
  });
}

/**
 * 生成默认的调色板（当图片没有足够饱和颜色时使用）
 */
function generateDefaultPalette(count: number): string[] {
  const defaults = [
    'rgb(99, 102, 241)',   // Indigo
    'rgb(236, 72, 153)',   // Pink
    'rgb(34, 197, 94)',    // Green
    'rgb(249, 115, 22)',   // Orange
    'rgb(168, 85, 247)',   // Purple
    'rgb(6, 182, 212)',    // Cyan
  ];
  return defaults.slice(0, count);
}

/**
 * 清除调色板缓存
 */
export function clearPaletteCache(): void {
  paletteCache.clear();
}
