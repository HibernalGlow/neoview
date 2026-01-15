const cache = new Map<string, string>();

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * 从 ImageBitmap 计算背景色（复用已解码的图片，避免重复解码）
 */
export function computeBackgroundColorFromBitmap(
  bitmap: ImageBitmap,
  cacheKey?: string,
  maxDimension = 64
): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  
  // 检查缓存
  if (cacheKey && cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
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
      return null;
    }
    
    // 直接绘制 ImageBitmap，无需重新解码
    ctx.drawImage(bitmap, 0, 0, width, height);
    
    const color = extractDominantColor(ctx, width, height);
    
    if (color && cacheKey) {
      cache.set(cacheKey, color);
    }
    
    return color;
  } catch {
    return null;
  }
}

/**
 * 从 Canvas 上下文提取主色调
 */
function extractDominantColor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): string | null {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 32));
  const edgeThickness = Math.max(1, Math.floor(Math.min(width, height) / 16));

  type Bin = { count: number; r: number; g: number; b: number };
  const bins = new Map<number, Bin>();
  let totalCount = 0;

  const quantize = (c: number) => Math.floor(c / 24);
  const addSample = (r: number, g: number, b: number) => {
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
    totalCount += 1;
  };

  const sample = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const index = (y * width + x) * 4;
    const alpha = data[index + 3];
    if (alpha < 16) {
      return;
    }
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    addSample(r, g, b);
  };

  // 采样边缘像素
  for (let x = 0; x < width; x += step) {
    for (let y = 0; y < edgeThickness; y += step) {
      sample(x, y);
    }
    for (let y = height - edgeThickness; y < height; y += step) {
      sample(x, y);
    }
  }

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < edgeThickness; x += step) {
      sample(x, y);
    }
    for (let x = width - edgeThickness; x < width; x += step) {
      sample(x, y);
    }
  }

  // 如果边缘没有采样到，采样整个图片
  if (totalCount === 0) {
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        sample(x, y);
      }
    }
  }

  if (totalCount === 0) {
    return null;
  }

  // 找到最大的 bin
  let bestBin: Bin | null = null;
  for (const bin of bins.values()) {
    if (!bestBin || bin.count > bestBin.count) {
      bestBin = bin;
    }
  }

  if (!bestBin || bestBin.count === 0) {
    return null;
  }

  const chosen = bestBin as Bin;
  const avgR = clamp(Math.round(chosen.r / chosen.count), 0, 255);
  const avgG = clamp(Math.round(chosen.g / chosen.count), 0, 255);
  const avgB = clamp(Math.round(chosen.b / chosen.count), 0, 255);
  return `rgb(${avgR}, ${avgG}, ${avgB})`;
}

/**
 * 从 URL 计算背景色（传统方式，会触发额外解码）
 * @deprecated 优先使用 computeBackgroundColorFromBitmap
 */
export async function computeAutoBackgroundColor(src: string, maxDimension = 64): Promise<string | null> {
  if (typeof document === "undefined") {
    return null;
  }
  if (!src) {
    return null;
  }
  if (cache.has(src)) {
    return cache.get(src) ?? null;
  }
  return new Promise((resolve) => {
    const img = new Image();
    let resolved = false;
    const done = (color: string | null) => {
      if (resolved) return;
      resolved = true;
      if (color) {
        cache.set(src, color);
      }
      resolve(color);
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
          done(null);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        
        const color = extractDominantColor(ctx, width, height);
        done(color);
      } catch {
        done(null);
      }
    };
    img.onerror = () => {
      done(null);
    };
    img.src = src;
  });
}
