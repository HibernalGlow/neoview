export type { FsItem } from './FsItem';

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
