# 面板系统架构

## 概述

这是一个模块化的面板系统，支持像搭积木一样组合不同组件来创建面板视图。

## 核心概念

### 1. PanelMode (面板模式)

三种面板模式，各自有不同的行为：

| 模式 | 说明 | 删除行为 | 导航支持 |
|------|------|----------|----------|
| `folder` | 文件夹浏览 | 删除文件/文件夹 | 完整导航 |
| `history` | 历史记录 | 仅从历史移除 | 无导航 |
| `bookmark` | 书签 | 仅从书签移除 | 无导航 |

### 2. PanelStore (面板状态)

每个面板实例有独立的状态 store，包含：
- 视图设置 (viewStyle, sortConfig, thumbnailWidthPercent)
- 模式开关 (multiSelectMode, deleteMode, inlineTreeMode, penetrateMode)
- UI 显示 (showSearchBar, showMigrationBar)
- 选中项 (selectedItems)
- 数据 (currentPath, items)

### 3. PanelConfig (面板配置)

根据模式预定义的配置，控制：
- 功能开关 (enableNavigation, enableSearch, etc.)
- UI 定制 (dateSortLabel, deleteLabel, deleteConfirmTitle)

### 4. EventBus (事件总线)

面板之间的通信机制：
```typescript
// 发送事件
panelEventBus.emitItemOpened('bookmark', '/path/to/file');

// 监听事件
const unsub = panelEventBus.on('item-opened', (event) => {
    if (event.source !== 'history') {
        // 处理其他面板打开的项目
    }
});
```

## 使用方式

### 创建新面板

```svelte
<script>
import { createPanelStore, DEFAULT_CONFIGS, panelEventBus } from './core';
import PanelToolbar from './components/PanelToolbar.svelte';

// 1. 创建 store
const store = createPanelStore('history', 'virtual://history');
const config = DEFAULT_CONFIGS.history;

// 2. 定义面板特定的操作
async function handleDelete(paths: string[]) {
    // 历史模式：仅从历史移除
    for (const path of paths) {
        historyStore.remove(path);
    }
    // 通知其他面板
    panelEventBus.emitItemDeleted('history', paths);
}

// 3. 监听其他面板的事件
$effect(() => {
    const unsub = panelEventBus.on('item-opened', (event) => {
        if (event.source !== 'history') {
            loadHistory(); // 刷新显示
        }
    });
    return unsub;
});
</script>

<!-- 4. 组合 UI 组件 -->
<PanelToolbar {store} {config} onRefresh={handleRefresh} />
<!-- ... 其他组件 ... -->
```

## 组件清单

### 核心 (core/)
- `types.ts` - 类型定义
- `eventBus.svelte.ts` - 事件总线
- `createPanelStore.svelte.ts` - 状态工厂

### 组件 (components/)
- `PanelToolbar.svelte` - 通用工具栏

### 面板实现
- `HistoryPanel.svelte` - 历史面板示例

## 状态持久化

每个模式的视图设置会自动保存到 localStorage：
- `neoview-panel-folder`
- `neoview-panel-history`
- `neoview-panel-bookmark`

持久化的字段：
- viewStyle
- sortConfig
- thumbnailWidthPercent
- inlineTreeMode
- penetrateMode

## 事件类型

| 事件 | 说明 | 数据 |
|------|------|------|
| `item-opened` | 项目被打开 | `{ path }` |
| `item-deleted` | 项目被删除 | `{ paths }` |
| `path-changed` | 路径改变 | `{ path }` |
| `selection-changed` | 选择改变 | - |
| `bookmark-added` | 书签添加 | `{ path }` |
| `history-updated` | 历史更新 | `{ path }` |

## 迁移指南

将现有面板迁移到新系统：

1. 替换全局 store 引用为 `PanelStore` 实例
2. 使用 `PanelConfig` 控制功能开关
3. 实现模式特定的操作函数 (如 deleteItems)
4. 添加事件监听和发送
5. 组合通用 UI 组件
