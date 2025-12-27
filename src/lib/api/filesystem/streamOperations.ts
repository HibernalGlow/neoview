/**
 * 流式操作模块
 * 包含流式目录加载、流式搜索等功能（参考 Spacedrive 架构）
 */

import { invoke, Channel } from '@tauri-apps/api/core';
import type { FsItem } from '$lib/types';
import { isPathExcluded } from '$lib/stores/excludedPaths.svelte';
import type {
  DirectoryBatch,
  StreamProgress,
  StreamError,
  StreamComplete,
  DirectoryStreamOutput,
  StreamOptions,
  StreamHandle,
  StreamCallbacks,
  SearchStreamOutput
} from './types';

// ===== 流式目录加载 =====

/**
 * 流式浏览目录（Spacedrive 风格）
 * 
 * 使用 Tauri Channel 实现真正的流式数据推送
 * 边扫描边返回，首批数据 100ms 内显示
 * 
 * @param path 目录路径
 * @param callbacks 回调函数
 * @param options 流配置选项
 * @returns StreamHandle 用于取消流
 */
export async function streamDirectory(
  path: string,
  callbacks: StreamCallbacks,
  options?: StreamOptions
): Promise<StreamHandle> {
  const channel = new Channel<DirectoryStreamOutput>();

  channel.onmessage = (output: DirectoryStreamOutput) => {
    switch (output.type) {
      case 'Batch':
        output.data.items = output.data.items.filter(item => !isPathExcluded(item.path));
        callbacks.onBatch?.(output.data);
        break;
      case 'Progress':
        callbacks.onProgress?.(output.data);
        break;
      case 'Error':
        callbacks.onError?.(output.data);
        break;
      case 'Complete':
        callbacks.onComplete?.(output.data);
        break;
    }
  };

  const streamId = await invoke<string>('stream_directory_v2', {
    path,
    options,
    channel
  });

  return {
    streamId,
    cancel: async () => {
      await invoke('cancel_directory_stream_v2', { streamId });
    }
  };
}

/**
 * 流式加载目录的便捷函数
 */
export function streamDirectoryAsync(
  path: string,
  onBatch: (items: FsItem[], batchIndex: number) => void,
  options?: StreamOptions
): Promise<StreamComplete> {
  return new Promise((resolve, reject) => {
    streamDirectory(
      path,
      {
        onBatch: (batch) => {
          onBatch(batch.items, batch.batchIndex);
        },
        onComplete: (complete) => {
          resolve(complete);
        },
        onError: (error) => {
          console.warn('Stream error:', error.message);
        }
      },
      options
    ).catch(reject);
  });
}

// ===== 旧版流式 API（兼容用）=====

/**
 * 流式浏览目录内容（返回游标）
 */
export async function startDirectoryStream(
  path: string,
  options: {
    batchSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{
  streamId: string;
  initialBatch: FsItem[];
  total: number;
  hasMore: boolean;
}> {
  return await invoke<{
    streamId: string;
    initialBatch: FsItem[];
    total: number;
    hasMore: boolean;
  }>('start_directory_stream', { path, options });
}

/**
 * 获取流的下一批数据
 */
export async function getNextStreamBatch(
  streamId: string
): Promise<{
  items: FsItem[];
  hasMore: boolean;
}> {
  return await invoke<{
    items: FsItem[];
    hasMore: boolean;
  }>('get_next_stream_batch', { streamId });
}

/**
 * 取消目录流
 */
export async function cancelDirectoryStream(streamId: string): Promise<void> {
  return await invoke<void>('cancel_directory_stream', { streamId });
}

// ===== 流管理 =====

/**
 * 取消指定路径的所有流
 */
export async function cancelStreamsForPath(path: string): Promise<number> {
  return await invoke<number>('cancel_streams_for_path', { path });
}

/**
 * 获取活动流数量
 */
export async function getActiveStreamCount(): Promise<number> {
  return await invoke<number>('get_active_stream_count');
}

// ===== 流式搜索 =====

/**
 * 流式搜索目录
 * 
 * 边搜索边返回结果，首批结果 200ms 内显示
 */
export async function streamSearch(
  path: string,
  query: string,
  callbacks: StreamCallbacks,
  options?: StreamOptions
): Promise<StreamHandle> {
  const channel = new Channel<SearchStreamOutput>();

  channel.onmessage = (output: SearchStreamOutput) => {
    switch (output.type) {
      case 'Batch':
        output.data.items = output.data.items.filter(item => !isPathExcluded(item.path));
        callbacks.onBatch?.(output.data);
        break;
      case 'Progress':
        callbacks.onProgress?.(output.data);
        break;
      case 'Error':
        callbacks.onError?.(output.data);
        break;
      case 'Complete':
        callbacks.onComplete?.(output.data);
        break;
    }
  };

  const streamId = await invoke<string>('stream_search_v2', {
    path,
    query,
    options,
    channel
  });

  return {
    streamId,
    cancel: async () => {
      await invoke('cancel_directory_stream_v2', { streamId });
    }
  };
}

/**
 * 流式搜索的便捷函数
 */
export function streamSearchAsync(
  path: string,
  query: string,
  onResult: (items: FsItem[], batchIndex: number) => void,
  options?: StreamOptions
): Promise<StreamComplete> {
  return new Promise((resolve, reject) => {
    streamSearch(
      path,
      query,
      {
        onBatch: (batch) => {
          onResult(batch.items, batch.batchIndex);
        },
        onComplete: (complete) => {
          resolve(complete);
        },
        onError: (error) => {
          console.warn('Search error:', error.message);
        }
      },
      options
    ).catch(reject);
  });
}
