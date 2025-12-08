# 面板系统重构设计文档 v2

> 最终版本 - 参考业界成熟设计模式

## 1. 设计模式与技术选型

### 1.1 使用 Svelte 原生功能（不造轮子）

| 功能 | 使用方案 | 说明 |
|------|----------|------|
| **状态管理** | Svelte 5 Runes (`$state`, `$derived`) | 组件内响应式状态 |
| **上下文传递** | `setContext` / `getContext` | 面板级状态共享 |
| **持久化** | `localStorage` + 自动同步 | 每个模式独立存储 |
| **事件通信** | `CustomEvent` + `window.dispatchEvent` | 简单可靠 |
| **类型安全** | TypeScript 接口 | 编译时检查 |

### 1.2 状态持久化策略

**每个模式独立存储，数据跟着模式走：**

```typescript
// localStorage keys
const STORAGE_KEYS = {
    folder: 'neoview-panel-folder',
    history: 'neoview-panel-history', 
    bookmark: 'neoview-panel-bookmark'
};

// 持久化的设置（切换面板后保留）
interface PersistedSettings {
    viewStyle: ViewStyle;
    sortField: SortField;
    sortOrder: SortOrder;
    thumbnailWidthPercent: number;
}

// 运行时状态（不持久化）
interface RuntimeState {
    multiSelectMode: boolean;
    deleteMode: boolean;
    showSearchBar: boolean;
    searchKeyword: string;
    selectedItems: Set<string>;
    items: FsItem[];
}
```

### 1.3 设计原则
- **不造轮子**：优先使用 Svelte 原生功能和现有库
- **状态隔离**：每个模式独立状态，互不影响
- **数据持久化**：设置跟着模式走，切换后保留
- **组合复用**：通过组合小组件构建面板

## 2. 需求确认

### 2.1 功能矩阵

| 功能 | 文件夹 | 历史 | 书签 |
|------|--------|------|------|
| 文件列表（FileCard） | ✓ | ✓ | ✓ |
| 视图样式切换 | ✓ | ✓ | ✓ |
| 排序（可定制标签） | ✓ | ✓ | ✓ |
| 多选/删除模式 | ✓ | ✓ | ✓ |
| 搜索（前端过滤） | ✓ | ✓ | ✓ |
| 缩略图（可见视图获取） | ✓ | ✓ | ✓ |
| **导航（前进/后退/上级）** | ✓ | ✗ | ✗ |
| **页签系统** | ✓ | ✗ | ✗ |
| **文件夹树** | ✓ | ✗ | ✗ |
| **迁移栏** | ✓ | ✗ | ✗ |
| **穿透模式** | ✓ | ✗ | ✗ |
| **同步到文件夹** | ✗ | ✓ | ✓ |
| **可作为页签打开** | - | ✓ | ✓ |

### 2.2 行为差异

| 操作 | 文件夹 | 历史 | 书签 |
|------|--------|------|------|
| 删除 | 删除/回收站 | 从历史移除 | 从书签移除 |
| 打开 | 导航/打开文件 | 打开+更新历史 | 打开+更新历史 |
| 排序标签 | "日期" | "打开时间" | "添加时间" |
| 空状态 | "文件夹为空" | "暂无历史" | "暂无书签" |

## 3. 架构设计

### 3.1 目录结构

```
src/lib/
├── stores/                         # Store 层（新增）
│   ├── historyPanelStore.svelte.ts  # 历史面板 Store（单例）
│   ├── bookmarkPanelStore.svelte.ts # 书签面板 Store（单例）
│   └── folderPanelStore.svelte.ts   # 文件夹面板 Store
│
├── panels/
│   ├── components/                  # 组件层（接收 store prop）
│   │   ├── Panel.svelte            # 纯布局容器（slot）
│   │   ├── Breadcrumb.svelte       # 面包屑（接收 mode）
│   │   ├── Toolbar.svelte          # 工具栏（接收 store）
│   │   ├── SearchBar.svelte        # 搜索栏（接收 store）
│   │   ├── SelectionBar.svelte     # 选择栏（接收 store）
│   │   └── FileList.svelte         # 文件列表（接收 store）
│   │
│   ├── panelEvents.ts              # 事件通信工具
│   └── index.ts                    # 导出
│
├── cards/                          # Card 层（入口）
│   ├── history/
│   │   └── HistoryListCard.svelte  # 导入 store，组合组件
│   ├── bookmark/
│   │   └── BookmarkListCard.svelte # 导入 store，组合组件
│   └── folder/
│       └── FolderListCard.svelte   # 导入 store，组合组件
```

