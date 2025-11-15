/**
 * 文件系统项目类型定义
 */

export interface FsItem {
  /** 文件/文件夹的完整路径 */
  path: string;
  /** 文件/文件夹名称 */
  name: string;
  /** 是否为目录 */
  isDir: boolean;
  /** 是否为图片文件 */
  isImage?: boolean;
  /** 是否为压缩包 */
  isArchive?: boolean;
  /** 文件大小（字节） */
  size?: number;
  /** 修改时间戳 */
  modified?: number;
  /** 是否有子项 */
  hasChildren?: boolean;
  /** 创建时间戳 */
  created?: number;
  /** 文件扩展名 */
  extension?: string;
  /** MIME类型 */
  mimeType?: string;
  /** 是否隐藏文件 */
  isHidden?: boolean;
  /** 是否为符号链接 */
  isSymlink?: boolean;
  /** 符号链接目标路径 */
  symlinkTarget?: string;
  /** 文件权限 */
  permissions?: string;
  /** 所有者 */
  owner?: string;
  /** 组 */
  group?: string;
}

export interface FileTreeNode {
  /** 节点路径 */
  path: string;
  /** 节点名称 */
  name: string;
  /** 是否为目录 */
  isDir: boolean;
  /** 节点深度 */
  depth: number;
  /** 是否展开 */
  isExpanded: boolean;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 是否有子节点 */
  hasChildren: boolean;
  /** 子节点路径列表 */
  children: string[];
  /** 是否为特殊节点（主页、书签等） */
  isSpecial?: boolean;
  /** 节点图标 */
  icon?: any;
}

export interface NavigationOptions {
  /** 排序配置 */
  sortConfig: {
    field: string;
    direction: 'asc' | 'desc';
  };
  /** 缩略图缓存 */
  thumbnails?: Map<string, string>;
  /** 清除选择回调 */
  clearSelection?: () => void;
}

export interface NavigationContext extends NavigationOptions {
  /** 当前路径 */
  currentPath: string;
  /** 当前压缩包路径 */
  currentArchivePath: string;
  /** 是否为压缩包视图 */
  isArchiveView: boolean;
}

export interface SearchHistoryEntry {
  query: string;
  timestamp: number;
}

export interface SearchSettings {
  includeSubfolders: boolean;
  showHistoryOnFocus: boolean;
}

export interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}