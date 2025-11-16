/**
 * Blob 缩略图测试
 * 测试新的 blob URL 缩略图流程
 */

import { getArchiveFirstImageBlob, generateArchiveThumbnailAsync, setupThumbnailEventListener } from '../thumbnailManager';

export async function testBlobThumbnailFlow(archivePath: string) {
  console.log('🧪 开始测试 Blob 缩略图流程...');
  
  // 设置事件监听
  const cleanup = setupThumbnailEventListener();
  
  try {
    // 1. 获取首图 blob URL
    console.log('⚡ 步骤 1: 获取首图 blob URL');
    const blobUrl = await getArchiveFirstImageBlob(archivePath);
    console.log('✅ 获取到 blob URL:', blobUrl);
    
    // 2. 提交后台缩略图生成任务
    console.log('🔄 步骤 2: 提交后台缩略图生成任务');
    const result = await generateArchiveThumbnailAsync(archivePath);
    console.log('✅ 缩略图生成任务已提交:', result);
    
    // 3. 等待事件监听
    console.log('⏳ 步骤 3: 等待缩略图更新事件...');
    
    // 返回测试结果
    return {
      success: true,
      blobUrl,
      taskResult: result
    };
  } catch (error) {
    console.error('❌ 测试失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    // 清理事件监听
    cleanup();
  }
}