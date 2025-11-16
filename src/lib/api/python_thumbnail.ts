import { invoke } from '@tauri-apps/api/core';

/**
 * Python 缩略图服务 API
 * 提供基于 Python + pyvips 的高性能缩略图生成
 */

class PythonThumbnailAPI {
  private static instance: PythonThumbnailAPI;
  
  private constructor() {}
  
  static getInstance(): PythonThumbnailAPI {
    if (!PythonThumbnailAPI.instance) {
      PythonThumbnailAPI.instance = new PythonThumbnailAPI();
    }
    return PythonThumbnailAPI.instance;
  }
  
  /**
   * 启动 Python 缩略图服务
   */
  async startService(): Promise<string> {
    return await invoke('start_python_thumbnail_service');
  }
  
  /**
   * 停止 Python 缩略图服务
   */
  async stopService(): Promise<void> {
    return await invoke('stop_python_thumbnail_service');
  }
  
  /**
   * 获取缩略图二进制数据
   * @param filePath 文件路径
   * @param isFolder 是否为文件夹
   * @returns WebP 二进制数据 (Uint8Array)
   */
  async getThumbnailBlob(filePath: string, isFolder?: boolean): Promise<Uint8Array> {
    return await invoke('get_thumbnail_blob', { 
      file_path: filePath, 
      is_folder: isFolder 
    });
  }
  
  /**
   * 批量获取缩略图二进制数据
   * @param filePaths 文件路径数组
   * @returns 数组，每项为 [路径, WebP 二进制数据]
   */
  async getThumbnailBlobs(filePaths: string[]): Promise<Array<[string, Uint8Array]>> {
    return await invoke('get_thumbnail_blobs', { 
      file_paths: filePaths 
    });
  }
  
  /**
   * 预加载目录缩略图
   * @param dirPath 目录路径
   * @param entries 目录条目数组
   * @returns 处理的数量
   */
  async prefetchThumbnails(dirPath: string, entries: any[]): Promise<number> {
    return await invoke('prefetch_thumbnails', { 
      dir_path: dirPath, 
      entries: entries 
    });
  }
  
  /**
   * 生成文件缩略图（兼容接口，返回 base64）
   * @param filePath 文件路径
   * @returns base64 data URL
   */
  async generateFileThumbnail(filePath: string): Promise<string> {
    return await invoke('generate_file_thumbnail', { 
      file_path: filePath 
    });
  }
  
  /**
   * 生成文件夹缩略图（兼容接口，返回 base64）
   * @param folderPath 文件夹路径
   * @returns base64 data URL
   */
  async generateFolderThumbnail(folderPath: string): Promise<string> {
    return await invoke('generate_folder_thumbnail', { 
      folder_path: folderPath 
    });
  }
  
  /**
   * 生成压缩包缩略图（兼容接口，返回 base64）
   * @param archivePath 压缩包路径
   * @returns base64 data URL
   */
  async generateArchiveThumbnail(archivePath: string): Promise<string> {
    return await invoke('generate_archive_thumbnail', { 
      archive_path: archivePath 
    });
  }
  
  /**
   * 检查服务健康状态
   * @returns 服务状态信息
   */
  async getServiceHealth(): Promise<any> {
    return await invoke('python_service_health');
  }
  
  /**
   * 将 WebP 二进制数据转换为 Blob URL
   * @param bytes WebP 二进制数据
   * @returns Blob URL
   */
  blobUrlFromBytes(bytes: Uint8Array): string {
    const blob = new Blob([bytes], { type: 'image/webp' });
    return URL.createObjectURL(blob);
  }
  
  /**
   * 释放 Blob URL
   * @param url Blob URL
   */
  revokeBlobUrl(url: string): void {
    URL.revokeObjectURL(url);
  }
}

export const pythonThumbnailAPI = PythonThumbnailAPI.getInstance();