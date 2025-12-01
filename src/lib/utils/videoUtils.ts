/**
 * 视频检测和加载辅助函数
 */

import { settingsManager } from '$lib/settings/settingsManager';

const DEFAULT_VIDEO_EXTENSIONS = [
    '.mp4',
    '.nov',
    '.m4v',
    '.mov',
    '.webm',
    '.ogg',
    '.ogv',
    '.3gp',
    '.3g2',
    '.mkv',
    '.avi',
    '.flv',
    '.wmv'
];

function normalizeExtension(ext: string): string {
    if (!ext) return '';
    const lower = ext.toLowerCase();
    return lower.startsWith('.') ? lower : `.${lower}`;
}

export function getConfiguredVideoExtensions(): string[] {
    try {
        const settings = settingsManager.getSettings();
        const raw = settings?.image?.videoFormats ?? [];
        const list = Array.isArray(raw) ? raw : [];
        const normalized = list
            .map((ext) => normalizeExtension(ext))
            .filter((ext) => ext.length > 1);
        return normalized.length > 0 ? normalized : DEFAULT_VIDEO_EXTENSIONS;
    } catch {
        return DEFAULT_VIDEO_EXTENSIONS;
    }
}

/**
 * 检查文件名是否为视频文件
 */
export function isVideoFile(filename: string): boolean {
    if (!filename) return false;
    const lowerName = filename.toLowerCase();
    const exts = getConfiguredVideoExtensions();
    return exts.some((ext) => lowerName.endsWith(ext));
}

/**
 * 检查MIME类型是否为视频
 */
export function isVideoMimeType(mimeType: string): boolean {
    return !!mimeType && mimeType.startsWith('video/');
}

/**
 * 从Blob检测是否为视频
 */
export function isVideoBlob(blob: Blob): boolean {
    return isVideoMimeType(blob.type);
}

/**
 * 视频 MIME 类型映射
 */
export const VIDEO_MIME_TYPES: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogg: 'video/ogg',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    m4v: 'video/x-m4v',
    flv: 'video/x-flv',
    nov: 'video/mp4',
    wmv: 'video/x-ms-wmv',
    '3gp': 'video/3gpp',
    '3g2': 'video/3gpp2',
    ogv: 'video/ogg'
};

/**
 * 根据文件名获取视频 MIME 类型
 */
export function getVideoMimeType(filename?: string): string | undefined {
    if (!filename) return undefined;
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext) return undefined;
    return VIDEO_MIME_TYPES[ext];
}

/**
 * 格式化时间显示（秒 -> mm:ss 或 hh:mm:ss）
 */
export function formatVideoTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
