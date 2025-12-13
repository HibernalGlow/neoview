# Design Document: Svelte 5 Store Migration

## Overview

本设计文档描述了将 NeoView 项目中的状态管理从 Svelte 4 的 `writable` store 迁移到 Svelte 5 Runes 的技术方案，以及创建通用的异步操作 store 工具函数。

### 目标

1. 统一代码风格，全面采用 Svelte 5 Runes (`$state`, `$derived`, `$effect`)
2. 创建可复用的持久化状态工具函数
3. 创建通用的异步操作状态管理模式
4. 保持向后兼容，确保现有组件无需修改

### 设计原则

- **渐进式迁移**: 保持 API 兼容性，允许逐步迁移
- **类型安全**: 充分利用 TypeScript 类型推断
- **最小侵入**: 不改变现有组件的使用方式
- **性能优先**: 利用 Svelte 5 的细粒度响应式系统

## Architecture

```
src/lib/stores/
├── utils/
│   ├── createPersistedState.svelte.ts   # 持久化状态工具
│   ├── createAsyncStore.svelte.ts       # 异步操作 store 工具
│   └── storeCompat.ts                   # 兼容层（可选）
├── ui.svelte.ts                         # 迁移后的 UI store
└── ...                                  # 其他 stores
```

## Components and Interfaces

### 1. createPersistedState 工具函数

```typescript
/**
 * 创建持久化状态的配置选项
 */
interface PersistedStateOptions<T> {
  /** localStorage 键名（不含前缀） */
  key: string;
  /** 默认值 */
  defaultValue: T;
  /** 键名前缀，默认 'neoview-ui-' */
  prefix?: string;
  /** 自定义序列化函数 */
  serialize?: (value: T) => string;
  /** 自定义反序列化函数 */
  deserialize?: (raw: string) => T;
  /** 值变化时的回调 */
  onChange?: (value: T) => void;
}

/**
 * 持久化状态返回类型
 * 兼容 Svelte 4 writable store API
 */
interface PersistedState<T> {
  /** 当前值（响应式） */
  readonly value: T;
  /** 设置新值 */
  set(value: T): void;
  /** 基于当前值更新 */
  update(updater: (current: T) => T): void;
  /** 订阅变化（兼容 Svelte 4） */
  subscribe(callback: (value: T) => void): () => void;
}

/**
 * 创建持久化状态
 */
function createPersistedState<T>(options: PersistedStateOptions<T>): PersistedState<T>;
```

### 2. createAsyncStore 工具函数

```typescript
/**
 * 异步操作状态
 */
interface AsyncState<T, E = Error> {
  /** 数据 */
  data: T | null;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: E | null;
  /** 是否已执行过 */
  isExecuted: boolean;
  /** 是否成功 */
  isSuccess: boolean;
  /** 是否失败 */
  isError: boolean;
}

/**
 * 异步 store 配置选项
 */
interface AsyncStoreOptions<T, Args extends unknown[]> {
  /** 异步操作函数 */
  fetcher: (...args: Args) => Promise<T>;
  /** 初始数据 */
  initialData?: T | null;
  /** 是否自动取消之前的请求 */
  cancelPrevious?: boolean;
  /** 是否启用去重 */
  dedupe?: boolean;
  /** 去重时间窗口（毫秒） */
  dedupeInterval?: number;
  /** 成功回调 */
  onSuccess?: (data: T) => void;
  /** 失败回调 */
  onError?: (error: Error) => void;
}

/**
 * 异步 store 返回类型
 */
interface AsyncStore<T, Args extends unknown[]> {
  /** 当前状态（响应式） */
  readonly state: AsyncState<T>;
  /** 执行异步操作 */
  execute(...args: Args): Promise<T>;
  /** 重置状态 */
  reset(): void;
  /** 重试上次操作 */
  retry(): Promise<T | null>;
  /** 取消当前操作 */
  cancel(): void;
  /** 手动设置数据 */
  setData(data: T | null): void;
  /** 手动设置错误 */
  setError(error: Error | null): void;
}

/**
 * 创建异步 store
 */
function createAsyncStore<T, Args extends unknown[] = []>(
  options: AsyncStoreOptions<T, Args>
): AsyncStore<T, Args>;
```

### 3. UI Store 迁移后的结构

```typescript
/**
 * UI Store 状态类型
 */
interface UIState {
  // 侧边栏
  leftSidebarOpen: boolean;
  leftSidebarWidth: number;
  rightSidebarOpen: boolean;
  rightSidebarWidth: number;
  activeRightPanel: RightPanelType;
  
  // 全屏
  isFullscreen: boolean;
  
  // 加载
  isLoading: boolean;
  
  // 面板
  activeUIPanel: PanelType;
  
  // 主题
  themeMode: ThemeMode;
  
  // 缩放和旋转
  zoomLevel: number;
  rotationAngle: number;
  
  // 视图模式
  viewMode: ViewMode;
  lockedViewMode: ViewMode | null;
  lockedZoomMode: ZoomMode | null;
  lockedReadingDirection: ReadingDirection | null;
  orientation: ViewOrientation;
  
  // 边栏状态
  topToolbarPinned: boolean;
  bottomThumbnailBarPinned: boolean;
  leftSidebarPinned: boolean;
  rightSidebarPinned: boolean;
  topToolbarLockState: SidebarLockState;
  bottomBarLockState: SidebarLockState;
  leftSidebarLockState: SidebarLockState;
  rightSidebarLockState: SidebarLockState;
  topToolbarOpen: boolean;
  bottomBarOpen: boolean;
  topToolbarHeight: number;
  bottomThumbnailBarHeight: number;
  
  // 布局
  layoutMode: LayoutMode;
  layoutSwitchMode: LayoutSwitchMode;
  viewerPageInfoVisible: boolean;
  
  // 分页
  subPageIndex: number;
  currentPageShouldSplit: boolean;
}

/**
 * UI Store 类
 */
class UIStore {
  // 使用 createPersistedState 创建持久化状态
  private _leftSidebarOpen = createPersistedState({ key: 'leftSidebarOpen', defaultValue: false });
  // ... 其他状态
  
  // Getters（响应式）
  get leftSidebarOpen(): boolean;
  
  // Actions
  toggleLeftSidebar(): void;
  // ... 其他方法
}

export const uiStore: UIStore;

// 兼容性导出（保持现有 API）
export const leftSidebarOpen: PersistedState<boolean>;
export function toggleLeftSidebar(): void;
// ... 其他导出
```

