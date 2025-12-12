# Design Document: Wide Page Fix

## Overview

本设计文档描述了"横向视为双页"功能的 bug 修复方案，完全参考 NeeView 的 `PageFrameFactory` 实现。

### NeeView 的核心设计

NeeView 的 `CreatePageFrame` 方法实现了以下逻辑（双页模式，`FramePageSize == 2`）：

```csharp
private PageFrame? CreatePageFrame(PageFrameElement? source, int direction)
{
    var source1 = source;
    if (source1 is null) return null;

    if (_context.FramePageSize == 2 && !_bookContext.IsMedia)
    {
        // 1. 当前页横向 → 独占
        if (_context.IsSupportedWidePage && source1.IsLandscape())
        {
            return CreateSinglePageFrame(source1);
        }

        // 2. 静态双页模式的特殊处理（奇偶页配对）
        if (_context.IsStaticWidePage && !IsNeedSecondPageWhenStaticWidePage(...))
        {
            return CreateWideFillPageFrame(source1);
        }

        // 3. 获取下一页
        var source2 = CreatePageSource(position, direction);
        if (source2 is null)
        {
            return CreateWideFillPageFrame(source1);
        }

        // 4. 下一页横向 → 当前页独占（关键！）
        if (_context.IsSupportedWidePage && source2.IsLandscape())
        {
            return CreateWideFillPageFrame(source1);
        }

        // 5. 首页/尾页单独显示（检查 source1 或 source2 是否为首页/尾页）
        bool isSingleFirstPage = _context.IsSupportedSingleFirstPage && 
            (source1.Page == _book.First || source2.Page == _book.First);
        bool isSingleLastPage = _context.IsSupportedSingleLastPage && 
            (source1.Page == _book.Last || source2.Page == _book.Last);
        if (isSingleFirstPage || isSingleLastPage)
        {
            return CreateWideFillPageFrame(source1);
        }

        // 6. 正常双页
        return CreateWidePageFrame(source1, source2, direction);
    }
    else
    {
        return CreateSinglePageFrame(source1);
    }
}
```

### 关键点

1. **检查顺序**：当前页横向 → 下一页横向 → 首页/尾页 → 正常双页
2. **首页/尾页检查**：检查的是 `source1` 或 `source2` 是否为首页/尾页，而不仅仅是当前页
3. **WideFillPageFrame**：可以插入 Dummy 页面来填充空白（可选功能）

## Architecture

### 修复点分布

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Svelte)                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              viewMode.ts                             │   │
│  │  - buildFrameImages() [修复点 1]                     │   │
│  │  - getPageStep() [修复点 2]                          │   │
│  │  - shouldDisplayAlone() [新增辅助函数]               │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│  ┌─────────────────────────▼─────────────────────────────┐ │
│  │              StackView.svelte                         │ │
│  │  - frameConfig 添加 singleFirstPage/singleLastPage   │ │
│  │  - pageStep 计算使用新逻辑                            │ │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │ IPC
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Rust Backend                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              PageFrameBuilder                        │   │
│  │  - build_double_frame() [修复点 3]                   │   │
│  │  - should_display_alone() [已存在，需验证]           │   │
│  │  - get_frame_step() [修复点 4]                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. 后端 PageFrameBuilder 修复

#### 当前实现分析

当前的 `should_display_alone` 函数：
```rust
fn should_display_alone(&self, index: usize) -> bool {
    let page = match self.pages.get(index) {
        Some(p) => p,
        None => return true,
    };

    // 横向页面独占
    if self.context.is_supported_wide_page && page.is_landscape() {
        return true;
    }

    // 首页单独显示
    if self.context.is_supported_single_first && index == 0 {
        return true;
    }

    // 末页单独显示
    if self.context.is_supported_single_last && index == self.pages.len() - 1 {
        return true;
    }

    false
}
```

**问题**：这个函数只检查单个页面，但 NeeView 的首页/尾页检查是检查 `source1` 或 `source2` 是否为首页/尾页。

