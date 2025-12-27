/**
 * 视频操作模块
 * 包含视频缩略图生成、时长获取等功能
 */

import { invoke } from '@tauri-apps/api/core';

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
 * 检查是否为视频文件
 */
export async function isVideoFile(filePath: string): Promise<boolean> {
  return await invoke<boolean>('is_video_file', { filePath });
}

/**
 * 检查 FFmpeg 是否可用
 */
export async function checkFFmpegAvailable(): Promise<boolean> {
  return await invoke<boolean>('check_ffmpeg_available');
}
