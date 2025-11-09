/**
 * NeoView - Native Image Decoder
 * 原生图片解码器，使用浏览器内置的图片解码能力
 * 支持所有浏览器原生格式：JPEG、PNG、WebP、AVIF、GIF、BMP、SVG 等
 * JXL 需要特殊处理
 */

export interface DecodeOptions {
  format?: string;
  quality?: number;
}

export interface DecodeResult {
  url: string;
  width: number;
  height: number;
  format: string;
  size: number;
}

export interface DecodeProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export type ProgressCallback = (progress: DecodeProgress) => void;

/**
 * 原生图片解码器
 */
export class NativeDecoder {
  private supportedFormats: Set<string>;
  private jxlSupported = false;
  private jxlDecoder: any = null;

  constructor() {
    this.supportedFormats = new Set();
    this.detectSupportedFormats();
    // 异步检查 JXL 支持
    this.checkJXLSupport().then(supported => {
      this.jxlSupported = supported;
      if (supported) {
        this.supportedFormats.add('jxl');
      }
    });
  }

  /**
   * 检测浏览器支持的图片格式
   */
  private detectSupportedFormats() {
    // 浏览器原生支持的格式
    this.supportedFormats.add('jpeg');
    this.supportedFormats.add('jpg');
    this.supportedFormats.add('png');
    this.supportedFormats.add('gif');
    this.supportedFormats.add('bmp');
    this.supportedFormats.add('svg');
    this.supportedFormats.add('ico');

    // 检测现代格式支持
    const canvas = document.createElement('canvas');
    
    // WebP 支持
    if (canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0) {
      this.supportedFormats.add('webp');
    }

    // AVIF 支持
    if (canvas.toDataURL('image/avif').indexOf('data:image/avif') === 0) {
      this.supportedFormats.add('avif');
    }

    // JXL 支持（需要检查）
    this.jxlSupported = this.checkJXLSupport();
    if (this.jxlSupported) {
      this.supportedFormats.add('jxl');
    }
  }

  /**
   * 检查 JXL 支持
   */
  private async checkJXLSupport(): Promise<boolean> {
    // JXL 解码器暂不可用
    return false;
  }

  /**
   * 检查是否支持指定格式
   */
  isFormatSupported(format: string): boolean {
    const lowerFormat = format.toLowerCase();
    return this.supportedFormats.has(lowerFormat) || 
           (lowerFormat === 'jpg' && this.supportedFormats.has('jpeg'));
  }

  /**
   * 获取所有支持的格式
   */
  getSupportedFormats(): string[] {
    return Array.from(this.supportedFormats);
  }

  /**
   * 解码图片数据
   */
  async decode(
    imageData: ArrayBuffer | Uint8Array | Blob,
    options: DecodeOptions = {},
    onProgress?: ProgressCallback
  ): Promise<DecodeResult> {
    return new Promise((resolve, reject) => {
      // 转换为 Blob
      const blob = imageData instanceof Blob 
        ? imageData 
        : new Blob([imageData]);

      // 检测格式
      const format = options.format || this.detectFormat(blob);
      
      // 检查是否为 JXL 格式
      if (format.toLowerCase() === 'jxl') {
        reject(new Error('JXL format is not supported. Please install a JXL decoder library.'));
        return;
      }
      
      // 检查浏览器是否支持该格式
      if (!this.isFormatSupported(format)) {
        reject(new Error(`Format ${format} is not supported`));
        return;
      }

      // 创建 URL
      const url = URL.createObjectURL(blob);

      // 创建图片元素
      const img = new Image();

      img.onload = () => {
        try {
          resolve({
            url: url,
            width: img.width,
            height: img.height,
            format: format,
            size: blob.size
          });
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };

      // 设置进度回调
      if (onProgress) {
        // 对于某些浏览器，可以使用 fetch 的进度
        this.trackProgress(url, onProgress).catch(console.warn);
      }

      img.src = url;
    });
  }

  /**
   * 跟踪加载进度
   */
  private async trackProgress(url: string, onProgress: ProgressCallback): Promise<void> {
    try {
      const response = await fetch(url);
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;

      const reader = response.body?.getReader();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        loaded += value.length;
        onProgress({
          loaded,
          total,
          percentage: total > 0 ? (loaded / total) * 100 : 0
        });
      }
    } catch (error) {
      console.warn('Failed to track progress:', error);
    }
  }

  /**
   * 检测图片格式
   */
  private detectFormat(blob: Blob): string {
    // 简单的格式检测，可以通过文件头
    return 'unknown'; // 实际实现中应该读取文件头
  }

  /**
   * 创建缩略图
   */
  async createThumbnail(
    imageData: ArrayBuffer | Uint8Array | Blob,
    maxWidth: number = 200,
    maxHeight: number = 200,
    quality: number = 0.8
  ): Promise<string> {
    const result = await this.decode(imageData);
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          // 计算缩略图尺寸
          let { width, height } = img;
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          
          if (ratio < 1) {
            width *= ratio;
            height *= ratio;
          }

          canvas.width = width;
          canvas.height = height;

          // 绘制缩略图
          ctx.drawImage(img, 0, 0, width, height);

          // 转换为 data URL
          const thumbnailUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(thumbnailUrl);
        } catch (error) {
          reject(error);
        } finally {
          URL.revokeObjectURL(result.url);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(result.url);
        reject(new Error('Failed to load image for thumbnail'));
      };

      img.src = result.url;
    });
  }

  /**
   * 批量解码
   */
  async decodeBatch(
    images: Array<{ data: ArrayBuffer | Uint8Array | Blob; options?: DecodeOptions }>,
    onProgress?: (index: number, progress: DecodeProgress) => void
  ): Promise<DecodeResult[]> {
    const results: DecodeResult[] = [];
    
    for (let i = 0; i < images.length; i++) {
      const { data, options = {} } = images[i];
      
      try {
        const result = await this.decode(
          data, 
          options, 
          onProgress ? (progress) => onProgress(i, progress) : undefined
        );
        results.push(result);
      } catch (error) {
        console.error(`Failed to decode image ${i}:`, error);
      }
    }
    
    return results;
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    // 原生解码器不需要特殊清理
  }
}

// 创建单例实例
export const nativeDecoder = new NativeDecoder();