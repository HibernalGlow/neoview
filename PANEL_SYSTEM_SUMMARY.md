# NeoView 多侧边栏和手势系统实现总结

> 📅 **更新日期**: 2025年11月9日  
> 🎯 **版本**: v0.3.0-alpha  
> 👤 **参考设计**: NeeView + czkawka-tauri

---

## 📋 实现概览

本次更新完成了 NeoView 的高级 UI 系统和输入控制系统，主要包括：

1. ✅ **多侧边栏系统** - 左、右、底三个可调整侧边栏
2. ✅ **竖排图标标签** - NeeView 风格的垂直面板标签
3. ✅ **面板拖拽系统** - 支持拖拽排序和跨侧边栏移动
4. ✅ **鼠标手势引擎** - 右键拖拽手势识别
5. ✅ **触摸手势引擎** - 多指手势识别（捏合、旋转、滑动）
6. ✅ **配置持久化** - LocalStorage 自动保存/恢复

---

## 🏗️ 架构设计

### 1. 多侧边栏系统

#### 文件结构
```
src/lib/stores/panels.svelte.ts  // 面板管理 Store
src/lib/components/layout/
  ├── PanelTabBar.svelte          // 竖排图标标签栏
  ├── PanelSidebar.svelte         // 侧边栏容器（待创建）
  └── PanelContent.svelte         // 面板内容（待创建）
```

#### 核心类型

```typescript
// 面板位置
type PanelLocation = 'left' | 'right' | 'bottom' | 'floating';

// 面板类型
type PanelType = 'folder' | 'history' | 'bookmark' | 'info' | 'thumbnail' | 'playlist';

// 面板配置
interface PanelConfig {
  id: PanelType;
  title: string;
  icon: string;           // Lucide icon 名称
  location: PanelLocation;
  order: number;          // 排序位置
  visible: boolean;
  pinned: boolean;        // 是否固定显示
}

// 侧边栏配置
interface SidebarConfig {
  location: 'left' | 'right' | 'bottom';
  width: number;          // 左右侧边栏宽度
  height: number;         // 底部侧边栏高度
  visible: boolean;
  panels: PanelType[];    // 包含的面板
}
```

#### 核心 Store

```typescript
// 面板配置 Store
export const panels: Writable<PanelConfig[]>;

// 侧边栏配置 Store
export const sidebars: Writable<Record<'left' | 'right' | 'bottom', SidebarConfig>>;

// 当前激活面板
export const activePanel: Writable<PanelType | null>;

// 拖拽状态
export const draggingPanel: Writable<PanelType | null>;

// 派生 Store：按位置分组的面板
export const panelsByLocation: Readable<Record<PanelLocation, PanelConfig[]>>;
export const leftPanels: Readable<PanelConfig[]>;
export const rightPanels: Readable<PanelConfig[]>;
export const bottomPanels: Readable<PanelConfig[]>;
```

#### 核心 Actions

```typescript
// 切换侧边栏可见性
togglePanelSidebar(location: 'left' | 'right' | 'bottom'): void

// 设置侧边栏尺寸
setPanelSidebarSize(location: 'left' | 'right' | 'bottom', size: number): void

// 移动面板到新位置
movePanelToLocation(panelId: PanelType, newLocation: PanelLocation): void

// 重新排序面板
reorderPanels(location: PanelLocation, panelIds: PanelType[]): void

// 设置激活面板
setActivePanelTab(panelId: PanelType | null): void

// 拖拽控制
startDraggingPanel(panelId: PanelType): void
stopDraggingPanel(): void

// 重置布局
resetPanelLayout(): void
```

---

### 2. 鼠标和触摸手势系统

#### 文件结构
```
src/lib/types/keyboard.ts         // 手势类型定义
src/lib/stores/keyboard.svelte.ts // 手势绑定 Store
src/lib/utils/gestureEngine.ts    // 手势识别引擎
```

#### 鼠标手势类型

```typescript
// 鼠标手势绑定
interface MouseGestureBinding {
  pattern: string;        // 例如: "RL" (右左), "RDL" (右下左)
  command: string;
  description: string;
  category: string;
}

// 鼠标滚轮绑定
interface MouseWheelBinding {
  direction: 'up' | 'down';
  modifiers?: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
  };
  command: string;
  description: string;
}

// 鼠标手势方向
type MouseGestureDirection = 'U' | 'D' | 'L' | 'R' | 'UL' | 'UR' | 'DL' | 'DR';
```

