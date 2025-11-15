/**
 * Selection Store
 * 选择集管理，参考 spacedrive 的 Hash 选择方式
 * 使用唯一标识符避免引用变化导致失效
 */

import { writable } from 'svelte/store';
import type { FsItem } from '$lib/types';

// 生成项目的唯一标识符
export function getItemId(item: FsItem): string {
  // 使用路径作为唯一标识，因为文件系统中路径是唯一的
  return item.path;
}

// 选择项信息
interface SelectionItem {
  id: string;
  item: FsItem;
  index: number;
}

// 选择状态
interface SelectionState {
  // 选中的项目ID集合
  selectedIds: Set<string>;
  // 选中的项目详细信息映射
  itemsMap: Map<string, SelectionItem>;
  // 最后一个选中的项目（用于范围选择）
  lastSelectedId: string | null;
  // 是否处于多选模式
  isMultiSelect: boolean;
  // 选择范围起始点
  rangeAnchorId: string | null;
}

function createSelectionStore() {
  const initialState: SelectionState = {
    selectedIds: new Set(),
    itemsMap: new Map(),
    lastSelectedId: null,
    isMultiSelect: false,
    rangeAnchorId: null
  };

  const { subscribe, set, update } = writable<SelectionState>(initialState);
  let currentState = initialState;

  subscribe(state => {
    currentState = state;
  });

  return {
    subscribe,
    
    // 获取当前状态
    getState: () => currentState,
    
    // 获取选中的项目列表
    getSelectedItems: (): FsItem[] => {
      return Array.from(currentState.selectedIds)
        .map(id => currentState.itemsMap.get(id)?.item)
        .filter(Boolean) as FsItem[];
    },
    
    // 获取选中项目的路径列表
    getSelectedPaths: (): string[] => {
      return Array.from(currentState.selectedIds);
    },
    
    // 检查项目是否被选中
    isSelected: (item: FsItem): boolean => {
      return currentState.selectedIds.has(getItemId(item));
    },
    
    // 获取选中数量
    getSelectedCount: (): number => {
      return currentState.selectedIds.size;
    },
    
    // 清空所有选择
    clear: () => {
      update(state => ({
        ...state,
        selectedIds: new Set(),
        itemsMap: new Map(),
        lastSelectedId: null,
        rangeAnchorId: null
      }));
    },
    
    // 选择单个项目
    select: (item: FsItem, index: number) => {
      const id = getItemId(item);
      update(state => {
        const newSelectedIds = new Set<string>();
        const newItemsMap = new Map<string, SelectionItem>();
        
        newSelectedIds.add(id);
        newItemsMap.set(id, { id, item, index });
        
        return {
          ...state,
          selectedIds: newSelectedIds,
          itemsMap: newItemsMap,
          lastSelectedId: id,
          rangeAnchorId: id
        };
      });
    },
    
    // 追加选择（保持原有选择）
    addToSelection: (item: FsItem, index: number) => {
      const id = getItemId(item);
      update(state => {
        if (state.selectedIds.has(id)) return state;
        
        const newSelectedIds = new Set(state.selectedIds);
        const newItemsMap = new Map(state.itemsMap);
        
        newSelectedIds.add(id);
        newItemsMap.set(id, { id, item, index });
        
        return {
          ...state,
          selectedIds: newSelectedIds,
          itemsMap: newItemsMap,
          lastSelectedId: id
        };
      });
    },
    
    // 从选择中移除
    removeFromSelection: (item: FsItem) => {
      const id = getItemId(item);
      update(state => {
        if (!state.selectedIds.has(id)) return state;
        
        const newSelectedIds = new Set(state.selectedIds);
        const newItemsMap = new Map(state.itemsMap);
        
        newSelectedIds.delete(id);
        newItemsMap.delete(id);
        
        return {
          ...state,
          selectedIds: newSelectedIds,
          itemsMap: newItemsMap
        };
      });
    },
    
    // 切换选择状态
    toggleSelection: (item: FsItem, index: number) => {
      const id = getItemId(item);
      update(state => {
        const newSelectedIds = new Set(state.selectedIds);
        const newItemsMap = new Map(state.itemsMap);
        
        if (newSelectedIds.has(id)) {
          newSelectedIds.delete(id);
          newItemsMap.delete(id);
        } else {
          newSelectedIds.add(id);
          newItemsMap.set(id, { id, item, index });
        }
        
        return {
          ...state,
          selectedIds: newSelectedIds,
          itemsMap: newItemsMap,
          lastSelectedId: id,
          rangeAnchorId: id
        };
      });
    },
    
    // 选择范围内的项目
    selectRange: (items: FsItem[], startIndex: number, endIndex: number) => {
      const start = Math.min(startIndex, endIndex);
      const end = Math.max(startIndex, endIndex);
      
      update(state => {
        const newSelectedIds = new Set<string>();
        const newItemsMap = new Map<string, SelectionItem>();
        
        for (let i = start; i <= end; i++) {
          const item = items[i];
          if (!item) continue;
          
          const id = getItemId(item);
          newSelectedIds.add(id);
          newItemsMap.set(id, { id, item, index: i });
        }
        
        return {
          ...state,
          selectedIds: newSelectedIds,
          itemsMap: newItemsMap,
          lastSelectedId: getItemId(items[end]) || null,
          rangeAnchorId: getItemId(items[start]) || null
        };
      });
    },
    
    // 全选
    selectAll: (items: FsItem[]) => {
      update(state => {
        const newSelectedIds = new Set<string>();
        const newItemsMap = new Map<string, SelectionItem>();
        
        items.forEach((item, index) => {
          const id = getItemId(item);
          newSelectedIds.add(id);
          newItemsMap.set(id, { id, item, index });
        });
        
        return {
          ...state,
          selectedIds: newSelectedIds,
          itemsMap: newItemsMap,
          lastSelectedId: items.length > 0 ? getItemId(items[items.length - 1]) : null,
          rangeAnchorId: items.length > 0 ? getItemId(items[0]) : null
        };
      });
    },
    
    // 反选
    invertSelection: (items: FsItem[]) => {
      update(state => {
        const newSelectedIds = new Set<string>();
        const newItemsMap = new Map<string, SelectionItem>();
        
        items.forEach((item, index) => {
          const id = getItemId(item);
          if (!state.selectedIds.has(id)) {
            newSelectedIds.add(id);
            newItemsMap.set(id, { id, item, index });
          }
        });
        
        return {
          ...state,
          selectedIds: newSelectedIds,
          itemsMap: newItemsMap
        };
      });
    },
    
    // 设置多选模式
    setMultiSelect: (enabled: boolean) => {
      update(state => ({
        ...state,
        isMultiSelect: enabled,
        rangeAnchorId: enabled ? state.rangeAnchorId : null
      }));
    },
    
    // 更新项目索引（用于列表重新排序后）
    updateIndices: (items: FsItem[]) => {
      update(state => {
        const newItemsMap = new Map<string, SelectionItem>();
        
        state.selectedIds.forEach(id => {
          const oldItem = state.itemsMap.get(id);
          if (oldItem) {
            // 找到项目的新索引
            const newIndex = items.findIndex(item => getItemId(item) === id);
            if (newIndex !== -1) {
              newItemsMap.set(id, { ...oldItem, index: newIndex });
            }
          }
        });
        
        return {
          ...state,
          itemsMap: newItemsMap
        };
      });
    }
  };
}

export const selectionStore = createSelectionStore();