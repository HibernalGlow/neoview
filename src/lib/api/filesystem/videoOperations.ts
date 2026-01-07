/**
 * 视频操作模块
 * 包含视频缩略图生成、时长获取等功能
 */

import { invoke } from '@tauri-apps/api/core';
import { isVideoFilePath } from '$lib/utils/pathUtils';

/**
 * 生成视频缩略图
 */
export async function generateVideoThumbnail(
  videoPath: string, 
  timeSeconds?: number
): Promise<string> {
  return await invoke<string>('generate_video_thumbnail', { videoPath, timeSeconds });
}

/**
 * 获取视频时长
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  return await invoke<number>('get_video_duration', { videoPath });
}

/**
 * 检查是否为视频文件（本地版本，无需 IPC）
 * 
 * @description 推荐使用此函数替代 isVideoFile，无需后端调用
 */
export function isVideoFileLocal(filePath: string): boolean {
  return isVideoFilePath(filePath);
}

/**
 * 检查是否为视频文件
 * 
 * @deprecated 请使用 isVideoFileLocal() 代替，无需 IPC 调用
 */
export async function isVideoFile(filePath: string): Promise<boolean> {
  // 优化：使用本地检测，不再调用后端
  return isVideoFilePath(filePath);
}

/**
 * 检查 FFmpeg 是否可用
 */
export async function checkFFmpegAvailable(): Promise<boolean> {
  return await invoke<boolean>('check_ffmpeg_available');
}

