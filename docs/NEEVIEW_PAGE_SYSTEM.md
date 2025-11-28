# NeeView 风格页面系统实现文档

## 概述

本系统参考 NeeView 的设计，实现了一个高效的虚拟页面管理系统，支持横向页面分割、双页模式等功能。

## 核心概念

### 1. PhysicalPage（物理页面）
代表实际的图片文件，包含：
- `index`: 物理索引
- `path`: 文件路径
- `size`: 图片尺寸 `{ width, height }`
- `aspectRatio`: 宽高比（用于判断是否为横向页面）
- `isLandscape`: 是否为横向页面

### 2. VirtualPage（虚拟页面）
代表显示的页面单位，可能是：
- 完整的物理页面
- 物理页面的左半部分
- 物理页面的右半部分

关键属性：
- `virtualIndex`: 虚拟索引
- `physicalPage`: 引用的物理页面
- `part`: 分割部分（0=左/完整，1=右）
- `cropRect`: 裁剪区域
- `isDivided`: 是否被分割

### 3. PageFrame（页面帧）
代表当前显示的内容，可包含多个 VirtualPage（双页模式）。

## 分割实现

### 原理
横向页面（宽度 > 高度）可以被分割成两个虚拟页面，但**不复制图片数据**：

```
PhysicalPage (1920x1080)
    ├── VirtualPage[0] (左半边, cropRect: 0,0,960,1080)
    └── VirtualPage[1] (右半边, cropRect: 960,0,960,1080)
```

### CSS 裁剪
使用 `clip-path: inset()` 实现裁剪显示：

```css
/* 左半边 */
clip-path: inset(0 50% 0 0);

/* 右半边 */
clip-path: inset(0 0 0 50%);
```

优点：
- 不复制图片数据，内存效率高
- 与缩放、平移等变换兼容
- 两个分割页面共享同一个图片缓存

### NeeView 对比
NeeView 使用 WPF 的 `CroppedBitmap`，原理相同：
- 不复制像素数据
- 只是原图的一个视图
- 支持正常的图片变换

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                      bookStore2                          │
│  (Svelte Store - 响应式状态管理)                          │
├─────────────────────────────────────────────────────────┤
│                      BookManager                         │
│  (门面类 - 协调各模块)                                    │
├─────────────────────────────────────────────────────────┤
│  VirtualPageList  │  PageFrameManager  │  PreloadPipeline │
│  (页面列表管理)    │  (帧管理)          │  (预加载管道)     │
└─────────────────────────────────────────────────────────┘
```

## 关键文件

| 文件 | 职责 |
|------|------|
| `src/lib/core/types.ts` | 类型定义 |
| `src/lib/core/virtualPageList.ts` | 虚拟页面列表管理 |
| `src/lib/core/pageFrameManager.ts` | 页面帧管理 |
| `src/lib/core/preloadPipeline.ts` | 预加载管道 |
| `src/lib/core/bookManager.ts` | 门面类 |
| `src/lib/stores/bookStore2.ts` | Svelte Store |
| `src/lib/components/canvas/nodes/NewReaderNode.svelte` | Flow 模式测试组件 |

## 配置选项

```typescript
interface VirtualPageListConfig {
  pageMode: 'single' | 'wide';     // 单页/双页模式
  divideLandscape: boolean;         // 是否分割横向页面
  divideThreshold: number;          // 分割阈值（默认 1.0）
  readOrder: 'ltr' | 'rtl';        // 阅读方向
  autoRotate: boolean;              // 自动旋转（待实现）
}
```

## 使用示例

```typescript
import { bookStore2 } from '$lib/stores/bookStore2';

// 打开书籍
await bookStore2.openBook(path, files, { isArchive: true });

// 设置分割横向页面
bookStore2.setDivideLandscape(true);

// 翻页
bookStore2.nextPage();
bookStore2.prevPage();

// 获取当前帧
const frame = $bookStore2.currentFrame;
```

## 待实现功能

- [ ] 自动旋转（根据图片方向自动旋转）
- [ ] 双页模式显示
- [ ] 预加载优化
- [ ] 与主 Viewer 集成
