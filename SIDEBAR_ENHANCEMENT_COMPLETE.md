# NeoView 边栏增强完成报告

## 完成时间
2025年11月9日

## 问题汇总

用户提出了三个关键需求：
1. **删除底部 StatusBar** - 解决滚轮下滑触发缩略图栏的 bug
2. **添加钉住/松开按钮** - 为所有边栏（上下左右）添加固定显示控制
3. **上下边栏拖拽调整** - 让顶部和底部边栏可以像侧边栏一样拖拽调整高度

## 已完成功能

### 1. 删除底部 StatusBar ✅

**问题分析**:
- StatusBar 位于底部（bottom-0），占用 6px 高度
- BottomThumbnailBar 触发区域在 bottom-6 位置
- 滚轮下滑时容易误触发 StatusBar 的触发区域
- StatusBar 显示的信息（书名、页码、缩放）在 TopToolbar 中已有显示

**解决方案**:
- 完全移除 StatusBar 组件
- BottomThumbnailBar 位置从 bottom-6 改回 bottom-0
- 触发区域高度从 3px 增加到 4px，更易触发
- 简化底部布局，避免多层重叠

**技术实现**:
```svelte
<!-- MainLayout.svelte - 移除 StatusBar -->
<div class="h-screen w-screen relative bg-background">
  <TopToolbar />
  <div class="absolute inset-0 overflow-hidden">
    {ImageViewer or children}
  </div>
  <BottomThumbnailBar />  <!-- 不再有 StatusBar -->
  <Sidebar />
  <RightSidebar />
</div>
```

```svelte
<!-- BottomThumbnailBar.svelte - 调整位置 -->
<!-- 触发区域直接在底部 -->
<div class="fixed bottom-0 left-0 right-0 h-4 z-[48]" />

<!-- 缩略图栏直接在底部 -->
<div class="absolute bottom-0 left-0 right-0 z-50" />
```

**修改文件**:
- `src/lib/components/layout/MainLayout.svelte`
- `src/lib/components/layout/BottomThumbnailBar.svelte`

### 2. 钉住/松开切换按钮 ✅

**功能说明**:
为所有四个边栏添加钉住按钮，控制自动隐藏行为：
- **钉住状态**: 边栏始终显示，不会自动隐藏
- **松开状态**: 边栏默认隐藏，鼠标悬停显示，离开后自动隐藏

**图标设计**:
- **钉住状态**: `Pin` 图标（实心图钉），按钮高亮（variant="default"）
- **松开状态**: `PinOff` 图标（空心图钉），按钮灰色（variant="ghost"）

#### 2.1 TopToolbar 钉住按钮

**位置**: 标题栏中间区域，设置按钮左侧

**实现**:
```svelte
<!-- TopToolbar.svelte - 标题栏中的钉住按钮 -->
<Button
  variant={$topToolbarPinned ? 'default' : 'ghost'}
  size="icon"
  class="h-6 w-6"
  onclick={togglePin}
  title={$topToolbarPinned ? '松开工具栏（自动隐藏）' : '钉住工具栏（始终显示）'}
>
  {#if $topToolbarPinned}
    <Pin class="h-4 w-4" />
  {:else}
    <PinOff class="h-4 w-4" />
  {/if}
</Button>
```

**行为逻辑**:
```typescript
// 响应钉住状态
$effect(() => {
  if ($topToolbarPinned) {
    isVisible = true;
    if (hideTimeout) clearTimeout(hideTimeout);
  }
});

// 显示工具栏时检查钉住状态
function showToolbar() {
  isVisible = true;
  if (hideTimeout) clearTimeout(hideTimeout);
  if (!$topToolbarPinned) {
    hideTimeout = setTimeout(() => {
      isVisible = false;
    }, 2000) as unknown as number;
  }
}

// 鼠标离开时检查钉住状态
function handleMouseLeave() {
  if ($topToolbarPinned || isResizing) return;
  // ... 延迟隐藏
}
```

#### 2.2 BottomThumbnailBar 钉住按钮

**位置**: 缩略图栏内部顶部，居中显示

