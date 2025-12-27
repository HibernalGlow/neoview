/**
 * FolderStack 路径处理工具函数
 */

/**
 * 规范化路径（统一分隔符和大小写）
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

/**
 * 检查路径是否是另一个路径的子目录
 */
export function isChildPath(childPath: string, parentPath: string): boolean {
  const normalizedChild = childPath.replace(/\\/g, '/').toLowerCase();
  const normalizedParent = parentPath.replace(/\\/g, '/').toLowerCase();
  return normalizedChild.startsWith(normalizedParent + '/');
}

/**
 * 获取父目录路径 - 统一使用 Windows 反斜杠格式
 */
export function getParentPath(path: string): string | null {
  const normalized = path.replace(/\//g, '\\');
  const parts = normalized.split('\\').filter(Boolean);
  if (parts.length <= 1) return null;
  parts.pop();
  let parentPath = parts.join('\\');
  if (/^[a-zA-Z]:$/.test(parentPath)) {
    parentPath += '\\';
  }
  return parentPath;
}

/**
 * 获取多层父目录路径
 * @param path 起始路径
 * @param count 要获取的层数
 * @returns 父目录路径数组（从近到远）
 */
export function getParentPaths(path: string, count: number): string[] {
  const parents: string[] = [];
  let currentPath = path;
  for (let i = 0; i < count; i++) {
    const parent = getParentPath(currentPath);
    if (!parent) break;
    parents.push(parent);
    currentPath = parent;
  }
  return parents;
}

/**
 * 将路径转换为相对 key（用于缩略图存储）
 */
export function toRelativeKey(path: string): string {
  return path.replace(/\\/g, '/');
}
