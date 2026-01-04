/**
 * NeoView - Unified Content Types
 * 统一内容模型类型定义
 */

// ReadOrder 复用 book.ts 中的定义，迁移完成后统一
import type { ReadOrder } from './book';
export type { ReadOrder };

// ==================== 基础类型 ====================

/**
 * 内容类型枚举
 */
export type ContentType =
  | 'image'     // 静态图片
  | 'video'     // 视频
  | 'animated'  // 动图 (GIF/APNG/WebP动画)
  | 'archive'   // 压缩包（容器）
  | 'folder'    // 文件夹（容器）
  | 'playlist'  // 播放列表（容器）
  | 'ebook'     // 电子书 (PDF/EPUB)
  | 'unknown';  // 未知类型

/**
 * 排序模式
 */
export type SortMode =
  | 'name'
  | 'nameDesc'
  | 'size'
  | 'sizeDesc'
  | 'time'
  | 'timeDesc'
  | 'random'
  | 'entry'
  | 'entryDesc';

// ==================== 内容项 ====================

/**
 * 内容引用（用于路径栈）
 */
export interface ContentRef {
  /** 文件系统路径 */
  path: string;
  /** 内部路径（压缩包内） */
  innerPath?: string;
}

/**
 * 内容元数据
 */
export interface ContentMetadata {
  // 通用
  size?: number;
  modified?: number;

  // 图片/视频
  width?: number;
  height?: number;

  // 视频专用
  duration?: number;

  // 容器专用
  itemCount?: number;
}

/**
 * 统一内容项
 */
export interface ContentItem {
  /** 唯一标识（基于路径生成的哈希） */
  id: string;

  /** 内容类型 */
  type: ContentType;

  /** 文件系统路径 */
  path: string;

  /** 内部路径（压缩包内的文件） */
  innerPath?: string;

  /** 显示名称 */
  name: string;

  /** 父容器引用 */
  parentRef?: ContentRef;

  /** 元数据 */
  metadata?: ContentMetadata;

  /** 缩略图 URL */
  thumbnail?: string;

  /** 稳定哈希（用于缓存键） */
  stableHash?: string;
}

// ==================== 视图上下文 ====================

/**
 * 内容筛选器
 */
export interface ContentFilter {
  /** 包含的类型 */
  includeTypes?: ContentType[];
  /** 排除的类型 */
  excludeTypes?: ContentType[];
  /** 名称匹配模式 */
  namePattern?: string;
}

/**
 * 视图帧 - 代表一个打开的容器
 */
export interface ViewFrame {
  /** 容器信息 */
  container: ContentItem;

  /** 展开后的子项列表 */
  items: ContentItem[];

  /** 当前选中索引 */
  currentIndex: number;

  /** 排序模式 */
  sortMode: SortMode;

  /** 筛选条件 */
  filter?: ContentFilter;

  /** 阅读顺序 */
  readOrder: ReadOrder;
}

/**
 * 视图上下文状态
 */
export interface ViewContextState {
  /** 帧栈（支持嵌套） */
  stack: ViewFrame[];

  /** 是否正在加载 */
  loading: boolean;

  /** 错误信息 */
  error: string;

  /** 查看器是否打开 */
  viewerOpen: boolean;
}

// ==================== 历史记录 ====================

/**
 * 视频进度
 */
export interface VideoProgress {
  position: number;
  duration: number;
  completed: boolean;
}

/**
 * 统一历史记录条目
 */
export interface UnifiedHistoryEntry {
  /** 唯一 ID */
  id: string;

  /** 路径栈（支持嵌套定位） */
  pathStack: ContentRef[];

  /** 最深层当前索引（回退用） */
  currentIndex: number;

  /** 当前页面文件路径（优先用于恢复，解决排序变化问题）*/
  currentFilePath?: string;

  /** 显示名称 */
  displayName: string;

  /** 缩略图 */
  thumbnail?: string;

  /** 时间戳 */
  timestamp: number;

  /** 视频进度 */
  videoProgress?: VideoProgress;

  /** 总项数 */
  totalItems: number;

  /** 内容类型（最深层） */
  contentType?: ContentType;
}

// ==================== 辅助函数 ====================

/**
 * 判断是否为容器类型
 */
export function isContainerType(type: ContentType): boolean {
  return type === 'archive' || type === 'folder' || type === 'playlist';
}

/**
 * 判断内容项是否为容器
 */
export function isContainer(item: ContentItem): boolean {
  return isContainerType(item.type);
}

/**
 * 判断是否为可显示的叶子节点
 */
export function isDisplayable(item: ContentItem): boolean {
  return item.type === 'image' || item.type === 'video' || item.type === 'animated';
}

/**
 * 从路径推断内容类型
 */
export function inferContentType(path: string): ContentType {
  const ext = path.split('.').pop()?.toLowerCase() || '';

  // 视频
  if (['mp4', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'flv', 'm4v', 'ts'].includes(ext)) {
    return 'video';
  }

  // 动图
  if (ext === 'gif') {
    return 'animated';
  }

  // 压缩包
  if (['zip', 'rar', '7z', 'cbz', 'cbr', 'cb7', 'tar', 'gz'].includes(ext)) {
    return 'archive';
  }

  // 电子书
  if (['pdf', 'epub', 'xps', 'mobi'].includes(ext)) {
    return 'ebook';
  }

  // 图片
  if (['jpg', 'jpeg', 'png', 'webp', 'avif', 'jxl', 'bmp', 'tiff', 'ico', 'heic', 'heif', 'psd'].includes(ext)) {
    return 'image';
  }

  return 'unknown';
}

/**
 * 生成内容项 ID
 */
export function generateContentId(path: string, innerPath?: string): string {
  const fullPath = innerPath ? `${path}::${innerPath}` : path;
  // 简单哈希
  let hash = 0;
  for (let i = 0; i < fullPath.length; i++) {
    const char = fullPath.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * 从路径提取名称
 */
export function extractName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/**
 * 创建 ContentRef
 */
export function createRef(path: string, innerPath?: string): ContentRef {
  return innerPath ? { path, innerPath } : { path };
}

/**
 * 比较两个 ContentRef 是否相等
 */
export function refEquals(a: ContentRef, b: ContentRef): boolean {
  return a.path === b.path && a.innerPath === b.innerPath;
}

/**
 * 获取 ContentRef 的完整路径字符串
 */
export function refToString(ref: ContentRef): string {
  return ref.innerPath ? `${ref.path}::${ref.innerPath}` : ref.path;
}
