// 简单的缩略图测试脚本
import { invoke } from '@tauri-apps/api/core';

async function testThumbnailFix() {
  console.log('开始测试缩略图修复...');
  
  try {
    // 初始化缩略图管理器
    const testRootPath = 'D:\\1VSCODE\\Projects\\ImageAll\\NeeWaifu\\neoview\\neoview-tauri';
    const thumbnailPath = 'D:\\temp\\neoview_thumbnails_test';
    
    console.log('初始化缩略图管理器...');
    await invoke('init_thumbnail_manager', {
      thumbnailPath: thumbnailPath,
      rootPath: testRootPath,
      size: 256
    });
    
    // 测试图片路径
    const testImagePath = 'D:\\1VSCODE\\Projects\\ImageAll\\NeeWaifu\\neoview\\neoview-tauri\\temp\\test_images\\test_image.png';
    
    // 生成缩略图
    console.log('生成缩略图...');
    const thumbnailUrl = await invoke('generate_file_thumbnail_new', {
      filePath: testImagePath
    });
    console.log('缩略图生成成功:', thumbnailUrl);
    
    // 获取缩略图信息
    console.log('获取缩略图信息...');
    const thumbnailInfo = await invoke('get_thumbnail_info', {
      filePath: testImagePath
    });
    console.log('缩略图信息:', thumbnailInfo);
    
    if (thumbnailInfo) {
      console.log('✅ 测试成功！缩略图信息获取正常');
    } else {
      console.log('❌ 测试失败！无法获取缩略图信息');
    }
    
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testThumbnailFix();