/**
 * 视频检测和加载辅助函数
 */

// 支持的视频格式
const VIDEO_EXTENSIONS = [
    '.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v', '.flv', '.wmv'
];

/**
 * 检查文件名是否为视频文件
 */
export function isVideoFile(filename: string): boolean {
    if (!filename) return false;
    const lowerName = filename.toLowerCase();
    return VIDEO_EXTENSIONS.some(ext => lowerName.endsWith(ext));
}

/**
 * 检查MIME类型是否为视频
 */
export function isVideoMimeType(mimeType: string): boolean {
    return mimeType && mimeType.startsWith('video/');
}

/**
 * 从Blob检测是否为视频
 */
export function isVideoBlob(blob: Blob): boolean {
    return isVideoMimeType(blob.type);
}
