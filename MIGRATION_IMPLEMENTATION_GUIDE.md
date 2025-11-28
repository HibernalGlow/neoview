# 文件面板迁移实现指南

## 🚀 快速开始

本指南提供了将老面板缺失功能迁移到新面板的具体实现步骤。

---

## 1️⃣ 删除策略选择（高优先级）

### 问题
新面板硬编码为 `moveToTrash`，无法选择永久删除。

### 解决方案

#### 步骤 1: 更新 Store
**文件**: `src/lib/components/panels/folderPanel/stores/folderPanelStore.svelte.ts`

在 `FolderPanelState` 接口中添加：
```typescript
export interface FolderPanelState {
  // ... 现有字段 ...
  deleteStrategy: 'trash' | 'permanent';
}
```

在 `initialState` 中添加：
```typescript
const initialState: FolderPanelState = {
  // ... 现有字段 ...
  deleteStrategy: 'trash'
};
```

在 `saveState` 中添加：
```typescript
function saveState(state: Partial<FolderPanelState>) {
  const toSave = {
    // ... 现有字段 ...
    deleteStrategy: state.deleteStrategy
  };
  // ...
}
```

导出 store：
```typescript
export const deleteStrategy = derived(state, ($state) => $state.deleteStrategy);
```

添加 action：
```typescript
export const folderPanelActions = {
  // ... 现有 actions ...
  
  /**
   * 设置删除策略
   */
  setDeleteStrategy(strategy: 'trash' | 'permanent') {
    state.update((s) => {
      const newState = { ...s, deleteStrategy: strategy };
      saveState(newState);
      return newState;
    });
  },

  /**
   * 切换删除策略
   */
  toggleDeleteStrategy() {
    state.update((s) => {
      const next = s.deleteStrategy === 'trash' ? 'permanent' : 'trash';
      const newState = { ...s, deleteStrategy: next };
      saveState(newState);
      return newState;
    });
  }
};
```

#### 步骤 2: 更新 FolderPanel
**文件**: `src/lib/components/panels/folderPanel/FolderPanel.svelte`

导入 store：
```typescript
import {
  // ... 现有导入 ...
  deleteStrategy
} from './stores/folderPanelStore.svelte';
```

更新删除函数：
```typescript
// 处理删除
async function handleDelete(item: FsItem) {
  const confirmMessage = `确定要${$deleteStrategy === 'trash' ? '删除' : '永久删除'} "${item.name}" 吗？`;
  if (!confirm(confirmMessage)) return;

  try {
    if ($deleteStrategy === 'trash') {
      await FileSystemAPI.moveToTrash(item.path);
    } else {
      await FileSystemAPI.deletePath(item.path);
    }
    showSuccessToast('删除成功', item.name);
    handleRefresh();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    showErrorToast('删除失败', message);
  }
}

// 处理批量删除
async function handleBatchDelete() {
  const selected = $selectedItems;
  if (selected.size === 0) {
    showErrorToast('没有选中的文件', '请先选择要删除的文件');
    return;
  }

  const paths = Array.from(selected);
  const confirmMessage = `确定要${$deleteStrategy === 'trash' ? '删除' : '永久删除'}选中的 ${paths.length} 个项目吗？`;
  if (!confirm(confirmMessage)) return;

  try {
    for (const path of paths) {
      if ($deleteStrategy === 'trash') {
        await FileSystemAPI.moveToTrash(path);
      } else {
        await FileSystemAPI.deletePath(path);
      }
    }
    showSuccessToast('删除成功', `已删除 ${paths.length} 个文件`);
    folderPanelActions.deselectAll();
    handleRefresh();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    showErrorToast('删除失败', message);
  }
}

// 处理删除策略切换
function handleToggleDeleteStrategy() {
  folderPanelActions.toggleDeleteStrategy();
  showSuccessToast('删除策略已切换', `当前: ${$deleteStrategy === 'trash' ? '移动到回收站' : '永久删除'}`);
}
```

