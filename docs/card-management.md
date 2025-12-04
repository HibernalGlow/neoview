# 卡片管理系统设计文档

## 概述

卡片管理系统允许用户自定义各面板中卡片的顺序、显示/隐藏状态。设计参考了边栏管理面板的三区域拖拽布局。

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

## 下一步

1. 创建 `CollapsibleCard.svelte` 通用组件
2. 从 `BenchmarkPanel` 开始，将内容拆分为卡片
3. 在面板中集成 cardConfig，按配置渲染卡片
4. 验证设置页面和面板的同步