### 3.2 核心层设计

#### 核心思想：Card 是入口，Panel 是纯 DOM 容器

```
┌─────────────────────────────────────────────────────────┐
│                   Store 层（单例）                       │
│  historyPanelStore | bookmarkPanelStore | folderStore   │
│  - 独立状态，自动持久化                                  │
└─────────────────────────────────────────────────────────┘
                            ↑ 组件自己获取
┌─────────────────────────────────────────────────────────┐
│                   组件层                                 │
│  Breadcrumb | Toolbar | FileList | SearchBar            │
│  - 接收 store 作为 prop                                  │
│  - 自己读写 store                                        │
└─────────────────────────────────────────────────────────┘
                            ↑ 传入 store
┌─────────────────────────────────────────────────────────┐
│                   Card 层（入口，决定 store）            │
│  HistoryListCard | BookmarkListCard | FolderListCard    │
│  - 导入对应的 store                                      │
│  - 传给组件                                              │
│  - onMount 加载数据                                      │
└─────────────────────────────────────────────────────────┘
                            ↑ 包含
┌─────────────────────────────────────────────────────────┐
│                   Panel 层（纯 DOM 容器）                │
│  - 只是一个 div                                          │
│  - 只负责 CSS 布局                                       │
│  - 没有任何逻辑，没有任何 import                          │
└─────────────────────────────────────────────────────────┘
```

#### 3.2.1 Store 定义 (stores/historyPanelStore.svelte.ts)

**每个模式一个单例 Store，组件直接导入使用：**

```typescript
// historyPanelStore.svelte.ts
import { SvelteSet } from 'svelte/reactivity';

const STORAGE_KEY = 'neoview-panel-history';

// 加载持久化设置
function load() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch { return {}; }
}

function save(data: object) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const saved = load();

// ========== 单例 Store ==========
class HistoryPanelStore {
    // 持久化设置
    viewStyle = $state<ViewStyle>(saved.viewStyle ?? 'list');
    sortField = $state<SortField>(saved.sortField ?? 'date');
    sortOrder = $state<SortOrder>(saved.sortOrder ?? 'desc');
    thumbnailWidth = $state(saved.thumbnailWidth ?? 20);
    
    // 运行时状态
    multiSelectMode = $state(false);
    deleteMode = $state(false);
    showSearchBar = $state(false);
    searchKeyword = $state('');
    selectedItems = $state(new SvelteSet<string>());
    items = $state<FsItem[]>([]);
    isLoading = $state(false);
    
    // 计算属性
    get filteredItems() {
        if (!this.searchKeyword) return this.items;
        const kw = this.searchKeyword.toLowerCase();
        return this.items.filter(i => i.name.toLowerCase().includes(kw));
    }
    
    get selectedCount() { return this.selectedItems.size; }
    get itemCount() { return this.items.length; }
    
    // 配置（静态）
    readonly config = {
        mode: 'history' as const,
        features: { navigation: false, syncToFolder: true },
        labels: { title: '历史记录', dateSortLabel: '打开时间', deleteLabel: '移除', emptyMessage: '暂无历史记录' }
    };
    
    // 方法
    setViewStyle(v: ViewStyle) { this.viewStyle = v; this.persist(); }
    setSort(field: SortField) {
        if (field === this.sortField) {
            this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
        }
        this.persist();
    }
    toggleMultiSelect() { this.multiSelectMode = !this.multiSelectMode; if (!this.multiSelectMode) this.selectedItems.clear(); }
    toggleDelete() { this.deleteMode = !this.deleteMode; }
    toggleSearch() { this.showSearchBar = !this.showSearchBar; }
    
    select(path: string) { this.selectedItems.add(path); }
    deselect(path: string) { this.selectedItems.delete(path); }
    toggleSelect(path: string) { this.selectedItems.has(path) ? this.selectedItems.delete(path) : this.selectedItems.add(path); }
    selectAll() { this.items.forEach(i => this.selectedItems.add(i.path)); }
    deselectAll() { this.selectedItems.clear(); }
    
    // 数据操作（调用 historyStore）
    async load() {
        this.isLoading = true;
        this.items = historyStore.getAll().map(h => ({ path: h.path, name: h.name, modified: h.timestamp, ... }));
        this.isLoading = false;
    }
    
    async deleteSelected() {
        for (const path of this.selectedItems) {
            historyStore.removeByPath(path);
        }
        this.selectedItems.clear();
        await this.load();
        emitPanelEvent('panel:history-changed');
    }
    
    async openItem(item: FsItem) {
        await bookStore.openBook(item.path);
        emitPanelEvent('panel:item-opened', { path: item.path, source: 'history' });
    }
    
    private persist() {
        save({ viewStyle: this.viewStyle, sortField: this.sortField, sortOrder: this.sortOrder, thumbnailWidth: this.thumbnailWidth });
    }
}

// 导出单例
export const historyPanelStore = new HistoryPanelStore();
```