#### 步骤 3: 更新工具栏
**文件**: `src/lib/components/panels/folderPanel/components/FolderToolbar.svelte`

在工具栏中添加删除策略按钮：
```svelte
<script lang="ts">
  import {
    // ... 现有导入 ...
    deleteStrategy,
    folderPanelActions
  } from '../stores/folderPanelStore.svelte';

  interface Props {
    // ... 现有 props ...
    onToggleDeleteStrategy?: () => void;
  }

  let { onToggleDeleteStrategy }: Props = $props();

  function handleToggleDeleteStrategy(e: MouseEvent) {
    e.preventDefault();
    onToggleDeleteStrategy?.();
  }
</script>

<!-- 在工具栏中添加按钮 -->
<Tooltip.Root>
  <Tooltip.Trigger asChild let:builder>
    <Button
      builders={[builder]}
      variant="ghost"
      size="sm"
      on:click={handleToggleDeleteStrategy}
      title={`删除策略: ${$deleteStrategy === 'trash' ? '移动到回收站' : '永久删除'}`}
    >
      <Trash2 class="h-4 w-4" />
    </Button>
  </Tooltip.Trigger>
  <Tooltip.Content>
    删除策略: {$deleteStrategy === 'trash' ? '移动到回收站' : '永久删除'}
  </Tooltip.Content>
</Tooltip.Root>
```

#### 步骤 4: 更新右键菜单
**文件**: `src/lib/components/panels/folderPanel/components/FolderContextMenu.svelte`

在右键菜单中添加删除策略选项：
```svelte
<script lang="ts">
  import {
    deleteStrategy,
    folderPanelActions
  } from '../stores/folderPanelStore.svelte';

  interface Props {
    // ... 现有 props ...
    onToggleDeleteStrategy?: () => void;
  }

  let { onToggleDeleteStrategy }: Props = $props();
</script>

<!-- 在菜单中添加 -->
<UIContextMenu.Item on:click={() => onToggleDeleteStrategy?.()}>
  <Trash2 class="mr-2 h-4 w-4" />
  <span>删除策略: {$deleteStrategy === 'trash' ? '回收站' : '永久'}</span>
</UIContextMenu.Item>
```

---

## 2️⃣ 键盘快捷键（高优先级）

### 问题
新面板缺少键盘快捷键支持。

### 解决方案

**文件**: `src/lib/components/panels/folderPanel/FolderPanel.svelte`

添加键盘事件处理：
```typescript
// 键盘导航处理
function handleKeydown(e: KeyboardEvent) {
  const items = $sortedItems;
  if (items.length === 0) return;

  // 获取当前选中项索引
  const currentIndex = items.findIndex(item => {
    const selected = $selectedItems;
    return selected.size > 0 && selected.has(item.path);
  });

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      if (currentIndex < items.length - 1) {
        const nextItem = items[currentIndex + 1];
        folderPanelActions.selectItem(nextItem.path);
      }
      break;

    case 'ArrowUp':
      e.preventDefault();
      if (currentIndex > 0) {
        const prevItem = items[currentIndex - 1];
        folderPanelActions.selectItem(prevItem.path);
      }
      break;

    case 'Enter':
      e.preventDefault();
      if (currentIndex >= 0) {
        const item = items[currentIndex];
        if (item.isDir) {
          navigationCommand.set({ type: 'push', path: item.path });
        } else {
          handleItemOpen(item);
        }
      }
      break;

    case 'Home':
      e.preventDefault();
      if (items.length > 0) {
        folderPanelActions.selectItem(items[0].path);
      }
      break;

    case 'End':
      e.preventDefault();
      if (items.length > 0) {
        folderPanelActions.selectItem(items[items.length - 1].path);
      }
      break;

    case 'Backspace':
      e.preventDefault();
      handleGoBack();
      break;

    case 'F5':
      e.preventDefault();
      handleRefresh();
      break;

    case 'Delete':
      e.preventDefault();
      if ($deleteMode && $selectedItems.size > 0) {
        handleBatchDelete();
      }
      break;

    case 'a':
      // Ctrl+A 全选
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        folderPanelActions.selectAll();
      }
      break;

    case 'f':
      // Ctrl+F 打开搜索
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        folderPanelActions.toggleShowSearchBar();
      }
      break;
  }
}

// 在 onMount 中添加事件监听
onMount(() => {
  // ... 现有代码 ...
  document.addEventListener('keydown', handleKeydown);
  
  return () => {
    document.removeEventListener('keydown', handleKeydown);
  };
});
```

