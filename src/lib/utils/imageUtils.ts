/**
 * 图片工具函数
 */

/**
 * 检测图片是否为动图（GIF/WebP/APNG 动画）
 * 
 * @param url 图片 URL（支持 blob: URL）
 * @returns Promise<boolean> 是否为动图
 */
export async function isAnimatedImage(url: string): Promise<boolean> {
  // 从 URL 推断文件类型
  const lowerUrl = url.toLowerCase();
  
  // 非动图格式直接返回 false
  if (
    lowerUrl.endsWith('.jpg') ||
    lowerUrl.endsWith('.jpeg') ||
    lowerUrl.endsWith('.bmp') ||
    lowerUrl.endsWith('.ico')
  ) {
    return false;
  }
  
  // 可能是动图的格式：GIF, WebP, PNG (APNG)
  // 需要检查文件内容
  
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    // 检查 GIF 动画
    if (isAnimatedGif(bytes)) {
      return true;
    }
    
    // 检查 WebP 动画
    if (isAnimatedWebP(bytes)) {
      return true;
    }
    
    // 检查 APNG
    if (isAnimatedPng(bytes)) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.warn('检测动图失败:', error);
    return false;
  }
}

/**
 * 检测 GIF 是否为动画
 * GIF 动画包含多个图像块
 */
function isAnimatedGif(bytes: Uint8Array): boolean {
  // GIF 签名: GIF87a 或 GIF89a
  if (bytes.length < 6) return false;
  
  const signature = String.fromCharCode(...bytes.slice(0, 6));
  if (signature !== 'GIF87a' && signature !== 'GIF89a') {
    return false;
  }
  
  // 计算图像块数量
  // 图像块以 0x2C 开头
  let imageCount = 0;
  let i = 13; // 跳过头部
  
  while (i < bytes.length - 1) {
    const blockType = bytes[i];
    
    if (blockType === 0x2C) {
      // 图像描述符
      imageCount++;
      if (imageCount > 1) {
        return true; // 多于一帧就是动画
      }
      // 跳过图像描述符（10 字节）
      i += 10;
      // 跳过本地颜色表（如果有）
      const flags = bytes[i - 1];
      if (flags & 0x80) {
        const colorTableSize = 3 * (1 << ((flags & 0x07) + 1));
        i += colorTableSize;
      }
      // 跳过 LZW 最小码长
      i++;
      // 跳过数据子块
      while (i < bytes.length && bytes[i] !== 0) {
        i += bytes[i] + 1;
      }
      i++; // 跳过块终止符
    } else if (blockType === 0x21) {
      // 扩展块
      i += 2; // 跳过扩展类型
      // 跳过数据子块
      while (i < bytes.length && bytes[i] !== 0) {
        i += bytes[i] + 1;
      }
      i++; // 跳过块终止符
    } else if (blockType === 0x3B) {
      // 文件结束
      break;
    } else {
      i++;
    }
  }
  
  return false;
}

/**
 * 检测 WebP 是否为动画
 * 动画 WebP 包含 ANIM 块
 */
function isAnimatedWebP(bytes: Uint8Array): boolean {
  // WebP 签名: RIFF....WEBP
  if (bytes.length < 12) return false;
  
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  
  if (riff !== 'RIFF' || webp !== 'WEBP') {
    return false;
  }
  
  // 查找 ANIM 块
  let i = 12;
  while (i < bytes.length - 8) {
    const chunkType = String.fromCharCode(...bytes.slice(i, i + 4));
    
    if (chunkType === 'ANIM') {
      return true;
    }
    
    // 读取块大小
    const chunkSize = bytes[i + 4] | (bytes[i + 5] << 8) | (bytes[i + 6] << 16) | (bytes[i + 7] << 24);
    
    // 移动到下一个块（块大小需要对齐到偶数）
    i += 8 + chunkSize + (chunkSize & 1);
  }
  
  return false;
}

/**
 * 检测 PNG 是否为 APNG（动画 PNG）
 * APNG 包含 acTL 块
 */
function isAnimatedPng(bytes: Uint8Array): boolean {
  // PNG 签名
  if (bytes.length < 8) return false;
  
  const signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== signature[i]) {
      return false;
    }
  }
  
  // 查找 acTL 块（Animation Control）
  let i = 8;
  while (i < bytes.length - 12) {
    // 读取块长度（大端序）
    const length = (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];
    
    // 读取块类型
    const chunkType = String.fromCharCode(...bytes.slice(i + 4, i + 8));
    
    if (chunkType === 'acTL') {
      return true;
    }
    
    // IEND 块表示文件结束
    if (chunkType === 'IEND') {
      break;
    }
    
    // 移动到下一个块（长度 + 类型 + 数据 + CRC）
    i += 12 + length;
  }
  
  return false;
}

/**
 * 从 Blob 获取图片尺寸
 * 使用 Image 元素解码
 */
export async function getImageDimensionsFromBlob(blob: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    
    img.src = url;
  });
}

/**
 * 检查图片是否为横向（宽 > 高）
 */
export function isLandscapeImage(width: number, height: number): boolean {
  return width > height;
}

/**
 * 计算图片的宽高比
 */
export function getAspectRatio(width: number, height: number): number {
  if (height === 0) return 1;
  return width / height;
}