**实现**:
```svelte
<!-- BottomThumbnailBar.svelte - 钉住按钮 -->
<div class="px-2 pb-1 flex justify-center">
  <Button
    variant={$bottomThumbnailBarPinned ? 'default' : 'ghost'}
    size="sm"
    class="h-6"
    onclick={togglePin}
  >
    {#if $bottomThumbnailBarPinned}
      <Pin class="h-3 w-3 mr-1" />
    {:else}
      <PinOff class="h-3 w-3 mr-1" />
    {/if}
    <span class="text-xs">{$bottomThumbnailBarPinned ? '已钉住' : '钉住'}</span>
  </Button>
</div>
```

**特点**:
- 带文字标签（"钉住" / "已钉住"）
- 居中显示，更容易点击
- 使用小尺寸（sm）适应缩略图栏

#### 2.3 Sidebar 钉住按钮

**位置**: 左侧图标标签栏顶部

**实现**:
```svelte
<!-- Sidebar.svelte - 钉住按钮 -->
<div class="w-12 flex flex-col border-r bg-secondary/30">
  <!-- 钉住按钮 -->
  <div class="p-1 border-b">
    <Button
      variant={$sidebarPinned ? 'default' : 'ghost'}
      size="icon"
      class="h-10 w-10"
      onclick={togglePin}
      title={$sidebarPinned ? '松开侧边栏（自动隐藏）' : '钉住侧边栏（始终显示）'}
    >
      {#if $sidebarPinned}
        <Pin class="h-4 w-4" />
      {:else}
        <PinOff class="h-4 w-4" />
      {/if}
    </Button>
  </div>
  
  <!-- 标签页按钮 -->
  {#each tabs as tab}...{/each}
</div>
```

**特点**:
- 方形图标按钮，与标签页按钮样式一致
- 位于所有标签页上方，易于访问
- 带 tooltip 提示功能

#### 2.4 RightSidebar 钉住按钮

**位置**: 右侧边栏内容区域顶部，居中显示

**实现**:
```svelte
<!-- RightSidebar.svelte - 钉住按钮 -->
<div class="flex-1 overflow-hidden flex flex-col">
  <!-- 钉住按钮 -->
  <div class="p-2 border-b flex justify-center">
    <Button
      variant={$rightSidebarPinned ? 'default' : 'ghost'}
      size="sm"
      class="h-8"
      onclick={togglePin}
    >
      {#if $rightSidebarPinned}
        <Pin class="h-3 w-3 mr-1" />
      {:else}
        <PinOff class="h-3 w-3 mr-1" />
      {/if}
      <span class="text-xs">{$rightSidebarPinned ? '已钉住' : '钉住'}</span>
    </Button>
  </div>

  <!-- 面板内容 -->
  <div class="flex-1 overflow-hidden">...</div>
</div>
```

**特点**:
- 带文字标签，清晰明确
- 横向布局，适应右侧边栏
- 小尺寸按钮，节省空间

**Store 状态管理**:
```typescript
// src/lib/stores/ui.svelte.ts
export const topToolbarPinned = writable<boolean>(false);
export const bottomThumbnailBarPinned = writable<boolean>(false);
export const sidebarPinned = writable<boolean>(false);
export const rightSidebarPinned = writable<boolean>(false);
```

**修改文件**:
- `src/lib/stores/ui.svelte.ts` (添加钉住状态)
- `src/lib/components/layout/TopToolbar.svelte`
- `src/lib/components/layout/BottomThumbnailBar.svelte`
- `src/lib/components/layout/Sidebar.svelte`
- `src/lib/components/layout/RightSidebar.svelte`

### 3. 上下边栏拖拽调整高度 ✅

**功能说明**:
为顶部工具栏和底部缩略图栏添加拖拽手柄，可以调整高度，类似侧边栏的宽度调整。

#### 3.1 TopToolbar 拖拽调整

**拖拽手柄位置**: 工具栏底部