在模板中添加 tabindex 使组件可以接收键盘事件：
```svelte
<div class="flex h-full flex-col overflow-hidden" tabindex="0" on:keydown={handleKeydown}>
  <!-- ... 现有内容 ... -->
</div>
```

---

## 3️⃣ 搜索高级功能（高优先级）

### 问题
搜索功能缺少历史记录、递归搜索、路径搜索等高级功能。

### 解决方案

#### 步骤 1: 更新 Store
**文件**: `src/lib/components/panels/folderPanel/stores/folderPanelStore.svelte.ts`

```typescript
export interface FolderPanelState {
  // ... 现有字段 ...
  searchHistory: { query: string; timestamp: number }[];
  searchSettings: {
    includeSubfolders: boolean;
    showHistoryOnFocus: boolean;
    searchInPath: boolean;
  };
}

const initialState: FolderPanelState = {
  // ... 现有字段 ...
  searchHistory: [],
  searchSettings: {
    includeSubfolders: true,
    showHistoryOnFocus: true,
    searchInPath: false
  }
};

export const folderPanelActions = {
  // ... 现有 actions ...

  /**
   * 添加搜索历史
   */
  addSearchHistory(query: string) {
    if (!query.trim()) return;
    
    state.update((s) => {
      const newHistory = [
        { query: query.trim(), timestamp: Date.now() },
        ...s.searchHistory.filter(h => h.query !== query.trim())
      ].slice(0, 20); // 只保留最近 20 条
      return { ...s, searchHistory: newHistory };
    });
  },

  /**
   * 清除搜索历史
   */
  clearSearchHistory() {
    state.update((s) => ({ ...s, searchHistory: [] }));
  },

  /**
   * 更新搜索设置
   */
  updateSearchSettings(settings: Partial<FolderPanelState['searchSettings']>) {
    state.update((s) => ({
      ...s,
      searchSettings: { ...s.searchSettings, ...settings }
    }));
  }
};

// 导出搜索历史和设置
export const searchHistory = derived(state, ($state) => $state.searchHistory);
export const searchSettings = derived(state, ($state) => $state.searchSettings);
```

#### 步骤 2: 更新搜索栏组件
**文件**: `src/lib/components/panels/folderPanel/FolderPanel.svelte`

```typescript
import {
  // ... 现有导入 ...
  searchHistory,
  searchSettings
} from './stores/folderPanelStore.svelte';

// 处理搜索
function handleSearch(keyword: string) {
  if (keyword.trim()) {
    folderPanelActions.addSearchHistory(keyword);
  }
  folderPanelActions.setSearchKeyword(keyword);
}

// 处理搜索设置变化
function handleSearchSettingsChange(key: string, value: boolean) {
  folderPanelActions.updateSearchSettings({
    [key]: value
  } as any);
}
```

---

## 4️⃣ 快速目标文件夹（中优先级）

### 问题
完全缺少快速复制/移动目标功能。

### 解决方案

#### 步骤 1: 更新 Store
**文件**: `src/lib/components/panels/folderPanel/stores/folderPanelStore.svelte.ts`

