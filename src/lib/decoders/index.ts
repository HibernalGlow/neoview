/**
 * NeoView - Image Decoders
 * 图片解码器模块
 */

export { NativeDecoder, nativeDecoder } from './NativeDecoder';
export { JXLDecoder, jxlDecoder } from './JXLDecoder';
export type { DecodeOptions, DecodeResult, DecodeProgress, ProgressCallback } from './NativeDecoder';
export type { JXLDecodeOptions, JXLDecodeResult } from './JXLDecoder';

/**
 * 简化的解码器接口
 */
export interface ImageDecoder {
  decode(data: ArrayBuffer | Uint8Array | Blob, options?: any): Promise<any>;
  isFormatSupported(format: string): boolean;
  getSupportedFormats(): string[];
}

/**
 * 解码图片 - 统一接口
 */
export async function decodeImage(
  imageData: ArrayBuffer | Uint8Array | Blob,
  options: { format?: string; quality?: number } = {}
): Promise<string> {
  const { nativeDecoder } = await import('./NativeDecoder');
  
  try {
    const result = await nativeDecoder.decode(imageData, options);
    return result.url;
  } catch (error) {
    console.error('Failed to decode image:', error);
    throw error;
  }
}

/**
 * 创建缩略图
 */
export async function createThumbnail(
  imageData: ArrayBuffer | Uint8Array | Blob,
  maxWidth: number = 200,
  maxHeight: number = 200,
  quality: number = 0.8
): Promise<string> {
  const { nativeDecoder } = await import('./NativeDecoder');
  
  try {
    return await nativeDecoder.createThumbnail(imageData, maxWidth, maxHeight, quality);
  } catch (error) {
    console.error('Failed to create thumbnail:', error);
    throw error;
  }
}

/**
 * 检查格式支持
 */
export async function isFormatSupported(format: string): Promise<boolean> {
  const { nativeDecoder } = await import('./NativeDecoder');
  return nativeDecoder.isFormatSupported(format);
}

/**
 * 获取支持的格式列表
 */
export async function getSupportedFormats(): Promise<string[]> {
  const { nativeDecoder } = await import('./NativeDecoder');
  return nativeDecoder.getSupportedFormats();
}