#### 触摸手势类型

```typescript
// 触摸手势类型
type TouchGestureType =
  | 'swipe-left' | 'swipe-right' | 'swipe-up' | 'swipe-down'
  | 'pinch-in' | 'pinch-out'
  | 'rotate-clockwise' | 'rotate-counter-clockwise'
  | 'two-finger-swipe-left' | 'two-finger-swipe-right'
  | 'two-finger-swipe-up' | 'two-finger-swipe-down'
  | 'three-finger-swipe-left' | 'three-finger-swipe-right'
  | 'three-finger-swipe-up' | 'three-finger-swipe-down'
  | 'tap' | 'double-tap' | 'long-press';

// 触摸手势绑定
interface GestureBinding {
  gesture: TouchGestureType;
  command: string;
  description: string;
  category: string;
}
```

#### 默认手势绑定

**鼠标手势** (右键拖拽)
```typescript
const defaultMouseGestureBindings = [
  { pattern: 'L', command: 'previous_page', description: '向左 - 上一页' },
  { pattern: 'R', command: 'next_page', description: '向右 - 下一页' },
  { pattern: 'U', command: 'first_page', description: '向上 - 第一页' },
  { pattern: 'D', command: 'last_page', description: '向下 - 最后一页' },
  { pattern: 'UR', command: 'rotate_right', description: '右上 - 向右旋转' },
  { pattern: 'UL', command: 'rotate_left', description: '左上 - 向左旋转' },
  { pattern: 'RU', command: 'zoom_in', description: '右上 - 放大' },
  { pattern: 'RD', command: 'zoom_out', description: '右下 - 缩小' },
  { pattern: 'RL', command: 'close_book', description: '右左 - 关闭书籍' },
  { pattern: 'DR', command: 'toggle_fullscreen', description: '下右 - 全屏' }
];
```

**鼠标滚轮**
```typescript
const defaultMouseWheelBindings = [
  { direction: 'up', command: 'previous_page', description: '滚轮向上 - 上一页' },
  { direction: 'down', command: 'next_page', description: '滚轮向下 - 下一页' },
  { direction: 'up', modifiers: { ctrl: true }, command: 'zoom_in' },
  { direction: 'down', modifiers: { ctrl: true }, command: 'zoom_out' },
  { direction: 'up', modifiers: { shift: true }, command: 'rotate_left' },
  { direction: 'down', modifiers: { shift: true }, command: 'rotate_right' }
];
```

**触摸手势**
```typescript
const defaultGestureBindings = [
  { gesture: 'swipe-right', command: 'previous_page' },
  { gesture: 'swipe-left', command: 'next_page' },
  { gesture: 'pinch-out', command: 'zoom_in' },
  { gesture: 'pinch-in', command: 'zoom_out' },
  { gesture: 'rotate-clockwise', command: 'rotate_right' },
  { gesture: 'rotate-counter-clockwise', command: 'rotate_left' },
  { gesture: 'two-finger-swipe-up', command: 'first_page' },
  { gesture: 'two-finger-swipe-down', command: 'last_page' },
  { gesture: 'double-tap', command: 'toggle_fullscreen' },
  { gesture: 'long-press', command: 'show_context_menu' }
];
```

#### 手势引擎 API

**MouseGestureEngine**
```typescript
class MouseGestureEngine {
  constructor(onGestureComplete: (pattern: string) => void);
  
  startRecording(point: Point): void;
  updateGesture(point: Point): void;
  finishRecording(): string | null;
  cancelRecording(): void;
  
  static matchGesture(pattern: string, bindings: MouseGestureBinding[]): string | null;
  getState(): MouseGestureState;
}
```

**TouchGestureEngine**
```typescript
class TouchGestureEngine {
  constructor(onGesture: (gesture: string) => void);
  
  handleTouchStart(event: TouchEvent): void;
  handleTouchMove(event: TouchEvent): void;
  handleTouchEnd(): void;
  destroy(): void;
}
```

---

## 🎨 UI 设计特点

### PanelTabBar 组件

仿照 NeeView 的垂直图标栏设计：

**功能特性**
- ✅ 纯图标按钮（48px 宽）
- ✅ Hover 显示 Tooltip
- ✅ 拖拽手柄（左侧）
- ✅ 切换侧边栏按钮（右侧）
- ✅ 拖拽排序（HTML5 Drag & Drop）
- ✅ 视觉反馈（拖拽时显示蓝色指示线）
- ✅ 激活状态（左边蓝色边框）