```typescript
export interface QuickFolderTarget {
  id: string;
  name: string;
  path: string;
}

export interface FolderPanelState {
  // ... 现有字段 ...
  quickFolderTargets: QuickFolderTarget[];
  quickFolderMode: 'copy' | 'move';
}

const QUICK_FOLDER_STORAGE_KEY = 'neoview-folder-panel-quick-folders';

function loadQuickFolders(): { targets: QuickFolderTarget[]; mode: 'copy' | 'move' } {
  try {
    const saved = localStorage.getItem(QUICK_FOLDER_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        targets: Array.isArray(parsed.targets) ? parsed.targets : [],
        mode: parsed.mode === 'move' ? 'move' : 'copy'
      };
    }
  } catch (e) {
    console.error('[FolderPanelStore] Failed to load quick folders:', e);
  }
  return { targets: [], mode: 'copy' };
}

const quickFolders = loadQuickFolders();

const initialState: FolderPanelState = {
  // ... 现有字段 ...
  quickFolderTargets: quickFolders.targets,
  quickFolderMode: quickFolders.mode
};

export const folderPanelActions = {
  // ... 现有 actions ...

  /**
   * 添加快速目标文件夹
   */
  addQuickFolderTarget(path: string, name?: string) {
    state.update((s) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const displayName = name || path.split(/[\\/]/).pop() || '新目标';
      const newTargets = [...s.quickFolderTargets, { id, path, name: displayName }];
      
      try {
        localStorage.setItem(QUICK_FOLDER_STORAGE_KEY, JSON.stringify({
          targets: newTargets,
          mode: s.quickFolderMode
        }));
      } catch (e) {
        console.error('[FolderPanelStore] Failed to save quick folders:', e);
      }
      
      return { ...s, quickFolderTargets: newTargets };
    });
  },

  /**
   * 删除快速目标文件夹
   */
  removeQuickFolderTarget(id: string) {
    state.update((s) => {
      const newTargets = s.quickFolderTargets.filter(t => t.id !== id);
      
      try {
        localStorage.setItem(QUICK_FOLDER_STORAGE_KEY, JSON.stringify({
          targets: newTargets,
          mode: s.quickFolderMode
        }));
      } catch (e) {
        console.error('[FolderPanelStore] Failed to save quick folders:', e);
      }
      
      return { ...s, quickFolderTargets: newTargets };
    });
  },

  /**
   * 设置快速目标模式
   */
  setQuickFolderMode(mode: 'copy' | 'move') {
    state.update((s) => {
      try {
        localStorage.setItem(QUICK_FOLDER_STORAGE_KEY, JSON.stringify({
          targets: s.quickFolderTargets,
          mode
        }));
      } catch (e) {
        console.error('[FolderPanelStore] Failed to save quick folders:', e);
      }
      
      return { ...s, quickFolderMode: mode };
    });
  }
};

export const quickFolderTargets = derived(state, ($state) => $state.quickFolderTargets);
export const quickFolderMode = derived(state, ($state) => $state.quickFolderMode);
```

#### 步骤 2: 在右键菜单中添加快速复制/移动
**文件**: `src/lib/components/panels/folderPanel/components/FolderContextMenu.svelte`

```svelte
<script lang="ts">
  import {
    quickFolderTargets,
    quickFolderMode,
    folderPanelActions
  } from '../stores/folderPanelStore.svelte';

  interface Props {
    // ... 现有 props ...
    onQuickCopyTo?: (sourcePath: string, targetPath: string) => void;
    onQuickMoveTo?: (sourcePath: string, targetPath: string) => void;
    onAddQuickTarget?: (path: string) => void;
  }

  let { onQuickCopyTo, onQuickMoveTo, onAddQuickTarget }: Props = $props();
</script>

<!-- 在菜单中添加 -->
{#if $quickFolderTargets.length > 0}
  <UIContextMenu.Separator />
  <UIContextMenu.Label>快速{$quickFolderMode === 'copy' ? '复制' : '移动'}到</UIContextMenu.Label>
  {#each $quickFolderTargets as target}
    <UIContextMenu.Item 
      on:click={() => {
        if ($quickFolderMode === 'copy') {
          onQuickCopyTo?.(item.path, target.path);
        } else {
          onQuickMoveTo?.(item.path, target.path);
        }
      }}
    >
      <Folder class="mr-2 h-4 w-4" />
      <span>{target.name}</span>
    </UIContextMenu.Item>
  {/each}
{/if}

<UIContextMenu.Separator />
<UIContextMenu.Item on:click={() => onAddQuickTarget?.(item.path)}>
  <Plus class="mr-2 h-4 w-4" />
  <span>添加为快速目标</span>
</UIContextMenu.Item>
```

