/**
 * NeoView 缩略图系统测试脚本
 * 用于本地测试缩略图系统的各项功能
 */

import { invoke } from '@tauri-apps/api/core';

interface TestResult {
  name: string;
  success: boolean;
  message: string;
  duration?: number;
}

class ThumbnailSystemTester {
  private results: TestResult[] = [];
  private thumbnailPath: string = '';
  private testRootPath: string = '';

  async runAllTests(): Promise<void> {
    console.log('🚀 开始缩略图系统测试...\n');

    try {
      // 设置测试路径
      await this.setupTestPaths();

      // 运行所有测试
      await this.testInitThumbnailManager();
      await this.testGenerateFileThumbnail();
      await this.testGenerateFolderThumbnail();
      await this.testGetThumbnailInfo();
      await this.testThumbnailCaching();
      await this.testCleanupThumbnails();

      // 显示测试结果
      this.displayResults();

    } catch (error) {
      console.error('❌ 测试过程中发生错误:', error);
    }
  }

  private async setupTestPaths(): Promise<void> {
    try {
      // 设置测试路径 - 使用项目目录作为根目录，确保相对路径计算正确
      this.testRootPath = 'D:\\1VSCODE\\Projects\\ImageAll\\NeeWaifu\\neoview\\neoview-tauri';
      this.thumbnailPath = 'D:\\temp\\neoview_thumbnails_test';  // 使用绝对路径

      console.log(`📁 测试缩略图路径: ${this.thumbnailPath}`);
      console.log(`📂 测试根目录: ${this.testRootPath}\n`);
    } catch (error) {
      console.error('❌ 设置测试路径失败:', error);
      throw error;
    }
  }

  private async testInitThumbnailManager(): Promise<void> {
    const startTime = Date.now();

    try {
      console.log('🔧 测试: 初始化缩略图管理器');

      await invoke('init_thumbnail_manager', {
        thumbnailPath: this.thumbnailPath,
        rootPath: this.testRootPath,
        size: 256
      });

      const duration = Date.now() - startTime;
      this.results.push({
        name: '初始化缩略图管理器',
        success: true,
        message: '缩略图管理器初始化成功',
        duration
      });

      console.log('✅ 初始化缩略图管理器成功\n');
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name: '初始化缩略图管理器',
        success: false,
        message: `初始化失败: ${error}`,
        duration
      });

