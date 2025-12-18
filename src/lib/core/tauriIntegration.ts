/**
 * TauriIntegration - Tauri 后端集成
 * 
 * 提供与 Tauri 后端通信的加载函数
 * 用于 BookManager 的 setLoadFunctions
 */

import { invoke } from '$lib/api/adapter';
import type { VirtualPage } from './types';

// ============================================================================
// 类型定义
// ============================================================================

export interface FileEntry {
  path: string;
  name: string;
  size: number;
  lastModified: number;
  width?: number;
  height?: number;
}

export interface ArchiveEntry {
  path: string;
  name: string;
  size: number;
  index: number;
}

// ============================================================================
// 文件系统操作
// ============================================================================

/**
 * 列出目录中的图像文件
 */
export async function listImageFiles(dirPath: string): Promise<FileEntry[]> {
  try {
    const entries = await invoke<Array<{
      path: string;
      name: string;
      size: number;
      modified: number;
    }>>('list_image_files', { path: dirPath });
    
    return entries.map(e => ({
      path: e.path,
      name: e.name,
      size: e.size,
      lastModified: e.modified,
    }));
  } catch (error) {
    console.error('Failed to list image files:', error);
    return [];
  }
}

/**
 * 列出压缩包中的图像文件
 */
export async function listArchiveImages(archivePath: string): Promise<FileEntry[]> {
  try {
    const entries = await invoke<Array<{
      path: string;
      name: string;
      size: number;
      index: number;
    }>>('list_archive_images', { path: archivePath });
    
    return entries.map(e => ({
      path: e.path,
      name: e.name,
      size: e.size,
      lastModified: 0, // 压缩包内文件没有修改时间
    }));
  } catch (error) {
    console.error('Failed to list archive images:', error);
    return [];
  }
}

// ============================================================================
// 图像加载
// ============================================================================

/**
 * 从文件系统加载图像
 */
export async function loadImageFromFile(
  filePath: string,
  signal?: AbortSignal
): Promise<Blob> {
  // 检查是否已取消
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  
  try {
    // 使用现有的 load_image 命令
    const data = await invoke<number[]>('load_image', { path: filePath });
    
    // 再次检查是否已取消
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    
    return new Blob([new Uint8Array(data)], { type: 'image/png' });
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    throw error;
  }
}

/**
 * 从压缩包加载图像
 */
export async function loadImageFromArchive(
  archivePath: string,
  entryPath: string,
  signal?: AbortSignal
): Promise<Blob> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  
  try {
    // 使用现有的 load_image 命令，它会根据当前打开的书籍类型自动处理
    const data = await invoke<number[]>('load_image', {
      path: entryPath,
    });
    
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    
    return new Blob([new Uint8Array(data)], { type: 'image/png' });
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    throw error;
  }
}

// ============================================================================
// 缩略图加载
// ============================================================================

/**
 * 加载缩略图
 */
export async function loadThumbnail(
  bookPath: string,
  entryPath: string,
  signal?: AbortSignal
): Promise<Blob> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  
  try {
    const data = await invoke<string>('get_thumbnail', {
      bookPath,
      entryPath,
    });
    
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    
    // 假设返回的是 base64 编码的数据
    if (data.startsWith('data:')) {
      const response = await fetch(data);
      return response.blob();
    }
    
    // 或者是 blob URL
    if (data.startsWith('blob:')) {
      const response = await fetch(data);
      return response.blob();
    }
    
    // 否则假设是原始字节数组
    const bytes = JSON.parse(data) as number[];
    return new Blob([new Uint8Array(bytes)], { type: 'image/webp' });
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    throw error;
  }
}

// ============================================================================
// 超分辨率
// ============================================================================

/**
 * 超分辨率处理
 */
export async function upscaleImage(
  imageBlob: Blob,
  model: string,
  scale: number,
  signal?: AbortSignal
): Promise<Blob> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  
  try {
    // 将 Blob 转换为 base64
    const arrayBuffer = await imageBlob.arrayBuffer();
    const bytes = Array.from(new Uint8Array(arrayBuffer));
    
    const result = await invoke<number[]>('upscale_image', {
      imageData: bytes,
      model,
      scale,
    });
    
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    
    return new Blob([new Uint8Array(result)], { type: 'image/png' });
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    throw error;
  }
}

// ============================================================================
// BookManager 集成函数
// ============================================================================

/**
 * 创建图像加载函数
 */
export function createImageLoader(bookPath: string, isArchive: boolean) {
  return async (virtualPage: VirtualPage, signal: AbortSignal): Promise<Blob> => {
    const physicalPage = virtualPage.physicalPage;
    
    if (isArchive) {
      return loadImageFromArchive(bookPath, physicalPage.path, signal);
    } else {
      return loadImageFromFile(physicalPage.path, signal);
    }
  };
}

/**
 * 创建缩略图加载函数
 */
export function createThumbnailLoader(bookPath: string) {
  return async (virtualPage: VirtualPage, signal: AbortSignal): Promise<Blob> => {
    const physicalPage = virtualPage.physicalPage;
    return loadThumbnail(bookPath, physicalPage.path, signal);
  };
}

/**
 * 创建超分辨率函数
 */
export function createUpscaler(model: string = 'realesrgan-x4plus-anime', scale: number = 2) {
  return async (
    virtualPage: VirtualPage,
    imageBlob: Blob,
    signal: AbortSignal
  ): Promise<Blob> => {
    return upscaleImage(imageBlob, model, scale, signal);
  };
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 打开书籍的便捷函数
 * 自动检测是文件夹还是压缩包，并设置加载函数
 */
export async function openBookWithTauri(
  bookStore: {
    setLoadFunctions: (
      loadImage: (virtualPage: VirtualPage, signal: AbortSignal) => Promise<Blob>,
      loadThumbnail: (virtualPage: VirtualPage, signal: AbortSignal) => Promise<Blob>,
      upscaleImage?: (virtualPage: VirtualPage, imageBlob: Blob, signal: AbortSignal) => Promise<Blob>
    ) => void;
    openBook: (
      path: string,
      files: FileEntry[],
      options?: { isArchive?: boolean; startIndex?: number }
    ) => Promise<void>;
  },
  path: string,
  options?: {
    startIndex?: number;
    enableUpscale?: boolean;
    upscaleModel?: string;
    upscaleScale?: number;
  }
): Promise<void> {
  // 检测是否为压缩包
  const isArchive = /\.(zip|rar|7z|cbz|cbr|tar|gz)$/i.test(path);
  
  // 获取文件列表
  const files = isArchive
    ? await listArchiveImages(path)
    : await listImageFiles(path);
  
  if (files.length === 0) {
    throw new Error('No images found in the specified path');
  }
  
  // 设置加载函数
  const imageLoader = createImageLoader(path, isArchive);
  const thumbnailLoader = createThumbnailLoader(path);
  const upscaler = options?.enableUpscale
    ? createUpscaler(options.upscaleModel, options.upscaleScale)
    : undefined;
  
  bookStore.setLoadFunctions(imageLoader, thumbnailLoader, upscaler);
  
  // 打开书籍
  await bookStore.openBook(path, files, {
    isArchive,
    startIndex: options?.startIndex,
  });
}
