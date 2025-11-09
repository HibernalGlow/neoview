# 侧边栏面板占位状态设计规范

## 概述

本文档定义了 NeoView 侧边栏各面板在占位状态（空状态）下的统一设计规范，确保用户体验的一致性和友好性。

## 设计原则

### 1. 视觉层次
- **主图标**：使用 16×16 大小的主功能图标，透明度 30%
- **动态元素**：可选的脉动小圆点或星标，增加活力
- **标题**：使用 `text-lg font-medium` 样式，明确表达当前状态
- **描述**：使用 `text-sm opacity-70` 样式，提供额外说明

### 2. 布局结构
```
┌─────────────────────────┐
│        主图标           │
│    (16×16, opacity-30)  │
│                         │
│      标题文本           │
│   (text-lg font-medium) │
│                         │
│      描述文本           │
│   (text-sm opacity-70)  │
│                         │
│    提示信息（可选）      │
│  (bg-muted/50 rounded)  │
└─────────────────────────┘
```

### 3. 间距规范
- 垂直内边距：`py-12`（上下 48px）
- 图标与文字间距：`mb-4`（16px）
- 文字行间距：`space-y-2`（8px）
- 提示框上边距：`mt-4`（16px）

## 具体实现

### 历史面板 (HistoryPanel)

```svelte
<div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
    <div class="relative mb-4">
        <Clock class="h-16 w-16 opacity-30" />
        <div class="absolute inset-0 flex items-center justify-center">
            <div class="h-2 w-2 bg-muted-foreground rounded-full animate-pulse"></div>
        </div>
    </div>
    <div class="text-center space-y-2">
        <p class="text-lg font-medium">暂无历史记录</p>
        <p class="text-sm opacity-70">浏览过的文件将在这里显示</p>
        <div class="mt-4 p-3 bg-muted/50 rounded-lg text-xs space-y-1">
            <p class="font-medium text-foreground">提示：</p>
            <p>• 自动记录浏览过的文件和页码</p>
            <p>• 支持快速跳转到上次阅读位置</p>
            <p>• 按时间排序，最近访问的在前</p>
        </div>
    </div>
</div>
```

**特点**：
- 使用脉动小圆点表示"等待中"状态
- 提供功能说明，帮助用户理解
- 列出关键特性，增强用户信心

### 书签面板 (BookmarkPanel)

```svelte
<div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
    <div class="relative mb-4">
        <Bookmark class="h-16 w-16 opacity-30" />
        <div class="absolute -top-1 -right-1">
            <Star class="h-4 w-4 text-yellow-400 fill-yellow-400 animate-pulse" />
        </div>
    </div>
    <div class="text-center space-y-2">
        <p class="text-lg font-medium">暂无书签</p>
        <p class="text-sm opacity-70">标记重要页面，方便快速访问</p>
        <div class="mt-4 p-3 bg-muted/50 rounded-lg text-xs space-y-1">
            <p class="font-medium text-foreground">提示：</p>
            <p>• 按 Ctrl+D 快速添加当前页到书签</p>
            <p>• 为书签添加星标，置顶重要内容</p>
            <p>• 使用搜索功能快速定位书签</p>
        </div>
    </div>
</div>
```

**特点**：
- 使用星标图标强调"收藏"概念
- 提供快捷键信息，提升效率
- 区分普通书签和星标书签

### 信息面板 (InfoPanel)

```svelte
<div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
    <div class="relative mb-4">
        <Info class="h-16 w-16 opacity-30" />
        <div class="absolute inset-0 flex items-center justify-center">
            <div class="h-2 w-2 bg-muted-foreground rounded-full animate-pulse"></div>
        </div>
    </div>
    <div class="text-center space-y-2">
        <p class="text-lg font-medium">暂无图像信息</p>
        <p class="text-sm opacity-70">打开图像文件后查看详细信息</p>
        <div class="mt-4 p-3 bg-muted/50 rounded-lg text-xs space-y-1">
            <p class="font-medium text-foreground">支持格式：</p>
            <p>• 图像：JPG, PNG, GIF, WebP, AVIF</p>
            <p>• 文档：PDF, CBZ, CBR</p>
            <p>• 视频：MP4, WebM (缩略图)</p>
        </div>
    </div>
</div>
```

