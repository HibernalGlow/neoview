const cache = new Map<string, string>();

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

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
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        const step = Math.max(1, Math.floor(Math.min(width, height) / 32));
        const sampleEdge = (x: number, y: number) => {
          const index = (y * width + x) * 4;
          const alpha = data[index + 3];
          if (alpha < 16) {
            return;
          }
          r += data[index];
          g += data[index + 1];
          b += data[index + 2];
          count += 1;
        };
        for (let x = 0; x < width; x += step) {
          sampleEdge(x, 0);
          sampleEdge(x, height - 1);
        }
        for (let y = 0; y < height; y += step) {
          sampleEdge(0, y);
          sampleEdge(width - 1, y);
        }
        if (count === 0) {
          for (let y = 0; y < height; y += step) {
            for (let x = 0; x < width; x += step) {
              sampleEdge(x, y);
            }
          }
        }
        if (count === 0) {
          done(null);
          return;
        }
        const avgR = clamp(Math.round(r / count), 0, 255);
        const avgG = clamp(Math.round(g / count), 0, 255);
        const avgB = clamp(Math.round(b / count), 0, 255);
        const color = `rgb(${avgR}, ${avgG}, ${avgB})`;
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