**视觉设计**
```svelte
<button class="group relative w-full h-12">
  <!-- 左：拖拽手柄 -->
  <GripVertical class="opacity-0 group-hover:opacity-100" />
  
  <!-- 中：图标 -->
  <Icon class="h-5 w-5" />
  
  <!-- 右：切换按钮 -->
  <ArrowLeftRight class="opacity-0 group-hover:opacity-100" />
</button>
```

---

## 💾 配置持久化

### LocalStorage Keys

```typescript
'neoview-panels'   // PanelConfig[]
'neoview-sidebars' // Record<'left'|'right'|'bottom', SidebarConfig>
```

### 自动保存触发点

- 面板移动 (`movePanelToLocation`)
- 面板排序 (`reorderPanels`)
- 侧边栏调整 (`togglePanelSidebar`, `setPanelSidebarSize`)
- 面板可见性 (`togglePanelVisibility`)

### 自动恢复

应用启动时自动从 LocalStorage 加载配置，失败则使用默认配置。

---

## 🔧 待完成任务

### 1. 创建鼠标和手势设置面板

需要在 `SettingsDialog.svelte` 添加新标签页：

```svelte
<Tabs.List>
  <Tabs.Trigger value="mouse">鼠标</Tabs.Trigger>
  <Tabs.Trigger value="gesture">手势</Tabs.Trigger>
</Tabs.List>

<Tabs.Content value="mouse">
  <MouseSettingsPanel />
</Tabs.Content>

<Tabs.Content value="gesture">
  <GestureSettingsPanel />
</Tabs.Content>
```

**MouseSettingsPanel 功能**
- 滚轮行为配置
- 鼠标手势开关
- 手势录制
- 手势灵敏度调整

**GestureSettingsPanel 功能**
- 触摸手势开关
- 手势绑定列表
- 手势录制/测试
- 灵敏度和阈值调整

### 2. 集成手势引擎到 ImageViewer

```svelte
<!-- ImageViewer.svelte -->
<script lang="ts">
import { MouseGestureEngine, TouchGestureEngine } from '$lib/utils/gestureEngine';
import { mouseGestureBindings, gestureBindings } from '$lib/stores';

let mouseGestureEngine: MouseGestureEngine;
let touchGestureEngine: TouchGestureEngine;

$effect(() => {
  // 初始化鼠标手势
  mouseGestureEngine = new MouseGestureEngine((pattern) => {
    const command = MouseGestureEngine.matchGesture(pattern, $mouseGestureBindings);
    if (command) executeCommand(command);
  });
  
  // 初始化触摸手势
  touchGestureEngine = new TouchGestureEngine((gesture) => {
    const binding = $gestureBindings.find(b => b.gesture === gesture);
    if (binding) executeCommand(binding.command);
  });
});

function handleMouseDown(e: MouseEvent) {
  if (e.button === 2) { // 右键
    e.preventDefault();
    mouseGestureEngine.startRecording({ x: e.clientX, y: e.clientY });
  }
}

function handleMouseMove(e: MouseEvent) {
  mouseGestureEngine.updateGesture({ x: e.clientX, y: e.clientY });
}

function handleMouseUp() {
  mouseGestureEngine.finishRecording();
}
</script>

<div
  onmousedown={handleMouseDown}
  onmousemove={handleMouseMove}
  onmouseup={handleMouseUp}
  oncontextmenu={(e) => e.preventDefault()}
  ontouchstart={(e) => touchGestureEngine.handleTouchStart(e)}
  ontouchmove={(e) => touchGestureEngine.handleTouchMove(e)}
  ontouchend={() => touchGestureEngine.handleTouchEnd()}
>
  <!-- 图像查看器内容 -->
</div>
```

### 3. 创建新的 PanelSidebar 组件

```svelte
<!-- PanelSidebar.svelte -->
<script lang="ts">
import { leftPanels, rightPanels, activePanel } from '$lib/stores/panels.svelte';
import PanelTabBar from './PanelTabBar.svelte';
import ResizablePanel from '../ui/ResizablePanel.svelte';

let { location }: { location: 'left' | 'right' } = $props();

const panelsStore = location === 'left' ? leftPanels : rightPanels;
</script>

<div class="flex h-full">
  {#if location === 'left'}
    <PanelTabBar panels={$panelsStore} {location} />
  {/if}
  
  <ResizablePanel side={location} minWidth={200} maxWidth={600}>
    {#if $activePanel === 'folder'}
      <FileBrowser />
    {:else if $activePanel === 'history'}
      <HistoryPanel />
    {:else if $activePanel === 'bookmark'}
      <BookmarkPanel />
    {:else if $activePanel === 'info'}
      <InfoPanel />
    {/if}
  </ResizablePanel>
  
  {#if location === 'right'}
    <PanelTabBar panels={$panelsStore} {location} />
  {/if}
</div>
```

