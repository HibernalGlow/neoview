# 面板系统重构设计文档 v2

> 最终版本 - 参考业界成熟设计模式

## 1. 设计模式选型

### 1.1 采用的设计模式

| 模式 | 用途 | 参考 |
|------|------|------|
| **Context Provider** | 为面板提供独立状态上下文 | React Context, Svelte Context |
| **Strategy Pattern** | 不同模式的删除/打开行为 | GoF 策略模式 |
| **Observer Pattern** | 面板间事件通信 | RxJS, EventEmitter |
| **Composition** | 组合小组件构建面板 | React Hooks 思想 |
| **Factory Pattern** | 创建面板配置和状态 | 工厂方法 |

### 1.2 核心设计原则
- **单一职责**：每个组件只做一件事
- **开闭原则**：对扩展开放，对修改关闭
- **依赖倒置**：依赖抽象（接口），不依赖具体实现
- **组合优于继承**：通过组合而非继承复用代码

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
src/lib/panels/
├── core/                       # 核心层
│   ├── types.ts               # 类型定义
│   ├── PanelContext.svelte.ts # Context Provider
│   ├── eventBus.ts            # 事件总线（单例）
│   ├── strategies/            # 策略模式
│   │   ├── FolderStrategy.ts
│   │   ├── HistoryStrategy.ts
│   │   └── BookmarkStrategy.ts
│   └── index.ts
│
├── components/                 # 组件层（无状态/受控）
│   ├── Breadcrumb.svelte      # 面包屑
│   ├── Toolbar.svelte         # 工具栏
│   ├── SearchBar.svelte       # 搜索栏
│   ├── SelectionBar.svelte    # 选择栏
│   └── FileList.svelte        # 文件列表（包装 VirtualizedFileList）
│
├── panels/                     # 面板层
│   ├── FolderPanel.svelte     # 文件夹面板
│   ├── HistoryPanel.svelte    # 历史面板
│   └── BookmarkPanel.svelte   # 书签面板
│
└── index.ts                    # 导出
```

### 3.2 核心层设计

#### 3.2.1 类型定义 (types.ts)
```typescript
// 面板模式
export type PanelMode = 'folder' | 'history' | 'bookmark';

// 视图样式
export type ViewStyle = 'list' | 'content' | 'banner' | 'thumbnail';

// 排序
export type SortField = 'name' | 'date' | 'size' | 'type' | 'random' | 'rating';
export type SortOrder = 'asc' | 'desc';

// 面板状态（每个实例独立）
export interface PanelState {
    // 持久化设置
    viewStyle: ViewStyle;
    sortField: SortField;
    sortOrder: SortOrder;
    thumbnailWidthPercent: number;
    
    // 运行时状态
    multiSelectMode: boolean;
    deleteMode: boolean;
    showSearchBar: boolean;
    searchKeyword: string;
    selectedItems: Set<string>;
    
    // 数据
    items: FsItem[];
    filteredItems: FsItem[];  // 搜索过滤后
    isLoading: boolean;
}

// 面板配置（每种模式一个）
export interface PanelConfig {
    mode: PanelMode;
    
    // 功能开关
    features: {
        navigation: boolean;
        tabs: boolean;
        folderTree: boolean;
        migration: boolean;
        penetrate: boolean;
        syncToFolder: boolean;
        inlineTree: boolean;
    };
    
    // UI 文本
    labels: {
        title: string;
        dateSortLabel: string;
        deleteLabel: string;
        emptyMessage: string;
    };
}

// 面板策略（行为抽象）
export interface PanelStrategy {
    loadItems(): Promise<FsItem[]>;
    deleteItems(paths: string[]): Promise<void>;
    openItem(item: FsItem): Promise<void>;
    onItemOpened?(item: FsItem): void;
}
```

#### 3.2.2 Context Provider (PanelContext.svelte.ts)
```typescript
import { setContext, getContext } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';

const PANEL_CONTEXT_KEY = Symbol('panel');

export class PanelContext {
    // 配置
    readonly mode: PanelMode;
    readonly config: PanelConfig;
    readonly strategy: PanelStrategy;
    
    // 响应式状态
    state = $state<PanelState>({...});
    
    // 计算属性
    get filteredItems() {
        if (!this.state.searchKeyword) return this.state.items;
        const kw = this.state.searchKeyword.toLowerCase();
        return this.state.items.filter(i => i.name.toLowerCase().includes(kw));
    }
    
    // 方法
    setViewStyle(style: ViewStyle) { ... }
    setSort(field: SortField) { ... }
    toggleMultiSelect() { ... }
    toggleDelete() { ... }
    selectItem(path: string) { ... }
    selectAll() { ... }
    deselectAll() { ... }
    async refresh() { ... }
    async deleteSelected() { ... }
}

// Provider
export function providePanelContext(mode: PanelMode, strategy: PanelStrategy) {
    const ctx = new PanelContext(mode, strategy);
    setContext(PANEL_CONTEXT_KEY, ctx);
    return ctx;
}

