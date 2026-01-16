/**
 * NeoView - Performance API
 * 性能设置相关的 API 接口
 */

import { invoke } from '@tauri-apps/api/core';
import { confirm } from '$lib/stores/confirmDialog.svelte';

export interface PerformanceSettings {
  cache_memory_size: number;         // MB
  preload_enabled: boolean;          // whether to preload pages
  preload_size: number;              // number of pages
  gpu_acceleration: boolean;         // GPU rendering
  multi_threaded_rendering: boolean; // multi-threaded decoding
  decoding_threads: number;          // number of threads for decoding
  // 缩略图设置
  thumbnail_concurrent_local?: number;    // 本地文件并发数
  thumbnail_concurrent_archive?: number;  // 压缩包并发数
  thumbnail_concurrent_video?: number;    // 视频处理并发数
  enable_video_thumbnail?: boolean;       // 启用视频缩略图
  archive_tempfile_threshold_mb?: number; // 压缩包提取阈值 (后端)
  direct_url_threshold_mb?: number;       // 协议直连触发阈值
}

/**
 * 获取性能设置
 */
export async function getPerformanceSettings(): Promise<PerformanceSettings> {
  return await invoke('get_performance_settings');
}

/**
 * 保存性能设置
 * 注意：这需要重启应用才能生效
 */
export async function savePerformanceSettings(settings: PerformanceSettings): Promise<void> {
  await invoke('save_performance_settings', { settings });
  
  // 提示用户重启应用
  const confirmed = await confirm({
    title: '重启应用',
    description: '性能设置已保存，需要重启应用才能生效。是否立即重启？',
    confirmText: '重启',
    cancelText: '稍后',
    variant: 'warning'
  });
  if (confirmed) {
    await invoke('tauri', { __tauriModule: 'Process', message: { cmd: 'restart' } });
  }
}