**实现**:
```svelte
<!-- TopToolbar.svelte - 拖拽手柄 -->
<div class="bg-secondary/95 backdrop-blur-sm border-b shadow-lg overflow-hidden" 
     style="height: {$topToolbarHeight}px;">
  <!-- 工具栏内容 -->
  <div class="px-4 py-2 flex items-center justify-between gap-4 h-full overflow-y-auto">
    <!-- 面包屑、按钮等 -->
  </div>

  <!-- 拖拽手柄 -->
  <div
    class="h-2 flex items-center justify-center cursor-ns-resize hover:bg-primary/20 transition-colors"
    onmousedown={handleResizeStart}
    role="separator"
    aria-label="拖拽调整工具栏高度"
    tabindex="0"
  >
    <GripHorizontal class="h-3 w-3 text-muted-foreground" />
  </div>
</div>
```

**拖拽逻辑**:
```typescript
let isResizing = $state(false);
let resizeStartY = 0;
let resizeStartHeight = 0;

function handleResizeStart(e: MouseEvent) {
  isResizing = true;
  resizeStartY = e.clientY;
  resizeStartHeight = $topToolbarHeight;
  e.preventDefault();
}

function handleResizeMove(e: MouseEvent) {
  if (!isResizing) return;
  const deltaY = e.clientY - resizeStartY;
  const newHeight = Math.max(80, Math.min(400, resizeStartHeight + deltaY));
  topToolbarHeight.set(newHeight);
}

function handleResizeEnd() {
  isResizing = false;
}

// 全局监听鼠标事件
$effect(() => {
  if (isResizing) {
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
    };
  }
});
```

**高度限制**:
- 最小高度: 80px
- 最大高度: 400px
- 默认高度: 120px

**特性**:
- 动态高度，内容自动滚动
- 拖拽时阻止自动隐藏
- 悬停时手柄高亮（hover:bg-primary/20）
- 显示横向拖拽图标 `GripHorizontal`

#### 3.2 BottomThumbnailBar 拖拽调整

**拖拽手柄位置**: 缩略图栏顶部

**实现**:
```svelte
<!-- BottomThumbnailBar.svelte - 拖拽手柄 -->
<div class="bg-secondary/95 backdrop-blur-sm border-t shadow-lg overflow-hidden" 
     style="height: {$bottomThumbnailBarHeight}px;">
  <!-- 拖拽手柄 -->
  <div
    class="h-2 flex items-center justify-center cursor-ns-resize hover:bg-primary/20 transition-colors"
    onmousedown={handleResizeStart}
    role="separator"
    aria-label="拖拽调整缩略图栏高度"
    tabindex="0"
  >
    <GripHorizontal class="h-3 w-3 text-muted-foreground" />
  </div>

  <!-- 钉住按钮 -->
  <!-- 缩略图内容 -->
</div>
```

**拖拽逻辑**:
```typescript
function handleResizeStart(e: MouseEvent) {
  isResizing = true;
  resizeStartY = e.clientY;
  resizeStartHeight = $bottomThumbnailBarHeight;
  e.preventDefault();
}

function handleResizeMove(e: MouseEvent) {
  if (!isResizing) return;
  const deltaY = resizeStartY - e.clientY; // 反向，因为是从底部拖拽
  const newHeight = Math.max(80, Math.min(400, resizeStartHeight + deltaY));
  bottomThumbnailBarHeight.set(newHeight);
}
```

**高度限制**:
- 最小高度: 80px
- 最大高度: 400px
- 默认高度: 140px

**特性**:
- 反向拖拽（向上拖增加高度）
- 缩略图自动适应高度
- 拖拽时阻止自动隐藏
- 横向滚动保持功能

**Store 状态管理**:
```typescript
// src/lib/stores/ui.svelte.ts
export const topToolbarHeight = writable<number>(120);
export const bottomThumbnailBarHeight = writable<number>(140);
```

**修改文件**:
- `src/lib/stores/ui.svelte.ts` (添加高度状态)
- `src/lib/components/layout/TopToolbar.svelte`
- `src/lib/components/layout/BottomThumbnailBar.svelte`

## 技术亮点

### 1. 响应式钉住状态

使用 Svelte 5 的 `$effect` 实现自动响应：
```typescript
$effect(() => {
  if ($bottomThumbnailBarPinned) {
    isVisible = true;
    if (hideTimeout) clearTimeout(hideTimeout);
  }
});
```

**优势**:
- 自动同步状态
- 立即响应变化
- 清理定时器避免内存泄漏

