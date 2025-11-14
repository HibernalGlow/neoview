import type { FsItem } from '$lib/types';

export type SortField = 'path' | 'name' | 'modified' | 'size' | 'type';
export type SortOrder = 'asc' | 'desc';
export type SortConfig = {
  field: SortField;
  order: SortOrder;
};

let sortConfig: SortConfig = { field: 'path', order: 'asc' };

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
