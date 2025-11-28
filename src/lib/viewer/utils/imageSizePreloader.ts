/**
 * ImageSizePreloader - 图片尺寸预加载器
 * 
 * 在图片显示前预先获取尺寸信息，用于：
 * - 判断是否需要分割（横向图片）
 * - 判断是否需要旋转（自动旋转）
 * - 避免翻页时的闪现问题
 */

export interface ImageSize {
  width: number;
  height: number;
  aspectRatio: number;
  isLandscape: boolean;
}

// 尺寸缓存
const sizeCache = new Map<string, ImageSize>();

/**
 * 获取图片尺寸（带缓存）
 */
export async function getImageSize(src: string): Promise<ImageSize> {
  // 检查缓存
  if (sizeCache.has(src)) {
    return sizeCache.get(src)!;
  }
  
  // 加载图片获取尺寸
  const size = await loadImageSize(src);
  
  // 缓存结果
  sizeCache.set(src, size);
  
  return size;
}

/**
 * 预加载多张图片的尺寸
 */
export async function preloadImageSizes(srcs: string[]): Promise<Map<string, ImageSize>> {
  const results = new Map<string, ImageSize>();
  
  await Promise.all(
    srcs.map(async (src) => {
      try {
        const size = await getImageSize(src);
        results.set(src, size);
      } catch (error) {
        console.warn(`Failed to preload image size: ${src}`, error);
      }
    })
  );
  
  return results;
}

/**
 * 判断图片是否需要分割
 */
export function shouldSplitImage(size: ImageSize, threshold: number = 1.5): boolean {
  return size.isLandscape && size.aspectRatio > threshold;
}

/**
 * 判断图片是否需要自动旋转
 */
export function shouldAutoRotate(size: ImageSize): boolean {
  return size.isLandscape;
}

/**
 * 清除缓存
 */
export function clearSizeCache(): void {
  sizeCache.clear();
}

/**
 * 清除指定图片的缓存
 */
export function removeSizeCache(src: string): void {
  sizeCache.delete(src);
}

// ============================================================================
// 内部函数
// ============================================================================

function loadImageSize(src: string): Promise<ImageSize> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      const aspectRatio = height > 0 ? width / height : 1;
      
      resolve({
        width,
        height,
        aspectRatio,
        isLandscape: aspectRatio > 1,
      });
    };
    
    img.onerror = (error) => {
      reject(error);
    };
    
    img.src = src;
  });
}