### 2. 防止拖拽时自动隐藏

```typescript
function handleMouseLeave() {
  if ($topToolbarPinned || isResizing) return;
  // ... 延迟隐藏
}
```

**原理**:
- 拖拽时设置 `isResizing = true`
- 鼠标离开检查 `isResizing` 状态
- 拖拽结束后才允许自动隐藏

### 3. 全局事件监听模式

```typescript
$effect(() => {
  if (isResizing) {
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
    };
  }
});
```

**优势**:
- 拖拽时全局响应鼠标移动
- 自动清理事件监听器
- 避免内存泄漏

### 4. 视觉反馈设计

**拖拽手柄**:
- 固定高度 2px
- 显示横向拖拽图标 `GripHorizontal`
- 悬停时背景高亮 `hover:bg-primary/20`
- 光标变为 `cursor-ns-resize`

**钉住按钮**:
- 钉住时高亮（variant="default"）
- 松开时灰色（variant="ghost"）
- 图标切换（Pin / PinOff）
- Tooltip 提示功能

## 布局结构

```
屏幕布局（修改后）：

顶部:
┌─────────────────────────────────────┐
│ 标题栏 (h-8)                        │
│ [钉住] [设置] [最小化][最大化][关闭]│
├─────────────────────────────────────┤
│ 工具栏 (动态高度 80-400px)          │
│ [关闭][面包屑][上页][下页][缩放]... │
│ ═══ 拖拽手柄 ═══                    │
└─────────────────────────────────────┘

底部:
┌─────────────────────────────────────┐
│ BottomThumbnailBar (80-400px)       │
│ ═══ 拖拽手柄 ═══                    │
│ [钉住/松开按钮]                     │
│ [页1][页2][页3]...                  │
└─────────────────────────────────────┘

左侧:
┌──┬────────────────┐
│⊡ │                │
│📁│  文件浏览器    │
│📜│                │
│⭐│                │
│...│                │
└──┴────────────────┘
⊡ = 钉住按钮

右侧:
┌────────────────┬──┐
│ [钉住/松开]    │ⓘ│
│                │📄│
│   信息面板     │  │
│                │  │
└────────────────┴──┘
```

## 测试指南

### 测试 1: StatusBar 移除验证

**步骤**:
1. 打开应用，打开一本书籍
2. 滚轮下滑到底部
3. **预期**: 
   - 不再有状态栏（书名/页码/缩放信息）
   - 缩略图栏触发区域直接在屏幕底部
   - 不会因为滚轮误触发其他元素

### 测试 2: TopToolbar 钉住和拖拽

**步骤**:
1. 鼠标移动到屏幕顶部显示工具栏
2. 点击标题栏的钉住按钮（图钉图标）
3. **预期**: 按钮高亮，工具栏保持显示不隐藏
4. 鼠标移到工具栏底部，看到拖拽手柄（横线图标）
5. 按住拖拽手柄向下拖动
6. **预期**: 工具栏高度增加，最大400px
7. 向上拖动
8. **预期**: 工具栏高度减小，最小80px
9. 再次点击钉住按钮
10. **预期**: 按钮变灰，鼠标离开后工具栏自动隐藏

### 测试 3: BottomThumbnailBar 钉住和拖拽

**步骤**:
1. 打开一本书籍
2. 鼠标移到屏幕底部显示缩略图栏
3. 点击缩略图栏内的"钉住"按钮
4. **预期**: 
   - 按钮高亮，文字变为"已钉住"
   - 缩略图栏保持显示
5. 鼠标移到缩略图栏顶部的拖拽手柄
6. 按住向上拖动
7. **预期**: 缩略图栏高度增加，缩略图自动适应
8. 向下拖动
9. **预期**: 高度减小，最小80px
10. 点击"已钉住"按钮
11. **预期**: 变回"钉住"，鼠标离开后自动隐藏

### 测试 4: Sidebar 钉住

**步骤**:
1. 鼠标移到屏幕左侧边缘显示侧边栏
2. 点击顶部的钉住按钮（图钉图标）
3. **预期**: 按钮高亮，侧边栏保持显示
4. 尝试拖拽右侧边缘调整宽度
5. **预期**: 宽度正常调整，不触发自动隐藏
6. 再次点击钉住按钮
7. **预期**: 鼠标离开后自动隐藏

