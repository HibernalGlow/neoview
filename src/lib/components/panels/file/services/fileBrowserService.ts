// fileBrowserService.ts - 文件浏览器服务层
import { FileSystemAPI } from '$lib/api';
import * as BookAPI from '$lib/api/book';
import type { FsItem } from '$lib/types';

export const fileBrowserService = {
  /**
   * 浏览目录
   */
  async browse(path: string): Promise<FsItem[]> {
    try {
      const items = await FileSystemAPI.browseDirectory(path);
      console.log(`📁 [FileBrowserService] 浏览目录: ${path}, ${items.length} 项`);
      return items;
    } catch (error) {
      console.error(`❌ [FileBrowserService] 浏览目录失败: ${path}`, error);
      throw new Error(`无法浏览目录: ${error.message}`);
    }
  },

  /**
   * 选择文件夹
   */
  async pickFolder(): Promise<string | null> {
    try {
      const path = await FileSystemAPI.selectFolder();
      console.log(`📁 [FileBrowserService] 选择文件夹: ${path}`);
      return path;
    } catch (error) {
      console.error('❌ [FileBrowserService] 选择文件夹失败', error);
      throw new Error(`无法选择文件夹: ${error.message}`);
    }
  },

  /**
   * 搜索文件
   */
  async search(
    path: string, 
    query: string, 
    options: {
      includeSubfolders?: boolean;
      maxResults?: number;
    } = {}
  ): Promise<FsItem[]> {
    try {
      const results = await FileSystemAPI.searchFiles(path, query, options);
      console.log(`🔍 [FileBrowserService] 搜索: ${path} "${query}", ${results.length} 结果`);
      return results;
    } catch (error) {
      console.error(`❌ [FileBrowserService] 搜索失败: ${path} "${query}"`, error);
      throw new Error(`搜索失败: ${error.message}`);
    }
  },

  /**
   * 检查是否为支持的压缩包
   */
  async isSupportedArchive(path: string): Promise<boolean> {
    try {
      return await FileSystemAPI.isSupportedArchive(path);
    } catch (error) {
      console.error(`❌ [FileBrowserService] 检查压缩包失败: ${path}`, error);
      return false;
    }
  },

  /**
   * 打开文件
   */
  openFile(item: FsItem) {
    try {
      console.log(`📂 [FileBrowserService] 打开文件: ${item.path}`);
      
      if (item.is_image) {
        // 图片使用书籍阅读器打开
        BookAPI.openFile(item.path);
      } else {
        // 其他文件使用系统默认程序打开
        FileSystemAPI.openWithSystem(item.path);
      }
    } catch (error) {
      console.error(`❌ [FileBrowserService] 打开文件失败: ${item.path}`, error);
      throw new Error(`无法打开文件: ${error.message}`);
    }
  },

  /**
   * 使用系统程序打开
   */
  openWithSystem(path: string) {
    try {
      console.log(`🌐 [FileBrowserService] 系统打开: ${path}`);
      FileSystemAPI.openWithSystem(path);
    } catch (error) {
      console.error(`❌ [FileBrowserService] 系统打开失败: ${path}`, error);
      throw new Error(`无法打开文件: ${error.message}`);
    }
  },

  /**
   * 在文件管理器中显示
   */
  showInFileManager(path: string) {
    try {
      console.log(`📂 [FileBrowserService] 在文件管理器中显示: ${path}`);
      FileSystemAPI.showInFileManager(path);
    } catch (error) {
      console.error(`❌ [FileBrowserService] 在文件管理器中显示失败: ${path}`, error);
      throw new Error(`无法在文件管理器中显示: ${error.message}`);
    }
  },

  /**
   * 获取文件元数据
   */
  async getFileMetadata(path: string): Promise<FsItem> {
    try {
      const metadata = await FileSystemAPI.getFileMetadata(path);
      console.log(`📄 [FileBrowserService] 获取元数据: ${path}`);
      return metadata;
    } catch (error) {
      console.error(`❌ [FileBrowserService] 获取元数据失败: ${path}`, error);
      throw new Error(`无法获取文件信息: ${error.message}`);
    }
  },

  /**
   * 创建目录
   */
  async createDirectory(path: string): Promise<void> {
    try {
      console.log(`📁 [FileBrowserService] 创建目录: ${path}`);
      await FileSystemAPI.createDirectory(path);
    } catch (error) {
      console.error(`❌ [FileBrowserService] 创建目录失败: ${path}`, error);
      throw new Error(`无法创建目录: ${error.message}`);
    }
  },

  /**
   * 删除文件或目录
   */
  async deletePath(path: string): Promise<void> {
    try {
      console.log(`🗑️ [FileBrowserService] 删除: ${path}`);
      await FileSystemAPI.deletePath(path);
    } catch (error) {
      console.error(`❌ [FileBrowserService] 删除失败: ${path}`, error);
      throw new Error(`无法删除: ${error.message}`);
    }
  },

  /**
   * 重命名文件或目录
   */
  async renamePath(from: string, to: string): Promise<void> {
    try {
      console.log(`✏️ [FileBrowserService] 重命名: ${from} -> ${to}`);
      await FileSystemAPI.renamePath(from, to);
    } catch (error) {
      console.error(`❌ [FileBrowserService] 重命名失败: ${from} -> ${to}`, error);
      throw new Error(`无法重命名: ${error.message}`);
    }
  },

  /**
   * 移动到回收站
   */
  async moveToTrash(path: string): Promise<void> {
    try {
      console.log(`🗑️ [FileBrowserService] 移到回收站: ${path}`);
      await FileSystemAPI.moveToTrash(path);
    } catch (error) {
      console.error(`❌ [FileBrowserService] 移到回收站失败: ${path}`, error);
      throw new Error(`无法移到回收站: ${error.message}`);
    }
  },

  /**
   * 复制文件或目录
   */
  async copyPath(from: string, to: string): Promise<void> {
    try {
      console.log(`📋 [FileBrowserService] 复制: ${from} -> ${to}`);
      await FileSystemAPI.copyPath(from, to);
    } catch (error) {
      console.error(`❌ [FileBrowserService] 复制失败: ${from} -> ${to}`, error);
      throw new Error(`无法复制: ${error.message}`);
    }
  },

  /**
   * 移动文件或目录
   */
  async movePath(from: string, to: string): Promise<void> {
    try {
      console.log(`📦 [FileBrowserService] 移动: ${from} -> ${to}`);
      await FileSystemAPI.movePath(from, to);
    } catch (error) {
      console.error(`❌ [FileBrowserService] 移动失败: ${from} -> ${to}`, error);
      throw new Error(`无法移动: ${error.message}`);
    }
  },

  /**
   * 检查路径是否存在
   */
  async pathExists(path: string): Promise<boolean> {
    try {
      return await FileSystemAPI.pathExists(path);
    } catch (error) {
      console.error(`❌ [FileBrowserService] 检查路径失败: ${path}`, error);
      return false;
    }
  }
};