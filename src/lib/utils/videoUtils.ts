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
