/**
 * FolderStack 模块导出
 * 
 * FolderStack 是一个复杂的层叠式文件夹导航组件
 * 参考 iOS UINavigationController 设计
 */

// 类型定义
export interface FolderLayer {
  id: string;
  path: string;
  items: import('$lib/types').FsItem[];
  loading: boolean;
  error: string | null;
  selectedIndex: number;
  scrollTop: number;
}

export interface NavigationCommand {
  type: 'init' | 'push' | 'pop' | 'goto' | 'history';
  path?: string;
  index?: number;
}

// 工具函数导出
export { sortItems, filterItems } from './sortingUtils';
export { normalizePath, isChildPath, getParentPath, getParentPaths } from './pathUtils';