#### 修复后的 build_double_frame

```rust
fn build_double_frame(&self, position: PagePosition) -> Option<PageFrame> {
    let page = self.pages.get(position.index)?.clone();
    let direction = self.context.direction();

    // 1. 当前页横向 → 独占
    if self.context.is_supported_wide_page && page.is_landscape() {
        let element = PageFrameElement::full(page, PageRange::full_page(position.index));
        return Some(PageFrame::single(element, direction));
    }

    // 2. 获取下一页
    let next_index = position.index + 1;
    if next_index >= self.pages.len() {
        // 没有下一页，当前页独占
        let element = PageFrameElement::full(page, PageRange::full_page(position.index));
        return Some(PageFrame::single(element, direction));
    }

    let next_page = self.pages.get(next_index)?.clone();

    // 3. 下一页横向 → 当前页独占（关键修复点）
    if self.context.is_supported_wide_page && next_page.is_landscape() {
        let element = PageFrameElement::full(page, PageRange::full_page(position.index));
        return Some(PageFrame::single(element, direction));
    }

    // 4. 首页/尾页单独显示（检查当前页或下一页是否为首页/尾页）
    let is_first = position.index == 0 || next_index == 0;
    let is_last = position.index == self.pages.len() - 1 || next_index == self.pages.len() - 1;
    
    if (self.context.is_supported_single_first && is_first) ||
       (self.context.is_supported_single_last && is_last) {
        let element = PageFrameElement::full(page, PageRange::full_page(position.index));
        return Some(PageFrame::single(element, direction));
    }

    // 5. 正常双页
    let e1 = PageFrameElement::full(page, PageRange::full_page(position.index));
    let e2 = PageFrameElement::full(next_page, PageRange::full_page(next_index));
    Some(PageFrame::double_aligned(e1, e2, direction))
}
```

#### 修复后的 get_frame_step

```rust
fn get_frame_step(&self, index: usize) -> usize {
    let page = match self.pages.get(index) {
        Some(p) => p,
        None => return 1,
    };

    // 1. 当前页横向 → 步进 1
    if self.context.is_supported_wide_page && page.is_landscape() {
        return 1;
    }

    // 2. 没有下一页 → 步进 1
    let next_index = index + 1;
    if next_index >= self.pages.len() {
        return 1;
    }

    let next_page = match self.pages.get(next_index) {
        Some(p) => p,
        None => return 1,
    };

    // 3. 下一页横向 → 步进 1
    if self.context.is_supported_wide_page && next_page.is_landscape() {
        return 1;
    }

    // 4. 首页/尾页单独显示
    let is_first = index == 0 || next_index == 0;
    let is_last = index == self.pages.len() - 1 || next_index == self.pages.len() - 1;
    
    if (self.context.is_supported_single_first && is_first) ||
       (self.context.is_supported_single_last && is_last) {
        return 1;
    }

    // 5. 正常双页 → 步进 2
    2
}
```

### 2. 前端 viewMode.ts 修复

#### 新增配置参数

```typescript
export interface FrameBuildConfig {
  layout: PageMode;
  orientation: Orientation;
  direction: Direction;
  divideLandscape: boolean;
  treatHorizontalAsDoublePage: boolean;  // 对应 IsSupportedWidePage
  autoRotate: AutoRotateMode;
  // 新增
  singleFirstPage: boolean;              // 对应 IsSupportedSingleFirstPage
  singleLastPage: boolean;               // 对应 IsSupportedSingleLastPage
  totalPages: number;                    // 总页数
}
```

#### 修复 buildFrameImages

