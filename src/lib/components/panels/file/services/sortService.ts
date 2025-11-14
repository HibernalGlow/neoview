import type { FsItem } from '$lib/types';

export type SortField = 'path' | 'name' | 'modified' | 'size' | 'type';
export type SortOrder = 'asc' | 'desc';
export type SortConfig = {
  field: SortField;
  order: SortOrder;
};

const SORT_STORAGE_KEY = 'neoview-sort-config';

function readStoredSortConfig(): SortConfig | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.field && parsed.order) {
      return parsed as SortConfig;
    }
  } catch (err) {
    console.warn('读取排序配置失败:', err);
  }
  return null;
}

function persistSortConfig(config: SortConfig) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('保存排序配置失败:', err);
  }
}

let sortConfig: SortConfig = readStoredSortConfig() ?? { field: 'path', order: 'asc' };
persistSortConfig(sortConfig);

export const sortFieldLabels: Record<SortField, string> = {
  path: '路径',
  name: '名称',
  modified: '修改时间',
  size: '大小',
  type: '类型',
};

function getItemType(item: FsItem): string {
  if (item.isDir) return '0_folder';
  if (item.name.toLowerCase().endsWith('.zip') || item.name.toLowerCase().endsWith('.cbz') || item.name.toLowerCase().endsWith('.rar') || item.name.toLowerCase().endsWith('.cbr')) {
    return '1_archive';
  }
  if (item.isImage) return '2_image';
  return '3_file';
}

export function getSortConfig(): SortConfig {
  return sortConfig;
}

export function setSortConfig(config: SortConfig) {
  sortConfig = config;
  persistSortConfig(config);
}

export function sortFsItems(items: FsItem[], config: SortConfig = sortConfig): FsItem[] {
  const { field, order } = config;
  const sorted = [...items].sort((a, b) => {
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1;
    }

    let comparison = 0;

    switch (field) {
      case 'path':
        comparison = a.path.localeCompare(b.path, undefined, { numeric: true });
        break;
      case 'name':
        comparison = a.name.localeCompare(b.name, undefined, { numeric: true });
        break;
      case 'modified':
        comparison = (a.modified ?? 0) - (b.modified ?? 0);
        break;
      case 'size':
        comparison = (a.size ?? 0) - (b.size ?? 0);
        break;
      case 'type':
        comparison = getItemType(a).localeCompare(getItemType(b));
        if (comparison === 0) {
          comparison = a.name.localeCompare(b.name);
        }
        break;
    }

    return order === 'asc' ? comparison : -comparison;
  });

  return sorted;
}