// Consumer
export function usePanelContext(): PanelContext {
    return getContext(PANEL_CONTEXT_KEY);
}
```

#### 3.2.3 策略实现
```typescript
// HistoryStrategy.ts
export class HistoryStrategy implements PanelStrategy {
    async loadItems(): Promise<FsItem[]> {
        return historyStore.getAll().map(h => ({
            path: h.path,
            name: h.name,
            modified: h.timestamp,
            ...
        }));
    }
    
    async deleteItems(paths: string[]): Promise<void> {
        for (const p of paths) {
            historyStore.removeByPath(p);
        }
        panelEventBus.emit('history-changed');
    }
    
    async openItem(item: FsItem): Promise<void> {
        await bookStore.openBook(item.path);
        historyStore.add(item.path, item.name);
        panelEventBus.emit('item-opened', { path: item.path, source: 'history' });
    }
}
```

#### 3.2.4 事件总线 (eventBus.ts)
```typescript
type EventType = 
    | 'item-opened'
    | 'item-deleted'
    | 'bookmark-changed'
    | 'history-changed'
    | 'sync-folder';

class PanelEventBus {
    private listeners = new Map<EventType, Set<Function>>();
    
    on(type: EventType, handler: Function): () => void { ... }
    emit(type: EventType, data?: any): void { ... }
}

export const panelEventBus = new PanelEventBus();
```

### 3.3 组件层设计

所有组件都是**受控组件**，通过 props 接收状态，通过回调报告变化：

```svelte
<!-- Toolbar.svelte -->
<script lang="ts">
interface Props {
    // 状态 (from context)
    viewStyle: ViewStyle;
    sortField: SortField;
    sortOrder: SortOrder;
    multiSelectMode: boolean;
    deleteMode: boolean;
    showSearchBar: boolean;
    itemCount: number;
    selectedCount: number;
    canGoBack?: boolean;
    canGoForward?: boolean;
    
    // 配置
    config: PanelConfig;
    
    // 回调
    onViewStyleChange: (style: ViewStyle) => void;
    onSortChange: (field: SortField) => void;
    onToggleMultiSelect: () => void;
    onToggleDelete: () => void;
    onToggleSearch: () => void;
    onRefresh: () => void;
    onGoBack?: () => void;
    onGoForward?: () => void;
    onGoUp?: () => void;
    onGoHome?: () => void;
}
</script>
```

### 3.4 面板层设计

面板组件负责：
1. 创建 Context
2. 注入 Strategy
3. 组合 UI 组件
4. 处理事件

```svelte
<!-- HistoryPanel.svelte -->
<script lang="ts">
import { providePanelContext } from '../core/PanelContext.svelte';
import { HistoryStrategy } from '../core/strategies/HistoryStrategy';
import { HISTORY_CONFIG } from '../core/configs';
import Breadcrumb from '../components/Breadcrumb.svelte';
import Toolbar from '../components/Toolbar.svelte';
import FileList from '../components/FileList.svelte';

// 创建上下文
const strategy = new HistoryStrategy();
const ctx = providePanelContext('history', strategy);

// 加载数据
onMount(() => ctx.refresh());
</script>

<div class="panel">
    <Breadcrumb mode="history" />
    
    <Toolbar
        viewStyle={ctx.state.viewStyle}
        sortField={ctx.state.sortField}
        {...}
        config={ctx.config}
        onViewStyleChange={ctx.setViewStyle}
        onSortChange={ctx.setSort}
        {...}
    />
    
    {#if ctx.state.showSearchBar}
        <SearchBar ... />
    {/if}
    
    {#if ctx.state.selectedItems.size > 0}
        <SelectionBar ... />
    {/if}
    
    <FileList
        items={ctx.filteredItems}
        viewStyle={ctx.state.viewStyle}
        ...
    />
</div>
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

### 阶段 1：核心层 (Day 1)
- [ ] 重写 `types.ts`
- [ ] 实现 `PanelContext.svelte.ts`
- [ ] 实现 `eventBus.ts`
- [ ] 实现三个 Strategy

### 阶段 2：组件层 (Day 1-2)
- [ ] `Breadcrumb.svelte` - 简洁版面包屑
- [ ] `Toolbar.svelte` - 模块化工具栏
- [ ] `SearchBar.svelte` - 复用现有
- [ ] `SelectionBar.svelte` - 复用现有
- [ ] `FileList.svelte` - 包装 VirtualizedFileList

### 阶段 3：面板层 (Day 2)
- [ ] `HistoryPanel.svelte`
- [ ] `BookmarkPanel.svelte`
- [ ] 更新 Card 使用新面板

### 阶段 4：文件夹面板 (Day 2-3)
- [ ] `FolderPanel.svelte`
- [ ] 页签系统集成
- [ ] 迁移原有功能

### 阶段 5：测试 & 清理 (Day 3)
- [ ] 功能测试
- [ ] 删除旧代码
- [ ] 文档更新

## 6. 风险控制

1. **渐进式迁移**：先完成历史/书签，再迁移文件夹
2. **保留旧代码**：迁移完成前不删除
3. **功能对照**：每个功能点对照验证
4. **回滚方案**：Git 分支管理

---

**确认后开始实施。**
