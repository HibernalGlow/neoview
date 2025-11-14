/**
 * NeoView - Book Types
 * 书籍相关的 TypeScript 类型定义
 */

export type BookType = 'archive' | 'folder' | 'pdf' | 'media';

export type PageSortMode = 'fileName' | 'fileNameDescending' | 'fileSize' | 'timeStamp' | 'random' | 'entry';

export type ReadOrder = 'leftToRight' | 'rightToLeft';

export type PageMode = 'singlePage' | 'widePage' | 'twoPage';

export interface Page {
  /** 页面索引 */
  index: number;
  /** 页面路径 */
  path: string;
  /** 内部路径（用于压缩包内的文件） */
  innerPath?: string;
  /** 文件名 */
  name: string;
  /** 文件大小 (字节) */
  size: number;
  /** 图像宽度 */
  width?: number;
  /** 图像高度 */
  height?: number;
  /** 是否已加载 */
  loaded: boolean;
  /** 是否是封面 */
  isCover?: boolean;
  /** 缩略图数据 */
  thumbnail?: string;
  /** 稳定哈希值（用于缓存键） */
  stableHash: string;
}

export interface BookInfo {
  /** 书籍路径 */
  path: string;
  /** 书籍名称 */
  name: string;
  /** 书籍类型 */
  type: BookType;
  /** 总页数 */
  totalPages: number;
  /** 当前页索引 */
  currentPage: number;
  /** 页面列表 */
  pages: Page[];
  /** 排序模式 */
  sortMode: PageSortMode;
  /** 阅读顺序 */
  readOrder: ReadOrder;
  /** 页面模式 */
  pageMode: PageMode;
  /** 创建时间 */
  createdAt?: string;
  /** 修改时间 */
  modifiedAt?: string;
  /** 文件大小 */
  fileSize?: number;
}

export interface BookHistory {
  /** 书籍路径 */
  path: string;
  /** 书籍名称 */
  name: string;
  /** 最后访问时间 */
  lastAccess: string;
  /** 最后阅读页码 */
  lastPage: number;
  /** 总页数 */
  totalPages: number;
  /** 缩略图 */
  thumbnail?: string;
}

export interface Bookmark {
  /** ID */
  id: string;
  /** 书籍路径 */
  bookPath: string;
  /** 页面索引 */
  pageIndex: number;
  /** 书签名称 */
  name?: string;
  /** 创建时间 */
  createdAt: string;
  /** 注释 */
  comment?: string;
}

export interface BookSettings {
  /** 默认排序模式 */
  defaultSortMode: PageSortMode;
  /** 默认阅读顺序 */
  defaultReadOrder: ReadOrder;
  /** 默认页面模式 */
  defaultPageMode: PageMode;
  /** 是否记住最后位置 */
  rememberLastPosition: boolean;
  /** 历史记录最大数量 */
  maxHistoryCount: number;
}
