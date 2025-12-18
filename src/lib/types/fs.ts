/**
 * 文件系统项
 */
export interface FsItem {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified?: number;
  created?: number;
  isImage: boolean;
  // 文件夹统计（仅对文件夹有效，不递归）
  folderCount?: number;
  imageCount?: number;
  archiveCount?: number;
  videoCount?: number;
  // EMM 元数据（可选）
  emmMetadata?: {
    translatedTitle?: string;
    tags?: Record<string, string[]>;
  };
  // 评分数据（可选，用于排序）
  rating?: number;
  // 收藏标签匹配数（可选，用于排序）
  collectTagCount?: number;
  // 历史记录元数据（可选，仅用于历史记录列表）
  historyMetadata?: {
    currentPage?: number;
    totalPages?: number;
    videoPosition?: number;
    videoDuration?: number;
    videoCompleted?: boolean;
  };
}

/**
 * 文件浏览器配置
 */
export interface FileBrowserOptions {
  /** 是否显示隐藏文件 */
  showHidden?: boolean;
  /** 是否递归加载 */
  recursive?: boolean;
  /** 排序方式 */
  sortBy?: 'name' | 'size' | 'modified';
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
}

/**
 * 缩略图选项
 */
export interface ThumbnailOptions {
  /** 缩略图大小 */
  size?: number;
  /** 是否使用缓存 */
  useCache?: boolean;
}