      console.log('❌ 初始化缩略图管理器失败:', error, '\n');
    }
  }

  private async testGenerateFileThumbnail(): Promise<void> {
    const startTime = Date.now();

    try {
      console.log('🖼️ 测试: 生成文件缩略图');

      // 查找一个图片文件进行测试
      const testImagePath = await this.findTestImage();

      if (!testImagePath) {
        throw new Error('未找到测试图片文件');
      }

      console.log(`   测试文件: ${testImagePath}`);

      const thumbnailUrl = await invoke<string>('generate_file_thumbnail_new', {
        filePath: testImagePath
      });

      // 验证缩略图URL
      if (!thumbnailUrl.startsWith('file://')) {
        throw new Error('缩略图URL格式不正确');
      }

      // 检查文件是否存在
      const fileExists = await this.checkFileExists(thumbnailUrl);
      if (!fileExists) {
        throw new Error('缩略图文件不存在');
      }

      const duration = Date.now() - startTime;
      this.results.push({
        name: '生成文件缩略图',
        success: true,
        message: `成功生成缩略图: ${thumbnailUrl}`,
        duration
      });

      console.log('✅ 生成文件缩略图成功\n');
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name: '生成文件缩略图',
        success: false,
        message: `生成失败: ${error}`,
        duration
      });

      console.log('❌ 生成文件缩略图失败:', error, '\n');
    }
  }

  private async testGenerateFolderThumbnail(): Promise<void> {
    const startTime = Date.now();

    try {
      console.log('📁 测试: 生成文件夹缩略图');

      // 查找一个包含图片的文件夹
      const testFolderPath = await this.findTestFolder();

      if (!testFolderPath) {
        throw new Error('未找到包含图片的测试文件夹');
      }

      console.log(`   测试文件夹: ${testFolderPath}`);

      const thumbnailUrl = await invoke<string>('generate_folder_thumbnail', {
        folderPath: testFolderPath
      });

      // 验证缩略图URL
      if (!thumbnailUrl.startsWith('file://')) {
        throw new Error('文件夹缩略图URL格式不正确');
      }

      // 检查文件是否存在
      const fileExists = await this.checkFileExists(thumbnailUrl);
      if (!fileExists) {
        throw new Error('文件夹缩略图文件不存在');
      }

      const duration = Date.now() - startTime;
      this.results.push({
        name: '生成文件夹缩略图',
        success: true,
        message: `成功生成文件夹缩略图: ${thumbnailUrl}`,
        duration
      });

      console.log('✅ 生成文件夹缩略图成功\n');
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name: '生成文件夹缩略图',
        success: false,
        message: `生成失败: ${error}`,
        duration
      });

      console.log('❌ 生成文件夹缩略图失败:', error, '\n');
    }
  }

  private async testGetThumbnailInfo(): Promise<void> {
    const startTime = Date.now();

    try {
      console.log('ℹ️ 测试: 获取缩略图信息');

      // 使用之前生成的缩略图进行测试
      const testImagePath = await this.findTestImage();

      if (!testImagePath) {
        throw new Error('未找到测试图片文件');
      }

      console.log('   测试图片路径:', testImagePath);

      const thumbnailInfo = await invoke<any>('get_thumbnail_info', {
        filePath: testImagePath
      });

      console.log('   缩略图信息结果:', thumbnailInfo);

      if (!thumbnailInfo) {
        // 尝试重新生成缩略图然后获取信息
        console.log('   重新生成缩略图...');
        await invoke<string>('generate_file_thumbnail_new', {
          filePath: testImagePath
        });

        // 等待一下让缩略图生成完成
        await new Promise(resolve => setTimeout(resolve, 500));

        const thumbnailInfoRetry = await invoke<any>('get_thumbnail_info', {
          filePath: testImagePath
        });

        console.log('   重试后缩略图信息结果:', thumbnailInfoRetry);

        if (!thumbnailInfoRetry) {
          throw new Error('未获取到缩略图信息');
        }

        // 使用重试的结果
        const info = thumbnailInfoRetry;
        if (!info.url || !info.width || !info.height) {
          throw new Error('缩略图信息结构不完整');
        }

        const duration = Date.now() - startTime;
        this.results.push({
          name: '获取缩略图信息',
          success: true,
          message: `成功获取缩略图信息: ${info.width}x${info.height}`,
          duration
        });

        console.log('✅ 获取缩略图信息成功\n');
        return;
      }

      // 验证信息结构
      if (!thumbnailInfo.url || !thumbnailInfo.width || !thumbnailInfo.height) {
        throw new Error('缩略图信息结构不完整');
      }

      const duration = Date.now() - startTime;
      this.results.push({
        name: '获取缩略图信息',
        success: true,
        message: `成功获取缩略图信息: ${thumbnailInfo.width}x${thumbnailInfo.height}`,
        duration
      });

      console.log('✅ 获取缩略图信息成功\n');
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name: '获取缩略图信息',
        success: false,
        message: `获取失败: ${error}`,
        duration
      });

      console.log('❌ 获取缩略图信息失败:', error, '\n');
    }
  }

  private async testThumbnailCaching(): Promise<void> {
    const startTime = Date.now();

    try {
      console.log('💾 测试: 缩略图缓存');

      const testImagePath = await this.findTestImage();

      if (!testImagePath) {
        throw new Error('未找到测试图片文件');
      }

      // 第一次获取
      const firstCall = Date.now();
      const thumbnailUrl1 = await invoke<string>('generate_file_thumbnail_new', {
        filePath: testImagePath
      });
      const firstDuration = Date.now() - firstCall;

      // 第二次获取（应该从缓存中获取）
      const secondCall = Date.now();
      const thumbnailUrl2 = await invoke<string>('generate_file_thumbnail_new', {
        filePath: testImagePath
      });
      const secondDuration = Date.now() - secondCall;

      // 验证URL一致
      if (thumbnailUrl1 !== thumbnailUrl2) {
        throw new Error('缓存的缩略图URL不一致');
      }

      // 缓存应该更快（理想情况下）
      const duration = Date.now() - startTime;
      this.results.push({
        name: '缩略图缓存',
        success: true,
        message: `缓存工作正常 (首次: ${firstDuration}ms, 二次: ${secondDuration}ms)`,
        duration
      });

      console.log('✅ 缩略图缓存测试成功\n');
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name: '缩略图缓存',
        success: false,
        message: `缓存测试失败: ${error}`,
        duration
      });

      console.log('❌ 缩略图缓存测试失败:', error, '\n');
    }
  }

  private async testCleanupThumbnails(): Promise<void> {
    const startTime = Date.now();

    try {
      console.log('🧹 测试: 清理缩略图');

      const removedCount = await invoke<number>('cleanup_thumbnails', {
        days: 0  // 清理所有缩略图
      });

      const duration = Date.now() - startTime;
      this.results.push({
        name: '清理缩略图',
        success: true,
        message: `成功清理 ${removedCount} 个缩略图`,
        duration
      });

      console.log('✅ 清理缩略图测试成功\n');
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name: '清理缩略图',
        success: false,
        message: `清理失败: ${error}`,
        duration
      });

      console.log('❌ 清理缩略图测试失败:', error, '\n');
    }
  }

  private async findTestImage(): Promise<string | null> {
    try {
      // 使用绝对路径指向测试图片
      const testImagePath = 'D:\\1VSCODE\\Projects\\ImageAll\\NeeWaifu\\neoview\\neoview-tauri\\temp\\test_images\\test_image.png';

      // 检查文件是否存在
      const exists = await this.checkFileExists(`file://${testImagePath}`);
      if (exists) {
        console.log(`   找到测试图片: ${testImagePath}`);
        return testImagePath;
      }

      // 如果不存在，尝试查找其他图片
      const images = await invoke<string[]>('get_images_in_directory', {
        path: 'D:\\1VSCODE\\Projects\\ImageAll\\NeeWaifu\\neoview\\neoview-tauri\\temp',
        recursive: true
      });

      // 返回第一个找到的图片
      return images.length > 0 ? images[0] : null;
    } catch (error) {
      console.warn('查找测试图片失败:', error);
      return null;
    }
  }

  private async findTestFolder(): Promise<string | null> {
    try {
      // 使用绝对路径指向测试文件夹
      const testFolderPath = 'D:\\1VSCODE\\Projects\\ImageAll\\NeeWaifu\\neoview\\neoview-tauri\\temp\\test_folder';

      // 检查文件夹中是否有图片
      const images = await invoke<string[]>('get_images_in_directory', {
        path: testFolderPath,
        recursive: false
      });

      if (images.length > 0) {
        console.log(`   找到测试文件夹: ${testFolderPath}`);
        return testFolderPath;
      }

      return null;
    } catch (error) {
      console.warn('查找测试文件夹失败:', error);
      return null;
    }
  }

  private async checkFileExists(fileUrl: string): Promise<boolean> {
    try {
      // 从 file:// URL 提取文件路径
      const filePath = fileUrl.replace('file://', '');
      return await invoke<boolean>('path_exists', { path: filePath });
    } catch (error) {
      console.warn('检查文件存在性失败:', error);
      return false;
    }
  }

  public getResults(): any[] {
    return this.results;
  }

  private displayResults(): void {
    console.log('📊 测试结果汇总:');
    console.log('='.repeat(50));

    const passed = this.results.filter(r => r.success).length;
    const total = this.results.length;

    this.results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const duration = result.duration ? ` (${result.duration}ms)` : '';
      console.log(`${status} ${result.name}${duration}`);
      if (!result.success) {
        console.log(`   ${result.message}`);
      }
    });

    console.log('='.repeat(50));
    console.log(`📈 通过: ${passed}/${total} (${Math.round(passed/total*100)}%)`);

    if (passed === total) {
      console.log('🎉 所有测试通过！缩略图系统运行正常。');
    } else {
      console.log('⚠️ 部分测试失败，请检查系统配置。');
    }
  }
}

// 导出测试函数
export async function runThumbnailTests(): Promise<any[]> {
  const tester = new ThumbnailSystemTester();
  await tester.runAllTests();
  return tester.getResults();
}

// 如果直接运行此脚本
if (typeof window !== 'undefined') {
  // 在浏览器环境中，添加到全局对象
  (window as any).runThumbnailTests = runThumbnailTests;
  console.log('🔧 缩略图测试函数已加载。运行 runThumbnailTests() 开始测试。');
}