/**
 * 回收站操作模块
 * 包含异步删除、撤回删除等功能
 */

import { invoke } from '@tauri-apps/api/core';
import type { TrashItem } from './types';

// 异步删除的回调映射
const trashCallbacks = new Map<string, { resolve: () => void; reject: (err: Error) => void }>();
let trashListenerSetup = false;

// 应用内删除事务栈（用于精确撤回，避免恢复到其他来源的“最近删除项”）
const trashDeleteUndoStack: string[][] = [];
const MAX_UNDO_STACK_SIZE = 50;

function normalizePath(path: string): string {
  return path.replace(/[/\\]+/g, '\\').replace(/\\+$/, '').toLowerCase();
}

function isChildPath(path: string, parent: string): boolean {
  const pathNorm = normalizePath(path);
  const parentNorm = normalizePath(parent);
  return pathNorm === parentNorm || pathNorm.startsWith(`${parentNorm}\\`);
}

function compactRestorePaths(paths: string[]): string[] {
  const uniquePaths = Array.from(new Set(paths));
  uniquePaths.sort((a, b) => a.length - b.length);

  const compacted: string[] = [];
  for (const path of uniquePaths) {
    const coveredByParent = compacted.some((parent) => isChildPath(path, parent));
    if (!coveredByParent) {
      compacted.push(path);
    }
  }

  return compacted;
}

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
 * 记录一次已成功的“移动到回收站”事务
 */
export function recordTrashDeletion(paths: string[]): void {
  const compacted = compactRestorePaths(paths).filter(Boolean);
  if (compacted.length === 0) return;

  trashDeleteUndoStack.push(compacted);
  if (trashDeleteUndoStack.length > MAX_UNDO_STACK_SIZE) {
    trashDeleteUndoStack.shift();
  }
}

/**
 * 精确撤回应用内最近一次删除事务
 * 返回恢复的路径数组；若没有可撤回事务，返回 null
 */
export async function undoRecordedTrashDelete(): Promise<string[] | null> {
  const lastBatch = trashDeleteUndoStack.pop();
  if (!lastBatch || lastBatch.length === 0) return null;

  try {
    for (const path of lastBatch) {
      await restoreFromTrash(path);
    }
    return lastBatch;
  } catch (error) {
    trashDeleteUndoStack.push(lastBatch);
    throw error;
  }
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