---

## 5️⃣ 路径栏编辑（中优先级）

### 问题
面包屑导航无法直接编辑输入路径。

### 解决方案

**文件**: `src/lib/components/panels/folderPanel/components/BreadcrumbBar.svelte`

```svelte
<script lang="ts">
  let isEditMode = $state(false);
  let editPath = $state('');

  function handleEditMode() {
    isEditMode = true;
    editPath = $currentPath;
  }

  function handleConfirmEdit() {
    if (editPath.trim()) {
      onNavigate?.(editPath.trim());
    }
    isEditMode = false;
  }

  function handleCancelEdit() {
    isEditMode = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleConfirmEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  }
</script>

{#if isEditMode}
  <input
    type="text"
    value={editPath}
    on:change={(e) => editPath = e.currentTarget.value}
    on:keydown={handleKeydown}
    on:blur={handleCancelEdit}
    class="w-full px-2 py-1 border rounded"
    autofocus
  />
{:else}
  <!-- 现有面包屑导航 -->
  <button on:click={handleEditMode} title="点击编辑路径">
    <!-- 面包屑内容 -->
  </button>
{/if}
```

---

## 6️⃣ 穿透模式完整实现（中优先级）

### 问题
穿透模式定义了但未实现自动进入逻辑。

### 解决方案

**文件**: `src/lib/components/panels/folderPanel/components/FolderStack.svelte`

```typescript
import { penetrateMode } from '../stores/folderPanelStore.svelte';

// 在加载目录后检查穿透模式
async function loadDirectory(path: string) {
  // ... 现有加载逻辑 ...
  
  // 检查穿透模式
  if ($penetrateMode && items.length === 1 && items[0].isDir) {
    console.log('[FolderStack] 穿透模式：自动进入唯一的子文件夹');
    // 自动进入该子文件夹
    await loadDirectory(items[0].path);
  }
}
```

---

## 📋 实现检查清单

- [ ] 删除策略选择
  - [ ] 更新 Store
  - [ ] 更新 FolderPanel
  - [ ] 更新工具栏
  - [ ] 更新右键菜单
  - [ ] 测试删除功能

- [ ] 键盘快捷键
  - [ ] 实现方向键导航
  - [ ] 实现 Enter 打开
  - [ ] 实现 Home/End 跳转
  - [ ] 实现 Backspace 返回
  - [ ] 实现 F5 刷新
  - [ ] 实现 Delete 删除
  - [ ] 实现 Ctrl+A 全选
  - [ ] 实现 Ctrl+F 搜索

- [ ] 搜索高级功能
  - [ ] 添加搜索历史
  - [ ] 实现递归搜索
  - [ ] 实现路径搜索
  - [ ] 搜索历史显示

- [ ] 快速目标文件夹
  - [ ] 更新 Store
  - [ ] 实现添加快速目标
  - [ ] 实现快速复制/移动
  - [ ] 实现快速目标管理

- [ ] 路径栏编辑
  - [ ] 实现编辑模式
  - [ ] 实现路径导航
  - [ ] 实现文件打开

- [ ] 穿透模式
  - [ ] 实现自动进入逻辑
  - [ ] 测试穿透功能