```typescript
export function buildFrameImages(
  currentPage: PageData,
  nextPage: PageData | null,
  config: FrameBuildConfig,
  splitState: SplitState | null = null
): FrameImage[] {
  const currentSize: ImageSize = {
    width: currentPage.width || 0,
    height: currentPage.height || 0,
  };

  const mainImage: FrameImage = {
    url: currentPage.url,
    physicalIndex: currentPage.pageIndex,
    virtualIndex: currentPage.pageIndex,
    width: currentPage.width,
    height: currentPage.height,
  };

  // 单页模式
  if (config.layout === 'single') {
    // ... 现有的分割和自动旋转逻辑 ...
    return [mainImage];
  }

  // 双页模式
  if (config.layout === 'double') {
    const hasCurrentSize = currentSize.width > 0 && currentSize.height > 0;
    const isCurrentLandscape = hasCurrentSize && isLandscape(currentSize);

    // 1. 当前页横向 → 独占
    if (config.treatHorizontalAsDoublePage && isCurrentLandscape) {
      return [mainImage];
    }

    // 2. 没有下一页 → 单页
    if (!nextPage) {
      return [mainImage];
    }

    const nextSize: ImageSize = {
      width: nextPage.width || 0,
      height: nextPage.height || 0,
    };
    const hasNextSize = nextSize.width > 0 && nextSize.height > 0;
    const isNextLandscape = hasNextSize && isLandscape(nextSize);

    // 3. 下一页横向 → 当前页独占
    if (config.treatHorizontalAsDoublePage && isNextLandscape) {
      return [mainImage];
    }

    // 4. 首页/尾页单独显示（检查当前页或下一页）
    const currentIndex = currentPage.pageIndex;
    const nextIndex = nextPage.pageIndex;
    const isFirst = currentIndex === 0 || nextIndex === 0;
    const isLast = currentIndex === config.totalPages - 1 || nextIndex === config.totalPages - 1;
    
    if ((config.singleFirstPage && isFirst) || (config.singleLastPage && isLast)) {
      return [mainImage];
    }

    // 5. 正常双页
    const secondImage: FrameImage = {
      url: nextPage.url,
      physicalIndex: nextPage.pageIndex,
      virtualIndex: nextPage.pageIndex,
      width: nextPage.width,
      height: nextPage.height,
    };
    return [mainImage, secondImage];
  }

  return [mainImage];
}
```

#### 修复 getPageStep

```typescript
export function getPageStep(
  currentPage: PageData,
  nextPage: PageData | null,
  config: FrameBuildConfig
): number {
  if (config.layout !== 'double') {
    return 1;
  }

  const currentSize: ImageSize = {
    width: currentPage.width || 0,
    height: currentPage.height || 0,
  };
  const hasCurrentSize = currentSize.width > 0 && currentSize.height > 0;
  const isCurrentLandscape = hasCurrentSize && isLandscape(currentSize);

  // 1. 当前页横向 → 步进 1
  if (config.treatHorizontalAsDoublePage && isCurrentLandscape) {
    return 1;
  }

  // 2. 没有下一页 → 步进 1
  if (!nextPage) {
    return 1;
  }

  const nextSize: ImageSize = {
    width: nextPage.width || 0,
    height: nextPage.height || 0,
  };
  const hasNextSize = nextSize.width > 0 && nextSize.height > 0;
  const isNextLandscape = hasNextSize && isLandscape(nextSize);

  // 3. 下一页横向 → 步进 1
  if (config.treatHorizontalAsDoublePage && isNextLandscape) {
    return 1;
  }

  // 4. 首页/尾页单独显示
  const currentIndex = currentPage.pageIndex;
  const nextIndex = nextPage.pageIndex;
  const isFirst = currentIndex === 0 || nextIndex === 0;
  const isLast = currentIndex === config.totalPages - 1 || nextIndex === config.totalPages - 1;
  
  if ((config.singleFirstPage && isFirst) || (config.singleLastPage && isLast)) {
    return 1;
  }

  // 5. 正常双页 → 步进 2
  return 2;
}
```

### 3. StackView.svelte 修复

需要更新 `frameConfig` 以包含新的配置参数：

