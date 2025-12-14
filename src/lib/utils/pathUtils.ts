/**
 * 路径处理工具模块
 * 用于 CLI 启动参数和右键菜单打开功能
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import { invoke } from '@tauri-apps/api/core';
import { FileSystemAPI } from '$lib/api';

/**
 * 路径类型枚举
 */
export type PathType = 'file' | 'directory' | 'archive' | 'invalid';

/**
 * 路径元数据接口
 */
export interface PathMetadata {
    path: string;
    normalizedPath: string;
    isDir: boolean;
    exists: boolean;
    pathType: PathType;
}

/**
 * 支持的压缩包扩展名
 */
const ARCHIVE_EXTENSIONS = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'cbz', 'cbr', 'cb7'];

/**
 * 规范化路径
 * - 处理相对路径转绝对路径
 * - 处理特殊字符
 * - 处理空格
 * Requirements: 4.1, 4.2, 4.3
 * 
 * @param path 输入路径
 * @returns 规范化后的绝对路径
 */
export async function normalizePath(path: string): Promise<string> {
    if (!path || path.trim() === '') {
        throw new Error('路径不能为空');
    }

    // 去除首尾空格
    let normalizedPath = path.trim();

    // 去除可能的引号包裹
    if ((normalizedPath.startsWith('"') && normalizedPath.endsWith('"')) ||
        (normalizedPath.startsWith("'") && normalizedPath.endsWith("'"))) {
        normalizedPath = normalizedPath.slice(1, -1);
    }

    // 检查是否为 UNC 路径 (\\server\share)
    const isUNCPath = normalizedPath.startsWith('\\\\');

    // 检查是否为绝对路径
    const isAbsolutePath = /^[A-Za-z]:[\\/]/.test(normalizedPath) || isUNCPath || normalizedPath.startsWith('/');

    if (!isAbsolutePath) {
        // 相对路径：需要转换为绝对路径
        // 使用 Tauri 后端获取当前工作目录并拼接
        try {
            const cwd = await invoke<string>('get_current_dir').catch(() => '');
            if (cwd) {
                const separator = cwd.includes('\\') ? '\\' : '/';
                normalizedPath = `${cwd}${separator}${normalizedPath}`;
            }
        } catch {
            // 如果无法获取 cwd，保持原样
            console.warn('无法获取当前工作目录，保持相对路径');
        }
    }

    // 统一路径分隔符（Windows 使用反斜杠）
    if (normalizedPath.includes('\\') && !isUNCPath) {
        // Windows 路径，保持反斜杠
        normalizedPath = normalizedPath.replace(/\//g, '\\');
    }

    // 移除末尾的分隔符（除非是根目录）
    if (normalizedPath.length > 3 && (normalizedPath.endsWith('\\') || normalizedPath.endsWith('/'))) {
        normalizedPath = normalizedPath.slice(0, -1);
    }

    return normalizedPath;
}

/**
 * 验证路径是否存在
 * Requirements: 1.4
 * 
 * @param path 路径
 * @returns 是否存在
 */
export async function validatePath(path: string): Promise<boolean> {
    try {
        return await FileSystemAPI.pathExists(path);
    } catch {
        return false;
    }
}

/**
 * 判断路径类型
 * Requirements: 1.1, 1.2, 1.3
 * 
 * @param path 路径
 * @returns 路径类型
 */
export async function getPathType(path: string): Promise<PathType> {
    try {
        const exists = await validatePath(path);
        if (!exists) {
            return 'invalid';
        }

        const metadata = await FileSystemAPI.getFileMetadata(path);
        
        if (metadata.isDir) {
            return 'directory';
        }

        // 检查是否为压缩包
        const ext = path.split('.').pop()?.toLowerCase() || '';
        if (ARCHIVE_EXTENSIONS.includes(ext)) {
            return 'archive';
        }

        return 'file';
    } catch {
        return 'invalid';
    }
}

/**
 * 获取完整的路径元数据
 * 
 * @param path 输入路径
 * @returns 路径元数据
 */
export async function getPathMetadata(path: string): Promise<PathMetadata> {
    const normalizedPath = await normalizePath(path);
    const exists = await validatePath(normalizedPath);
    const pathType = exists ? await getPathType(normalizedPath) : 'invalid';
    
    return {
        path,
        normalizedPath,
        isDir: pathType === 'directory',
        exists,
        pathType
    };
}

/**
 * 从路径中提取父目录
 * 
 * @param path 文件路径
 * @returns 父目录路径
 */
export function getParentDirectory(path: string): string {
    const lastBackslash = path.lastIndexOf('\\');
    const lastSlash = path.lastIndexOf('/');
    const lastSeparator = Math.max(lastBackslash, lastSlash);
    
    if (lastSeparator > 0) {
        return path.substring(0, lastSeparator);
    }
    
    return path;
}

/**
 * 从路径中提取文件名
 * 
 * @param path 文件路径
 * @returns 文件名
 */
export function getFileName(path: string): string {
    return path.split(/[\\/]/).pop() || path;
}