**特点**：
- 明确列出支持的文件格式
- 帮助用户了解功能范围
- 使用脉动效果表示"准备就绪"

## 通用组件

### 占位状态组件 (PlaceholderState.svelte)

建议创建一个可复用的占位状态组件：

```svelte
<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    
    export let icon: ComponentType = Info;
    export let title: string = '暂无内容';
    export let description: string = '请加载内容后查看';
    export let tips: string[] = [];
    export let showAction: boolean = false;
    export let actionText: string = '开始使用';
    export let animated: boolean = true;
    
    const dispatch = createEventDispatcher();
    
    function handleAction() {
        dispatch('action');
    }
</script>

<div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
    <div class="relative mb-4">
        <svelte:component this={icon} class="h-16 w-16 opacity-30" />
        {#if animated}
            <div class="absolute inset-0 flex items-center justify-center">
                <div class="h-2 w-2 bg-muted-foreground rounded-full animate-pulse"></div>
            </div>
        {/if}
    </div>
    <div class="text-center space-y-2">
        <p class="text-lg font-medium">{title}</p>
        <p class="text-sm opacity-70">{description}</p>
        {#if tips.length > 0}
            <div class="mt-4 p-3 bg-muted/50 rounded-lg text-xs space-y-1">
                <p class="font-medium text-foreground">提示：</p>
                {#each tips as tip}
                    <p>{tip}</p>
                {/each}
            </div>
        {/if}
        {#if showAction}
            <button 
                class="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                on:click={handleAction}
            >
                {actionText}
            </button>
        {/if}
    </div>
</div>
```

## 动画效果

### 1. 脉动动画 (Pulse)
用于表示"等待中"或"准备就绪"状态：

```css
.animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
    0%, 100% {
        opacity: 1;
    }
    50% {
        opacity: 0.5;
    }
}
```

### 2. 淡入动画 (Fade In)
用于占位状态的初始显示：

```css
.animate-fade-in {
    animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

## 响应式设计

### 移动端适配
- 侧边栏宽度小于 200px 时，隐藏提示信息
- 图标大小调整为 `h-12 w-12`
- 文字大小适当缩小

### 紧凑模式
- 垂直内边距调整为 `py-8`
- 提示框使用更小的 padding: `p-2`

## 可访问性

### 1. 语义化标签
- 使用适当的 `<section>` 和 `<div>` 结构
- 确保文本内容可被屏幕阅读器识别

### 2. 键盘导航
- 占位状态通常不需要交互，但如果有操作按钮，需要支持键盘访问

### 3. 对比度
- 确保文字与背景的对比度符合 WCAG 2.1 AA 标准
- 使用 `text-muted-foreground` 确保适当的对比度

## 国际化支持

### 文本处理
- 所有用户可见的文本应通过国际化系统管理
- 避免硬编码中文文本

### 布局考虑
- 考虑不同语言文本长度对布局的影响
- 确保长文本能够正确换行

## 实施检查清单

- [ ] 所有面板的占位状态遵循统一的视觉规范
- [ ] 图标大小和透明度一致
- [ ] 文字层次清晰，主次分明
- [ ] 提示信息准确、有用
- [ ] 动画效果适度，不干扰用户
- [ ] 响应式布局正常工作
- [ ] 可访问性要求得到满足
- [ ] 国际化文本正确处理
- [ ] 性能影响最小化

## 更新日志

- 2025-11-09：初始版本，定义基础设计规范
- 包含历史、书签、信息三个面板的具体实现