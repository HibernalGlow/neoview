/**
 * 统一文件元数据类型定义
 * 用于 MetadataService 和相关组件
 */

/**
 * 图像/媒体元数据
 */
export interface ImageMetadata {
  // 基础文件信息
  path: string;
  /** 压缩包内部路径 */
  innerPath?: string;
  name: string;
  size?: number;
  createdAt?: string;
  modifiedAt?: string;

  // 图像特有信息
  width?: number;
  height?: number;
  format?: string;
  colorDepth?: string;

  // 视频特有信息（可选）
  isVideo?: boolean;
  duration?: number;
  videoCodec?: string;
  audioCodec?: string;
  frameRate?: number;
  bitrate?: number;

  // 扩展字段（用于保留未知字段）
  extra?: Record<string, unknown>;
}

/**
 * 元数据请求参数
 */
export interface MetadataRequest {
  /** 文件路径（普通文件）或压缩包路径 */
  path: string;
  /** 压缩包内部路径 */
  innerPath?: string;
  /** 页面索引（用于关联 bookStore） */
  pageIndex?: number;
}

/**
 * 元数据错误类型
 */
export type MetadataErrorCode =
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'DECODE_ERROR'
  | 'ARCHIVE_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

/**
 * 元数据错误
 */
export interface MetadataError {
  code: MetadataErrorCode;
  message: string;
  path: string;
  innerPath?: string;
}

/**
 * 生成缓存键
 * 普通文件: path
 * 压缩包内文件: archivePath::innerPath
 */
export function generateCacheKey(path: string, innerPath?: string): string {
  if (innerPath) {
    return `${path}::${innerPath}`;
  }
  return path;
}

/**
 * 解析缓存键
 */
export function parseCacheKey(key: string): { path: string; innerPath?: string } {
  const separatorIndex = key.indexOf('::');
  if (separatorIndex === -1) {
    return { path: key };
  }
  return {
    path: key.substring(0, separatorIndex),
    innerPath: key.substring(separatorIndex + 2)
  };
}

/**
 * 从文件路径提取文件名
 */
export function extractFileName(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash === -1 ? normalized : normalized.substring(lastSlash + 1);
}

/**
 * 从文件名提取格式
 */
export function extractFormat(name: string): string | undefined {
  const lastDot = name.lastIndexOf('.');
  if (lastDot === -1 || lastDot === name.length - 1) {
    return undefined;
  }
  return name.substring(lastDot + 1).toLowerCase();
}
