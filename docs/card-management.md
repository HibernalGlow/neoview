# 卡片管理系统设计文档

## 概述

卡片管理系统允许用户自定义各面板中卡片的顺序、显示/隐藏状态。

## 架构设计（V2）

### 核心思想
- **卡片是独立模块**：每个卡片是自包含的组件，有自己的 ID、标题、图标
- **配置与组件分离**：cardConfig 只存储位置信息，不存储卡片实现
- **面板是纯容器**：面板不关心具体卡片，只根据配置渲染
- **卡片注册表**：统一注册所有卡片，支持动态发现

### 文件结构

```
src/lib/
├── stores/
│   └── cardConfig.svelte.ts      # 配置存储（位置、顺序、显隐、展开）
├── cards/
│   ├── registry.ts               # 卡片注册表（静态定义所有卡片）
│   ├── CardContainer.svelte      # 通用卡片容器（折叠、拖拽）
│   ├── CardRenderer.svelte       # 根据 ID 渲染对应卡片
│   ├── benchmark/                # 按功能分组
│   │   ├── VisibilityCard.svelte
│   │   ├── LatencyCard.svelte
│   │   └── RendererCard.svelte
│   ├── info/
│   │   ├── FileInfoCard.svelte
│   │   └── ImageInfoCard.svelte
│   └── ...
└── panels/
    ├── BenchmarkPanel.svelte     # 容器：从配置读取卡片，渲染 CardRenderer
    └── InfoPanel.svelte
```

### 数据流

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  CardRegistry   │────▶│   cardConfig    │────▶│     Panel       │
│  (卡片定义)      │     │  (位置配置)      │     │   (容器)        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ id, title, icon │     │ panelId, order  │     │ CardRenderer    │
│ component, ...  │     │ visible, expand │     │ ┌─────────────┐ │
└─────────────────┘     └─────────────────┘     │ │CardContainer│ │
                                                │ │  ┌───────┐  │ │
                                                │ │  │ Card  │  │ │
                                                │ │  └───────┘  │ │
                                                │ └─────────────┘ │
                                                └─────────────────┘