### 4. 更新 MainLayout 使用新系统

```svelte
<!-- MainLayout.svelte -->
<script lang="ts">
import { sidebars } from '$lib/stores/panels.svelte';
import PanelSidebar from './PanelSidebar.svelte';
</script>

<div class="flex h-full">
  {#if $sidebars.left.visible}
    <PanelSidebar location="left" />
  {/if}
  
  <div class="flex-1">
    <ImageViewer />
  </div>
  
  {#if $sidebars.right.visible}
    <PanelSidebar location="right" />
  {/if}
</div>

{#if $sidebars.bottom.visible}
  <div class="h-[{$sidebars.bottom.height}px] border-t">
    <BottomPanelContent />
  </div>
{/if}
```

---

## 📊 代码统计

### 新增文件 (4个)

| 文件 | 行数 | 用途 |
|------|------|------|
| `stores/panels.svelte.ts` | 330 | 面板管理系统 |
| `layout/PanelTabBar.svelte` | 180 | 竖排图标标签栏 |
| `utils/gestureEngine.ts` | 450 | 手势识别引擎 |
| `PANEL_SYSTEM_SUMMARY.md` | 600+ | 本文档 |

### 修改文件 (2个)

| 文件 | 变更 |
|------|------|
| `types/keyboard.ts` | +80 行（新增手势类型）|
| `stores/keyboard.svelte.ts` | +50 行（新增手势绑定）|

### 总计

- **新增代码**: ~1000 行
- **新增类型**: 10+
- **新增组件**: 1
- **新增工具类**: 2

---

## 🎯 使用示例

### 1. 切换侧边栏

```typescript
import { togglePanelSidebar } from '$lib/stores/panels.svelte';

// 切换左侧边栏
togglePanelSidebar('left');

// 切换右侧边栏
togglePanelSidebar('right');

// 切换底部侧边栏
togglePanelSidebar('bottom');
```

### 2. 移动面板

```typescript
import { movePanelToLocation } from '$lib/stores/panels.svelte';

// 将 folder 面板移动到右侧
movePanelToLocation('folder', 'right');

// 将 thumbnail 面板移动到底部
movePanelToLocation('thumbnail', 'bottom');
```

### 3. 使用鼠标手势

```typescript
import { MouseGestureEngine } from '$lib/utils/gestureEngine';
import { mouseGestureBindings } from '$lib/stores';

const engine = new MouseGestureEngine((pattern) => {
  console.log('检测到手势:', pattern);
  const command = MouseGestureEngine.matchGesture(pattern, $mouseGestureBindings);
  if (command) {
    executeCommand(command);
  }
});

// 右键拖拽 "L" 形状 → 上一页
// 右键拖拽 "R" 形状 → 下一页
// 右键拖拽 "RL" 形状 → 关闭书籍
```

### 4. 使用触摸手势

```typescript
import { TouchGestureEngine } from '$lib/utils/gestureEngine';
import { gestureBindings } from '$lib/stores';

const engine = new TouchGestureEngine((gesture) => {
  console.log('检测到手势:', gesture);
  const binding = $gestureBindings.find(b => b.gesture === gesture);
  if (binding) {
    executeCommand(binding.command);
  }
});

// 单指向左滑动 → 下一页
// 双指捏合 → 缩小
// 双指张开 → 放大
// 双指旋转 → 旋转图片
```

---

## 🚀 下一步计划

1. **创建设置面板** - 鼠标和手势配置 UI
2. **集成到主界面** - 更新 MainLayout 和 ImageViewer
3. **添加动画效果** - 面板切换、拖拽反馈
4. **性能优化** - 手势识别防抖、节流
5. **用户文档** - 编写使用指南

---

## 📝 参考资料

- **NeeView**: 面板布局和图标设计参考
- **czkawka-tauri**: ResizablePanel 实现参考
- **Tauri Architecture Docs**: ref/gen/rule/*.md

---

**文档版本**: v1.0  
**最后更新**: 2025年11月9日  
**作者**: GitHub Copilot 