#### 3.2.2 事件通信（原生 CustomEvent）

```typescript
// panelEvents.ts
export type PanelEventType = 
    | 'panel:item-opened' 
    | 'panel:item-deleted' 
    | 'panel:sync-folder' 
    | 'panel:history-changed'
    | 'panel:bookmark-changed';

export function emitPanelEvent(type: PanelEventType, detail?: any) {
    window.dispatchEvent(new CustomEvent(type, { detail }));
}

export function onPanelEvent(type: PanelEventType, handler: (detail: any) => void): () => void {
    const listener = (e: Event) => handler((e as CustomEvent).detail);
    window.addEventListener(type, listener);
    return () => window.removeEventListener(type, listener);
}
```

### 3.3 组件层设计

**组件直接导入 store，只需要知道用哪个 store：**

```svelte
<!-- Toolbar.svelte -->
<script lang="ts">
import type { HistoryPanelStore } from '../stores/historyPanelStore.svelte';
import type { BookmarkPanelStore } from '../stores/bookmarkPanelStore.svelte';

// 只需要传入 store 引用
interface Props {
    store: HistoryPanelStore | BookmarkPanelStore;
}

let { store }: Props = $props();

// 直接读写 store
</script>

<div class="toolbar">
    <!-- 排序按钮 -->
    <button onclick={() => store.setSort('date')}>
        {store.config.labels.dateSortLabel}
        {store.sortOrder === 'asc' ? '↑' : '↓'}
    </button>
    
    <!-- 视图切换 -->
    <button onclick={() => store.setViewStyle('list')}>列表</button>
    <button onclick={() => store.setViewStyle('thumbnail')}>缩略图</button>
    
    <!-- 多选模式 -->
    <button 
        class:active={store.multiSelectMode}
        onclick={() => store.toggleMultiSelect()}
    >
        多选 ({store.selectedCount})
    </button>
    
    <!-- 删除模式 -->
    <button 
        class:active={store.deleteMode}
        onclick={() => store.toggleDelete()}
    >
        {store.config.labels.deleteLabel}
    </button>
</div>
```

```svelte
<!-- FileList.svelte -->
<script lang="ts">
import VirtualizedFileList from '$lib/components/.../VirtualizedFileListV2.svelte';

interface Props {
    store: HistoryPanelStore | BookmarkPanelStore;
}

let { store }: Props = $props();
</script>

{#if store.filteredItems.length === 0}
    <div class="empty">{store.config.labels.emptyMessage}</div>
{:else}
    <VirtualizedFileList
        items={store.filteredItems}
        viewMode={store.viewStyle}
        isCheckMode={store.multiSelectMode}
        isDeleteMode={store.deleteMode}
        selectedItems={store.selectedItems}
        onItemSelect={({ item }) => store.toggleSelect(item.path)}
        onItemDoubleClick={({ item }) => store.openItem(item)}
    />
{/if}
```

### 3.4 Panel 层设计（纯 DOM 容器）

**Panel 没有任何逻辑，只是 CSS 布局容器：**

```svelte
<!-- Panel.svelte -->
<!-- 没有 script，没有逻辑，只是布局 -->
<div class="panel flex h-full flex-col overflow-hidden">
    <slot />
</div>

<style>
.panel { /* 布局样式 */ }
</style>
```

### 3.5 Card 层设计（入口，控制一切）