```typescript
let frameConfig = $derived.by(
  (): FrameBuildConfig => ({
    layout: pageMode,
    orientation: orientation,
    direction: direction,
    divideLandscape: splitHorizontalPages && pageMode === 'single',
    treatHorizontalAsDoublePage: treatHorizontalAsDoublePage,
    autoRotate: autoRotateMode,
    // 新增
    singleFirstPage: settings.view.pageLayout?.singleFirstPage ?? true,
    singleLastPage: settings.view.pageLayout?.singleLastPage ?? false,
    totalPages: bookStore.totalPages,
  })
);
```

## Data Models

### 设置模型更新

```typescript
// settingsManager.ts
interface PageLayoutSettings {
  splitHorizontalPages: boolean;
  treatHorizontalAsDoublePage: boolean;
  singleFirstPage: boolean;   // 新增
  singleLastPage: boolean;    // 新增
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: 横向页独占显示
*For any* page list and page index where the current page is landscape and IsSupportedWidePage is enabled, the built frame SHALL contain exactly one element (the current page).
**Validates: Requirements 1.1**

### Property 2: 下一页横向时当前页独占
*For any* page list and page index where the next page is landscape and IsSupportedWidePage is enabled, the built frame SHALL contain exactly one element (the current page, not the landscape next page).
**Validates: Requirements 1.2**

### Property 3: 步进与帧构建一致性
*For any* page list, page index, and configuration, the page step returned by getPageStep/get_frame_step SHALL equal the number of pages in the frame built by buildFrameImages/build_double_frame.
**Validates: Requirements 2.1**

### Property 4: 横向页不被跳过
*For any* page list containing landscape pages, navigating through all pages SHALL visit every landscape page exactly once (no skipping).
**Validates: Requirements 1.3, 1.4**

### Property 5: 首页单独显示
*For any* page list where IsSupportedSingleFirst is enabled, the first page SHALL always be displayed alone in its frame, and SHALL NOT be paired with the second page.
**Validates: Requirements 6.1, 6.2**

### Property 6: 尾页单独显示
*For any* page list where IsSupportedSingleLast is enabled, the last page SHALL always be displayed alone in its frame, and SHALL NOT be paired with the second-to-last page.
**Validates: Requirements 6.3, 6.4**

### Property 7: 首页/尾页检查包含配对页
*For any* double-page frame building, if either the current page OR the next page is the first/last page (and the corresponding setting is enabled), the current page SHALL be displayed alone.
**Validates: Requirements 6.2, 6.4**

## Error Handling

本修复不涉及新的错误处理逻辑。现有的边界检查（页面索引越界等）保持不变。

## Testing Strategy

### 测试框架选择

- **Rust 后端**: 使用 `proptest` 进行属性测试
- **TypeScript 前端**: 使用 `fast-check` 进行属性测试

### 单元测试

1. **后端 PageFrameBuilder 测试**
   - 当前页横向时返回单元素帧
   - 下一页横向时返回单元素帧
   - 首页/尾页单独显示
   - 步进计算正确性

2. **前端 viewMode.ts 测试**
   - buildFrameImages 返回正确的图片数量
   - getPageStep 返回正确的步进值
   - 首页/尾页检查包含配对页

### 属性测试

每个属性测试必须：
1. 使用 `proptest` (Rust) 或 `fast-check` (TypeScript)
2. 运行至少 100 次迭代
3. 使用注释标记对应的正确性属性

```rust
// 示例：Property 3 - 步进与帧构建一致性
// **Feature: wide-page-fix, Property 3: Step-Frame Consistency**
proptest! {
    #[test]
    fn test_step_frame_consistency(
        pages in prop::collection::vec(arb_page(), 1..20),
        index in 0usize..19,
    ) {
        let context = PageFrameContext::new()
            .with_page_mode(PageMode::Double)
            .with_wide_page(true);
        let builder = PageFrameBuilder::new(pages.clone(), context);
        
        if index < pages.len() {
            let frame = builder.build_frame(PagePosition::new(index, 0));
            let step = builder.get_frame_step(index);
            
            if let Some(f) = frame {
                prop_assert_eq!(step, f.element_count());
            }
        }
    }
}
```