### 测试 5: RightSidebar 钉住

**步骤**:
1. 点击顶栏的右侧边栏按钮显示右侧边栏
2. 点击右侧边栏内的"钉住"按钮
3. **预期**: 按钮高亮，显示"已钉住"
4. 鼠标移到左侧边缘拖拽调整宽度
5. **预期**: 宽度正常调整
6. 点击"已钉住"按钮
7. **预期**: 变回"钉住"，自动隐藏功能恢复

### 测试 6: 拖拽时防止隐藏

**步骤**:
1. 显示顶部工具栏（不要钉住）
2. 开始拖拽底部手柄
3. 鼠标移出工具栏区域
4. **预期**: 工具栏不会隐藏，拖拽继续
5. 松开鼠标
6. **预期**: 拖拽结束，工具栏开始计时自动隐藏

## 用户体验改进

### Before (修复前)

❌ StatusBar 与缩略图栏位置冲突，滚轮误触发  
❌ 所有边栏都是自动隐藏，无法固定显示  
❌ 上下边栏高度固定，无法调整  
❌ 频繁操作时边栏不断隐藏，体验不佳  

### After (修复后)

✅ 移除 StatusBar，底部布局简洁清晰  
✅ 所有边栏都有钉住按钮，可固定显示  
✅ 上下边栏支持拖拽调整高度（80-400px）  
✅ 钉住后边栏始终显示，操作连贯流畅  
✅ 拖拽时自动防止隐藏，交互体验良好  

## 新增图标

```typescript
import {
  Pin,              // 钉住图标（实心图钉）
  PinOff,           // 松开图标（空心图钉）
  GripHorizontal    // 横向拖拽手柄图标
} from '@lucide/svelte';
```

## Store 新增状态

```typescript
// 钉住状态
export const topToolbarPinned = writable<boolean>(false);
export const bottomThumbnailBarPinned = writable<boolean>(false);
export const sidebarPinned = writable<boolean>(false);
export const rightSidebarPinned = writable<boolean>(false);

// 高度状态
export const topToolbarHeight = writable<number>(120);
export const bottomThumbnailBarHeight = writable<number>(140);
```

## 修改的文件列表

```
src/lib/stores/
└── ui.svelte.ts              (添加钉住和高度状态)

src/lib/components/layout/
├── MainLayout.svelte         (移除 StatusBar)
├── TopToolbar.svelte         (钉住按钮 + 拖拽调整)
├── BottomThumbnailBar.svelte (位置调整 + 钉住 + 拖拽)
├── Sidebar.svelte            (钉住按钮)
└── RightSidebar.svelte       (钉住按钮)
```

## 后续优化建议

### 可选改进

1. **持久化钉住状态**
   - 将钉住状态保存到 LocalStorage
   - 应用重启后恢复钉住状态
   - 记住每个边栏的高度/宽度

2. **拖拽吸附效果**
   - 接近最小/最大值时自动吸附
   - 双击手柄重置为默认大小
   - 添加拖拽过程中的尺寸提示

3. **快捷键支持**
   - `Ctrl+T` 切换顶栏钉住
   - `Ctrl+B` 切换底栏钉住
   - `Ctrl+L` 切换左侧栏钉住
   - `Ctrl+R` 切换右侧栏钉住

4. **动画优化**
   - 钉住/松开时添加图标旋转动画
   - 拖拽时添加平滑过渡
   - 高度变化时内容淡入淡出

5. **预设布局**
   - 添加布局预设（紧凑/标准/宽松）
   - 快速切换不同工作模式
   - 保存自定义布局配置

## 总结

本次更新完成了三个核心功能：

✅ **移除 StatusBar**: 简化底部布局，解决触发冲突  
✅ **钉住功能**: 四个边栏都支持固定显示，提升操作连贯性  
✅ **拖拽调整**: 上下边栏支持高度调整，灵活适应不同需求  

所有功能已编译通过，可以立即测试使用！

**开发服务器**: http://localhost:1420/