## Data Models

### 状态持久化键映射

| 状态名 | localStorage 键 | 默认值 |
|--------|-----------------|--------|
| leftSidebarOpen | neoview-ui-leftSidebarOpen | false |
| leftSidebarWidth | neoview-ui-leftSidebarWidth | 250 |
| rightSidebarOpen | neoview-ui-rightSidebarOpen | false |
| rightSidebarWidth | neoview-ui-rightSidebarWidth | 250 |
| activeRightPanel | neoview-ui-activeRightPanel | null |
| isFullscreen | neoview-ui-isFullscreen | false |
| activeUIPanel | neoview-ui-activeUIPanel | 'folder' |
| themeMode | neoview-ui-themeMode | 'system' |
| zoomLevel | neoview-ui-zoomLevel | 1.0 |
| rotationAngle | neoview-ui-rotationAngle | 0 |
| viewMode | neoview-ui-viewMode | 'single' |
| lockedViewMode | neoview-ui-lockedViewMode | null |
| lockedZoomMode | neoview-ui-lockedZoomMode | null |
| lockedReadingDirection | neoview-ui-lockedReadingDirection | null |
| orientation | neoview-ui-orientation | 'horizontal' |
| layoutMode | neoview-ui-layoutMode | 'classic' |
| layoutSwitchMode | neoview-ui-layoutSwitchMode | 'cold' |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Persisted state round-trip consistency
*For any* persisted state with key K and value V, setting the value to V and then reading from localStorage should return a value equal to V after JSON parsing.
**Validates: Requirements 1.2, 2.3**

### Property 2: Persisted state initialization from storage
*For any* localStorage entry with key K and valid JSON value V, creating a persisted state with key K should initialize with value V (not the default value).
**Validates: Requirements 1.3, 2.2**

### Property 3: Async store loading state transition
*For any* async store and async operation, when execute() is called, isLoading should immediately become true and error should become null.
**Validates: Requirements 3.2**

### Property 4: Async store success state transition
*For any* async store and successful async operation returning data D, after completion, data should equal D, isLoading should be false, and isSuccess should be true.
**Validates: Requirements 3.3**

### Property 5: Async store error state transition
*For any* async store and failing async operation with error E, after completion, error should contain E's message, isLoading should be false, and isError should be true.
**Validates: Requirements 3.4**

### Property 6: Async store cancellation prevents state update
*For any* async store with cancelPrevious enabled, when a new operation starts while one is pending, the cancelled operation's result should not update the store state.
**Validates: Requirements 5.1, 5.3**

### Property 7: Store API compatibility - set and update methods
*For any* persisted state, calling set(V) should update the value to V, and calling update(fn) should update the value to fn(currentValue).
**Validates: Requirements 4.2**

## Error Handling

### localStorage 错误处理

1. **读取失败**: 返回默认值，记录警告日志
2. **写入失败**: 记录错误日志，不影响内存状态
3. **JSON 解析失败**: 返回默认值，记录警告日志

### 异步操作错误处理

1. **网络错误**: 设置 error 状态，触发 onError 回调
2. **取消操作**: 不更新状态，不触发回调
3. **超时**: 可配置超时时间，超时后自动取消

## Testing Strategy

### 双重测试方法

本项目采用单元测试和属性测试相结合的方式：

- **单元测试**: 验证具体示例和边界情况
- **属性测试**: 验证跨所有输入的通用属性

### 属性测试库

使用 **fast-check** 作为属性测试库，配置每个测试运行至少 100 次迭代。

### 测试文件结构

```
src/lib/stores/utils/
├── createPersistedState.svelte.ts
├── createPersistedState.test.ts        # 单元测试
├── createPersistedState.property.test.ts # 属性测试
├── createAsyncStore.svelte.ts
├── createAsyncStore.test.ts            # 单元测试
└── createAsyncStore.property.test.ts   # 属性测试
```

### 单元测试覆盖

1. **createPersistedState**
   - 基本创建和初始化
   - localStorage 读写
   - 错误处理（localStorage 不可用）
   - 自定义序列化/反序列化

2. **createAsyncStore**
   - 基本执行流程
   - 成功/失败状态转换
   - 取消操作
   - 去重功能
   - retry 功能

### 属性测试标注格式

每个属性测试必须使用以下格式标注：
```typescript
/**
 * **Feature: svelte5-store-migration, Property 1: Persisted state round-trip consistency**
 */
```