**Card 是真正的入口，负责：导入 store、传给组件、加载数据**

```svelte
<!-- HistoryListCard.svelte -->
<script lang="ts">
import { onMount } from 'svelte';
import { historyPanelStore } from '$lib/stores/historyPanelStore.svelte';
import Panel from '$lib/panels/components/Panel.svelte';
import Breadcrumb from '$lib/panels/components/Breadcrumb.svelte';
import Toolbar from '$lib/panels/components/Toolbar.svelte';
import SearchBar from '$lib/panels/components/SearchBar.svelte';
import SelectionBar from '$lib/panels/components/SelectionBar.svelte';
import FileList from '$lib/panels/components/FileList.svelte';

const store = historyPanelStore;

onMount(() => store.load());
</script>

<Panel>
    <Breadcrumb mode="history" />
    <Toolbar {store} />
    
    {#if store.showSearchBar}
        <SearchBar {store} />
    {/if}
    
    {#if store.selectedCount > 0}
        <SelectionBar {store} />
    {/if}
    
    <FileList {store} />
</Panel>
```

```svelte
<!-- BookmarkListCard.svelte -->
<script lang="ts">
import { onMount } from 'svelte';
import { bookmarkPanelStore } from '$lib/stores/bookmarkPanelStore.svelte';
import Panel from '$lib/panels/components/Panel.svelte';
// ... 同样的组件导入

const store = bookmarkPanelStore;
onMount(() => store.load());
</script>

<Panel>
    <Breadcrumb mode="bookmark" />
    <Toolbar {store} />
    {#if store.showSearchBar}<SearchBar {store} />{/if}
    {#if store.selectedCount > 0}<SelectionBar {store} />{/if}
    <FileList {store} />
</Panel>
```

## 4. 页签集成

历史/书签可以作为文件夹页签系统的一个页签打开：

```typescript
// 页签类型扩展
interface Tab {
    id: string;
    type: 'folder' | 'history' | 'bookmark';
    title: string;
    // folder 专有
    path?: string;
    homePath?: string;
}

// 页签容器根据 type 渲染不同面板
{#if tab.type === 'folder'}
    <FolderPanel tabId={tab.id} path={tab.path} />
{:else if tab.type === 'history'}
    <HistoryPanel />
{:else if tab.type === 'bookmark'}
    <BookmarkPanel />
{/if}
```

## 5. 实施计划

### 阶段 1：Store 层
- [ ] `stores/historyPanelStore.svelte.ts` - 历史面板 Store（单例，自动持久化）
- [ ] `stores/bookmarkPanelStore.svelte.ts` - 书签面板 Store（单例，自动持久化）
- [ ] `panels/panelEvents.ts` - 事件通信工具（CustomEvent）

### 阶段 2：组件层
- [ ] `panels/components/Panel.svelte` - 纯布局容器（slot）
- [ ] `panels/components/Breadcrumb.svelte` - 面包屑（接收 mode）
- [ ] `panels/components/Toolbar.svelte` - 工具栏（接收 store）
- [ ] `panels/components/SearchBar.svelte` - 复用现有或新建
- [ ] `panels/components/SelectionBar.svelte` - 复用现有或新建
- [ ] `panels/components/FileList.svelte` - 包装 VirtualizedFileList

### 阶段 3：Card 层（入口）
- [ ] 更新 `cards/history/HistoryListCard.svelte` - 导入 store，组合组件
- [ ] 更新 `cards/bookmark/BookmarkListCard.svelte` - 导入 store，组合组件

### 阶段 4：文件夹 + 页签
- [ ] `stores/folderPanelStore.svelte.ts` - 文件夹 Store
- [ ] 更新 `cards/folder/FolderListCard.svelte`
- [ ] 页签系统支持 history/bookmark 类型

### 阶段 5：测试 & 清理
- [ ] 状态隔离：切换面板后设置保留
- [ ] 持久化：刷新后设置恢复
- [ ] 事件通信：面板间同步
- [ ] 删除旧代码

## 6. 风险控制

1. **渐进式迁移**：先完成历史/书签，再迁移文件夹
2. **保留旧代码**：迁移完成前不删除
3. **功能对照**：每个功能点对照验证
4. **回滚方案**：Git 分支管理

---

**确认后开始实施。**
