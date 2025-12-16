# Design Document: Folder Back Stack Fix

## Overview

本设计文档描述了修复文件夹面板在同标签页后退时丢失层叠栈（stack）问题的解决方案。

### 问题分析

当前实现中，`handleGoBack` 函数的逻辑如下：
1. 调用 `folderTabActions.goBack()` 获取目标路径
2. 如果成功，发送 `navigationCommand` 类型为 `'history'`
3. `FolderStack` 处理 `'history'` 命令时，如果目标路径不在现有 `layers` 中，调用 `initRootWithoutHistory` 重建整个 stack

问题在于：`initRootWithoutHistory` 会执行 `layers = [layer]`，这会清空所有现有层，导致用户无法在之前浏览过的层级中继续导航。

### 解决方案

修改 `FolderStack` 中处理 `'history'` 命令的逻辑，使其能够智能地保留或重建层叠栈：

1. **优先在现有 layers 中查找**：如果目标路径在 layers 中，直接切换
2. **检查父子关系**：如果目标路径是某个现有层的父目录，截断到该层
3. **智能重建**：如果需要重建，尝试保留与目标路径相关的层

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FolderTabStore                          │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  historyStack   │  │  tabNavHistory  │                   │
│  │  historyIndex   │  │  tabNavHistoryIndex                 │
│  └────────┬────────┘  └────────┬────────┘                   │
│           │                    │                             │
│           ▼                    ▼                             │
│  ┌─────────────────────────────────────────┐                │
│  │           goBack() / goBackTab()         │                │
│  │  - 判断是同标签页后退还是跨标签页后退      │                │
│  │  - 返回目标路径或目标标签页ID             │                │
│  └─────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      FolderStack                             │
│  ┌─────────────────────────────────────────┐                │
│  │              layers[]                    │                │
│  │  - 每层包含 path, items, selectedIndex   │                │
│  │  - activeIndex 指向当前活动层            │                │
│  └─────────────────────────────────────────┘                │
│                              │                               │
│                              ▼                               │
│  ┌─────────────────────────────────────────┐                │
│  │     handleHistoryNavigation(path)        │                │
│  │  1. 在 layers 中查找目标路径             │                │
│  │  2. 检查父子关系，决定截断或重建         │                │
│  │  3. 更新 activeIndex 和 UI              │                │
│  └─────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. FolderStack 组件修改

#### 新增函数：`handleHistoryNavigation`

```typescript
/**
 * 处理历史导航命令
 * @param targetPath 目标路径
 * @returns 是否成功处理
 */
async function handleHistoryNavigation(targetPath: string): Promise<boolean> {
  // 1. 在现有 layers 中查找目标路径
  const targetIndex = layers.findIndex(l => normalizePath(l.path) === normalizePath(targetPath));
  
  if (targetIndex !== -1) {
    // 找到了，直接切换到该层
    switchToLayer(targetIndex);
    return true;
  }
  
  // 2. 检查目标路径是否是某个现有层的父目录
  const parentLayerIndex = findParentLayerIndex(targetPath);
  if (parentLayerIndex !== -1) {
    // 截断到父层，然后切换
    layers = layers.slice(0, parentLayerIndex + 1);
    // 重新加载目标路径作为新的根层
    await initRootWithoutHistory(targetPath);
    return true;
  }
  
  // 3. 目标路径与现有层无关，需要完全重建
  await initRootWithoutHistory(targetPath);
  return true;
}
```

#### 修改：`navigationCommand` 处理逻辑

```typescript
case 'history':
  if (cmd.path) {
    await handleHistoryNavigation(cmd.path);
  }
  break;
```

### 2. 辅助函数

```typescript
/**
 * 规范化路径（统一分隔符和大小写）
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

/**
 * 查找目标路径的父层索引
 * @param targetPath 目标路径
 * @returns 父层索引，如果没找到返回 -1
 */
function findParentLayerIndex(targetPath: string): number {
  const normalizedTarget = normalizePath(targetPath);
  
  for (let i = layers.length - 1; i >= 0; i--) {
    const layerPath = normalizePath(layers[i].path);
    if (normalizedTarget.startsWith(layerPath + '/')) {
      return i;
    }
  }
  
  return -1;
}

/**
 * 切换到指定层
 */
function switchToLayer(index: number): void {
  if (index < 0 || index >= layers.length) return;
  
  isAnimating = true;
  activeIndex = index;
  const layer = layers[index];
  globalStore.setPath(layer.path, false);
  globalStore.setItems(layer.items);
  
  setTimeout(() => {
    isAnimating = false;
  }, 300);
}
```

## Data Models

### FolderLayer（现有，无需修改）

```typescript
interface FolderLayer {
  id: string;
  path: string;
  items: FsItem[];
  loading: boolean;
  error: string | null;
  selectedIndex: number;
  scrollTop: number;
}
```

### NavigationCommand（现有，无需修改）

```typescript
interface NavigationCommand {
  type: 'init' | 'push' | 'pop' | 'goto' | 'history';
  path?: string;
  index?: number;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Layer Lookup Preserves Stack

*For any* FolderStack 状态和目标路径，如果目标路径存在于现有 layers 中，执行历史导航后 layers 数组的长度应该保持不变，且 activeIndex 应该指向目标路径所在的层。

**Validates: Requirements 1.1, 3.1**

### Property 2: History Index Consistency

*For any* 初始 historyStack 和连续的后退操作序列，每次后退后 historyIndex 应该减少 1，且 historyIndex 始终 >= 0。

**Validates: Requirements 1.3**

### Property 3: Back-Forward Round Trip

*For any* 有效的导航状态，执行后退操作后再执行前进操作，应该恢复到原来的路径。

**Validates: Requirements 1.4**

### Property 4: Same-Tab Back Condition

*For any* 标签页状态，当 historyIndex > 0 时执行后退操作，activeTabId 应该保持不变。

**Validates: Requirements 2.1, 2.4**

### Property 5: Cross-Tab Back Condition

*For any* 标签页状态，当 historyIndex <= 0 且 tabNavHistoryIndex > 0 时执行后退操作，activeTabId 应该变为 tabNavHistory[tabNavHistoryIndex - 1]。

**Validates: Requirements 2.2, 2.3**

## Error Handling

1. **路径不存在**：如果目标路径在文件系统中不存在，显示错误提示并保持当前状态
2. **加载失败**：如果目录加载失败，在对应层显示错误信息，不影响其他层
3. **动画冲突**：如果在动画进行中收到新的导航命令，忽略该命令

## Testing Strategy

### 单元测试

1. 测试 `normalizePath` 函数的路径规范化
2. 测试 `findParentLayerIndex` 函数的父层查找逻辑
3. 测试 `handleHistoryNavigation` 的各种场景

### 属性测试

使用 fast-check 库进行属性测试：

1. **Layer Lookup Property**: 生成随机的 layers 数组和目标路径，验证查找逻辑
2. **History Index Property**: 生成随机的 historyStack 和后退次数，验证索引变化
3. **Round Trip Property**: 生成随机的导航序列，验证后退-前进的往返一致性
4. **Tab Navigation Property**: 生成随机的标签页状态，验证后退操作的类型判断

### 集成测试

1. 测试完整的后退-前进导航流程
2. 测试跨标签页和同标签页后退的切换
3. 测试边界情况（空历史、单层 stack 等）
