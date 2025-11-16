/**
 * 缩略图事件监听器
 * 监听后端发送的 thumbnail-ready 事件
 */

import { listen } from '@tauri-apps/api/event';

export interface ThumbnailReadyEvent {
  path: string;
  url: string;
}

let thumbnailEventListener: Awaited<UnlistenFn> | null = null;

/**
 * 开始监听缩略图就绪事件
 * @param callback 事件回调函数
 */
export async function startThumbnailEventListener(callback: (event: ThumbnailReadyEvent) => void) {
  if (thumbnailEventListener) {
    console.warn('缩略图事件监听器已经启动，请先停止当前监听器');
    return;
  }

  try {
    thumbnailEventListener = await listen<ThumbnailReadyEvent>('thumbnail-ready', (event) => {
      console.log('📸 [Frontend] 收到缩略图就绪事件:', event.payload);
      callback(event.payload);
    });
    console.log('✅ [Frontend] 缩略图事件监听器已启动');
  } catch (error) {
    console.error('❌ [Frontend] 启动缩略图事件监听器失败:', error);
  }
}

/**
 * 停止监听缩略图就绪事件
 */
export async function stopThumbnailEventListener() {
  if (thumbnailEventListener) {
    try {
      (await thumbnailEventListener)();
      thumbnailEventListener = null;
      console.log('⏹️ [Frontend] 缩略图事件监听器已停止');
    } catch (error) {
      console.error('❌ [Frontend] 停止缩略图事件监听器失败:', error);
    }
  } else {
    console.warn('⚠️ [Frontend] 缩略图事件监听器未启动');
  }
}

/**
 * 检查事件监听器是否已启动
 */
export function isThumbnailEventListenerActive(): boolean {
  return thumbnailEventListener !== null;
}