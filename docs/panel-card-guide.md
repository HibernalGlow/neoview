# NeoView 面板与卡片开发指南

## 概述

NeoView 使用面板(Panel)和卡片(Card)系统来组织侧边栏内容。面板是容器，卡片是具体功能模块。

## 添加新面板

### 步骤 1: 在 PANEL_DEFINITIONS 中定义面板

文件: `src/lib/stores/sidebarConfig.svelte.ts`

```typescript
export const PANEL_DEFINITIONS = {
  // ... 已有面板 ...
  
  // 新面板
  myPanel: {
    title: '我的面板',
    icon: MyIcon,           // 从 @lucide/svelte 导入
    emoji: '🎯',
    defaultPosition: 'right' as PanelPosition,  // 'left' | 'right'
    defaultVisible: true,   // 是否默认可见
    defaultOrder: 5,        // 在侧边栏中的默认顺序
    canMove: true,          // 是否可以移动位置
    canHide: true,          // 是否可以隐藏
    supportsCards: true     // 是否支持卡片系统
  }
};
```

**注意**: 添加新面板后，`PanelId` 类型会自动更新。

### 步骤 2: 创建面板组件

文件: `src/lib/components/panels/MyPanel.svelte`

```svelte
<script lang="ts">
import { MyIcon } from '@lucide/svelte';
import { cardConfigStore } from '$lib/stores/cardConfig.svelte';
import CardRenderer from '$lib/cards/CardRenderer.svelte';

const visibleCards = $derived(
  cardConfigStore.getPanelCards('myPanel').filter(c => c.visible)
);
</script>

<div class="flex h-full flex-col overflow-hidden">
  <div class="flex-1 space-y-2 overflow-y-auto p-2">
    {#if visibleCards.length > 0}
      {#each visibleCards as card (card.id)}
        <div style="order: {card.order}">
          <CardRenderer cardId={card.id} panelId="myPanel" />
        </div>
      {/each}
    {:else}
      <div class="flex flex-col items-center justify-center py-8 text-center">
        <MyIcon class="h-12 w-12 text-muted-foreground/50" />
        <p class="mt-2 text-sm text-muted-foreground">暂无卡片</p>
      </div>
    {/if}
  </div>
</div>
```

### 步骤 3: 注册面板组件

文件: `src/lib/components/panels/index.ts`

```typescript
// 1. 导出组件
export { default as MyPanel } from './MyPanel.svelte';

// 2. 导入组件（用于映射）
import MyPanel from './MyPanel.svelte';

// 3. 添加到 PANEL_COMPONENTS 映射
export const PANEL_COMPONENTS: Record<PanelId, any> = {
  // ... 已有面板 ...
  myPanel: MyPanel
};
```

---

## 添加新卡片

### 步骤 1: 在 cardRegistry 中定义卡片

文件: `src/lib/cards/registry.ts`

```typescript
import { MyCardIcon } from '@lucide/svelte';

export const cardRegistry: Record<string, CardDefinition> = {
  // ... 已有卡片 ...
  
  // 新卡片
  'myCard': {
    id: 'myCard',
    title: '我的卡片',
    icon: MyCardIcon,
    defaultPanel: 'myPanel',  // 卡片默认所属面板
    canHide: true,            // 是否可以隐藏
    
    // 可选布局配置
    fullHeight: false,        // 是否占满剩余高度
    hideIcon: false,          // 是否隐藏图标
    hideTitle: false,         // 是否隐藏标题
    hideHeader: false,        // 是否完全隐藏头部
    compact: false,           // 紧凑模式
    orientation: 'vertical',  // 'vertical' | 'horizontal'
  }
};
```

### 步骤 2: 创建卡片组件

文件: `src/lib/cards/myPanel/MyCard.svelte`

```svelte
<script lang="ts">
// 卡片逻辑
let someState = $state('初始值');

function handleAction() {
  // 处理操作
}
</script>

<div class="space-y-4">
  <!-- 卡片内容 -->
  <p>{someState}</p>
  <button onclick={handleAction}>操作</button>
</div>
```

**注意**: 卡片组件不需要包含标题和折叠逻辑，这些由 `CollapsibleCard` 自动处理。

### 步骤 3: 注册卡片组件懒加载

文件: `src/lib/cards/CardRenderer.svelte`

```typescript
const lazyComponentMap: Record<string, () => Promise<{ default: any }>> = {
  // ... 已有卡片 ...
  
  // 新卡片
  myCard: () => import('./myPanel/MyCard.svelte')
};
```

### 步骤 4: 更新配置版本号（可选但推荐）

文件: `src/lib/stores/cardConfig.svelte.ts`

```typescript
// 增加版本号以强制重置用户的卡片配置，加载新卡片
const CURRENT_CONFIG_VERSION = 13; // 递增版本号
```

---

## 最佳实践

### 目录结构

```
src/lib/
├── cards/
│   ├── registry.ts           # 卡片注册表
│   ├── CardRenderer.svelte   # 卡片渲染器
│   ├── CollapsibleCard.svelte
│   ├── myPanel/              # 按面板分组
│   │   ├── MyCard.svelte
│   │   └── AnotherCard.svelte
│   └── ...
├── components/
│   └── panels/
│       ├── index.ts          # 面板注册
│       ├── MyPanel.svelte
│       └── ...
└── stores/
    ├── sidebarConfig.svelte.ts  # 面板定义
    └── cardConfig.svelte.ts     # 卡片配置
```

### 注意事项

1. **面板 ID 一致性**: `PANEL_DEFINITIONS` 中的 key、`PANEL_COMPONENTS` 中的 key、`cardRegistry` 中的 `defaultPanel` 必须完全一致。

2. **卡片 ID 一致性**: `cardRegistry` 中的 key、`lazyComponentMap` 中的 key 必须完全一致。

3. **类型安全**: 添加面板后，TypeScript 会自动更新 `PanelId` 类型，IDE 会提示缺少的映射。

4. **版本控制**: 添加新面板/卡片后，建议递增 `CURRENT_CONFIG_VERSION` 以确保用户能看到新内容。

5. **图标导入**: 统一使用 `@lucide/svelte` 图标库。

---

## 快速检查清单

添加面板时：
- [ ] `sidebarConfig.svelte.ts` 中添加 `PANEL_DEFINITIONS`
- [ ] 创建面板组件 `MyPanel.svelte`
- [ ] `panels/index.ts` 中导出和注册

添加卡片时：
- [ ] `registry.ts` 中添加 `cardRegistry` 定义
- [ ] 创建卡片组件
- [ ] `CardRenderer.svelte` 中添加懒加载
- [ ] 递增 `CURRENT_CONFIG_VERSION`（推荐）