```

### 跨面板移动

配置中每个卡片有 `panelId` 字段，移动只需：
```typescript
cardConfigStore.moveCardToPanel(cardId, newPanelId);
```

### 卡片注册表示例

```typescript
// cards/registry.ts
export const cardRegistry = {
  'visibility': {
    id: 'visibility',
    title: '可见性监控',
    icon: Eye,
    defaultPanel: 'benchmark',
    component: () => import('./benchmark/VisibilityCard.svelte')
  },
  'latency': {
    id: 'latency', 
    title: '延迟分析',
    icon: Timer,
    defaultPanel: 'benchmark',
    component: () => import('./benchmark/LatencyCard.svelte')
  },
  // ...
};
```

## 已完成

### 1. 基础设施

- **`sidebarConfig.svelte.ts`**
  - 添加 `supportsCards` 字段到面板定义
  - 添加 `getCardSupportingPanels()` 函数
  - 添加 `panelSupportsCards()` 函数
  - 支持卡片的面板：`info`, `properties`, `upscale`, `insights`, `benchmark`

- **`cardConfig.svelte.ts`**
  - 卡片配置存储
  - 从 `sidebarConfig` 动态读取支持卡片的面板
  - localStorage 持久化 (`neoview_card_configs`)
  - 支持：排序、显示/隐藏、展开/收起

- **`CardPanelManager.svelte`**
  - 设置页面中的卡片管理 UI
  - 三区域拖拽布局（等待区 + 各面板区）
  - pointer 拖拽（同 SidebarManagementPanel）
  - 上下移动按钮

### 2. 设置集成

- **`Settings.svelte`**
  - 添加"卡片管理"选项卡
  - 路由到 CardPanelManager

## 待完成

### 1. 面板卡片拆分

各面板需要将内容拆分为独立的卡片组件：

| 面板 | 卡片 | 组件 |
|------|------|------|
| info | 文件信息 | `FileInfoCard.svelte` |
| info | 图片信息 | `ImageInfoCard.svelte` |
| properties | 基本信息 | `BasicPropertiesCard.svelte` |
| properties | EXIF 数据 | `ExifCard.svelte` |
| properties | 直方图 | `HistogramCard.svelte` |
| upscale | 模型选择 | `ModelSelectCard.svelte` |
| upscale | 参数设置 | `UpscaleSettingsCard.svelte` |
| upscale | 预览 | `PreviewCard.svelte` |
| upscale | 历史记录 | `UpscaleHistoryCard.svelte` |
| insights | 分析 | `AnalysisCard.svelte` |
| insights | 标签 | `TagsCard.svelte` |
| insights | 相似图片 | `SimilarCard.svelte` |
| benchmark | 可见性监控 | `VisibilityCard.svelte` |
| benchmark | 延迟分析 | `LatencyCard.svelte` |
| benchmark | 渲染模式 | `RendererCard.svelte` |
| benchmark | ... | ... |

### 2. 通用卡片容器

创建 `CollapsibleCard.svelte` 组件：
- 标题栏（可折叠）
- 内容区
- 读取 cardConfig 中的展开状态

### 3. 面板内卡片渲染

各面板需要：
1. 从 `cardConfig` 读取卡片配置
2. 按 order 排序渲染卡片
3. 根据 visible 控制显示
4. 根据 expanded 控制展开

示例：
```svelte
{#each visibleCards as card (card.id)}
  <CollapsibleCard {card}>
    {#if card.id === 'file'}
      <FileInfoCard />
    {:else if card.id === 'image'}
      <ImageInfoCard />
    {/if}
  </CollapsibleCard>
{/each}
```

### 4. 跨面板移动（可选）

目前卡片只能在同一面板内排序。如果需要跨面板移动：
1. 卡片需要与特定面板解耦
2. 添加 `moveCardToPanel()` 函数
3. 在 CardPanelManager 中实现拖拽到其他面板

## 文件结构

```
src/lib/
├── stores/
│   ├── sidebarConfig.svelte.ts  # 面板配置（含 supportsCards）
│   └── cardConfig.svelte.ts      # 卡片配置
├── components/
│   ├── settings/
│   │   ├── CardPanelManager.svelte    # 卡片管理 UI
│   │   └── PanelItemManager.svelte    # 通用拖拽列表（未使用）
│   ├── cards/
│   │   ├── CollapsibleCard.svelte     # 通用折叠卡片容器（待创建）
│   │   ├── FileInfoCard.svelte        # 文件信息卡片（待创建）
│   │   └── ...
│   └── panels/
│       ├── InfoPanel.svelte           # 需要集成卡片
│       ├── PropertiesPanel.svelte     # 需要集成卡片
│       └── ...
```

## 当前进度

- [x] 创建 `CollapsibleCard.svelte` 通用组件
- [x] 创建 `cards/registry.ts` 卡片注册表
- [x] 更新 `cardConfig` 使用 registry 动态生成默认配置
- [x] 添加 `moveCardToPanel(cardId, toPanelId)` 跨面板移动（解耦设计，只需 ID）
- [x] 创建各面板的卡片占位组件
  - benchmark: 10 个卡片
  - info: 2 个卡片
  - properties: 3 个卡片
  - upscale: 4 个卡片
  - insights: 3 个卡片
- [ ] 创建 `CardRenderer.svelte` 动态渲染器
- [ ] 重构面板为纯容器
- [ ] 从现有面板提取实际卡片内容
- [ ] 验证设置页面和面板的同步

## CollapsibleCard 使用示例

```svelte
<script>
import { CollapsibleCard } from '$lib/components/cards';
import { Timer } from '@lucide/svelte';
</script>

<CollapsibleCard
  id="latency"
  panelId="benchmark"
  title="延迟分析"
  icon={Timer}
>
  <!-- 卡片内容 -->
  <p>延迟分析内容...</p>
</CollapsibleCard>
```
