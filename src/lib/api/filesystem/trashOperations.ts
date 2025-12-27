/**
 * 回收站操作模块
 * 包含异步删除、撤回删除等功能
 */

import { invoke } from '@tauri-apps/api/core';
import type { TrashItem } from './types';

// 异步删除的回调映射
const trashCallbacks = new Map<string, { resolve: () => void; reject: (err: Error) => void }>();
let trashListenerSetup = false;

/**
 * 设置异步删除的事件监听器
 */
async function setupTrashListener(): Promise<void> {
  if (trashListenerSetup) return;
  trashListenerSetup = true;
  
  const { listen } = await import('@tauri-apps/api/event');
  listen<{ requestId: string; path: string; success: boolean; error?: string }>(
    'trash-result',
    (event) => {
      const { requestId, success, error } = event.payload;
      const callback = trashCallbacks.get(requestId);
      if (callback) {
        trashCallbacks.delete(requestId);
        if (success) {
          callback.resolve();
        } else {
          callback.reject(new Error(error || '删除失败'));
        }
      }
    }
  );
}

/**
 * 异步移动到回收站（绕开 IPC 协议问题）
 * 使用事件机制接收结果，避免 IPC 返回值问题
 */
export async function moveToTrashAsync(path: string): Promise<void> {
  await setupTrashListener();
  
  const requestId = `trash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  return new Promise((resolve, reject) => {
    // 设置超时
    const timeout = setTimeout(() => {
      trashCallbacks.delete(requestId);
      reject(new Error('删除操作超时'));
    }, 30000);
    
    trashCallbacks.set(requestId, {
      resolve: () => {
        clearTimeout(timeout);
        resolve();
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    });
    
    // 发送异步删除请求
    invoke('move_to_trash_async', { path, requestId }).catch(err => {
      clearTimeout(timeout);
      trashCallbacks.delete(requestId);
      reject(err);
    });
  });
}

/**
 * 获取最近删除的项目（用于撤回功能）
 * 返回最近删除的一个项目，如果回收站为空则返回 null
 */
export async function getLastDeletedItem(): Promise<TrashItem | null> {
  return await invoke<TrashItem | null>('get_last_deleted_item');
}

/**
 * 撤回上一次删除（恢复最近删除的项目）
 * 返回恢复的文件原始路径，如果回收站为空则返回 null
 */
export async function undoLastDelete(): Promise<string | null> {
  return await invoke<string | null>('undo_last_delete');
}

/**
 * 恢复指定路径的已删除项目
 */
export async function restoreFromTrash(originalPath: string): Promise<void> {
  await invoke('restore_from_trash', { originalPath });
}
