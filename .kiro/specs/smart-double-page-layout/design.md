# Design Document: Smart Double Page Layout

## Overview

本功能实现双页模式下的智能图片对齐，参考NeeView的`WidePageStretch`机制。核心思想是在双页显示时，通过为每个页面元素计算独立的缩放比例，使两张图片的高度（或宽度）对齐，从而优化空间利用和阅读体验。

### 核心算法

参考NeeView的`ContentSizeCalculator.CalcContentScale`方法：

```csharp
// NeeView的实现
private static double[] CalcUniformHeightScale(IEnumerable<Size> contents)
{
    var height = contents.Max(e => e.Height);
    return contents.Select(e => height / e.Height).ToArray();
}
```

即：找到最大高度，然后每个元素的缩放比例 = 最大高度 / 该元素高度。

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Svelte)                        │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│  │ CurrentFrame    │    │ FrameImage      │    │ Settings     │ │
│  │ Layer.svelte    │───▶│ .svelte         │    │ (alignment)  │ │
│  │ (applies scale) │    │ (renders img)   │    └──────────────┘ │
│  └─────────────────┘    └─────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ IPC (get_page_frame)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend (Rust)                           │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│  │ PageFrameBuilder│───▶│ ContentScale    │───▶│ PageFrame    │ │
│  │ (builds frame)  │    │ Calculator      │    │ (with scale) │ │
│  └─────────────────┘    └─────────────────┘    └──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流

1. 用户设置对齐模式（None/UniformHeight/UniformWidth）
2. 前端请求页面帧时传递对齐模式参数
3. 后端`PageFrameBuilder`构建双页帧时调用`ContentScaleCalculator`
4. 计算器根据两个元素的尺寸和对齐模式计算各自的scale
5. 返回的`PageFrame`中每个`PageFrameElement`包含独立的scale值
6. 前端渲染时为每个图片应用对应的scale

## Components and Interfaces

### 1. WidePageStretch 枚举 (Rust)

```rust
/// 宽页拉伸模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum WidePageStretch {
    /// 无拉伸（保持原始比例）
    #[default]
    None,
    /// 高度统一（缩放到相同高度）
    UniformHeight,
    /// 宽度统一（缩放到相同宽度）
    UniformWidth,
}
```

### 2. ContentScaleCalculator (Rust)

```rust
/// 内容缩放计算器
/// 计算双页模式下各元素的独立缩放比例
pub struct ContentScaleCalculator;

impl ContentScaleCalculator {
    /// 计算内容缩放比例
    /// 
    /// # Arguments
    /// * `sizes` - 各元素的原始尺寸
    /// * `stretch_mode` - 拉伸模式
    /// 
    /// # Returns
    /// 每个元素对应的缩放比例
    pub fn calculate(sizes: &[Size], stretch_mode: WidePageStretch) -> Vec<f64> {
        if sizes.is_empty() {
            return vec![];
        }
        if sizes.len() == 1 {
            return vec![1.0];
        }
        
        match stretch_mode {
            WidePageStretch::None => sizes.iter().map(|_| 1.0).collect(),
            WidePageStretch::UniformHeight => Self::calc_uniform_height(sizes),
            WidePageStretch::UniformWidth => Self::calc_uniform_width(sizes),
        }
    }
    
    fn calc_uniform_height(sizes: &[Size]) -> Vec<f64> {
        let max_height = sizes.iter()
            .map(|s| s.height)
            .fold(0.0, f64::max);
        
        if max_height <= 0.0 {
            return sizes.iter().map(|_| 1.0).collect();
        }
        
        sizes.iter()
            .map(|s| if s.height > 0.0 { max_height / s.height } else { 1.0 })
            .collect()
    }
    
    fn calc_uniform_width(sizes: &[Size]) -> Vec<f64> {
        let count = sizes.len() as f64;
        let avg_width = sizes.iter().map(|s| s.width).sum::<f64>() / count;
        
        if avg_width <= 0.0 {
            return sizes.iter().map(|_| 1.0).collect();
        }
        
        sizes.iter()
            .map(|s| if s.width > 0.0 { avg_width / s.width } else { 1.0 })
            .collect()
    }
}
```

### 3. PageFrameElement 更新

现有的`PageFrameElement`已包含`scale`字段，需确保：
- 序列化时包含scale值
- 默认值为1.0
- `width()`和`height()`方法正确应用scale

### 4. PageFrame::double_aligned 更新

```rust
impl PageFrame {
    /// 创建带对齐的双页帧
    pub fn double_aligned(
        mut e1: PageFrameElement, 
        mut e2: PageFrameElement, 
        direction: i32,
        stretch_mode: WidePageStretch
    ) -> Self {
        // 计算各元素的缩放比例
        let sizes = vec![e1.raw_size(), e2.raw_size()];
        let scales = ContentScaleCalculator::calculate(&sizes, stretch_mode);
        
        e1.scale = scales[0];
        e2.scale = scales[1];
        
        Self::double(e1, e2, direction)
    }
}
```

### 5. 前端 Frame 类型更新

```typescript
// src/lib/stackview/types/frame.ts
export interface FrameImage {
    url: string;
    physicalIndex: number;
    splitHalf?: 'left' | 'right';
    scale?: number;  // 内容缩放比例
    width?: number;
    height?: number;
}
```

### 6. CurrentFrameLayer 渲染更新

```svelte
<!-- 为每个图片应用独立的scale -->
{#each frame.images as img, i (i)}
    <FrameImage
        ...
        style={getImageStyle(img, effectiveVp)}
    />
{/each}

<script>
function getImageStyle(img: FrameImage, viewport: Size): string {
    const scale = img.scale ?? 1.0;
    const width = (img.width ?? 0) * scale;
    const height = (img.height ?? 0) * scale;
    return `width: ${width}px; height: ${height}px;`;
}
</script>
```

## Data Models

### WidePageStretch

| 值 | 描述 | 缩放计算 |
|---|---|---|
| None | 无对齐 | 所有元素scale=1.0 |
| UniformHeight | 高度统一 | scale = maxHeight / elementHeight |
| UniformWidth | 宽度统一 | scale = avgWidth / elementWidth |

### PageFrameElement (更新后)

```rust
pub struct PageFrameElement {
    pub page: Page,
    pub page_range: PageRange,
    pub is_dummy: bool,
    pub crop_rect: Option<CropRect>,
    pub scale: f64,  // 内容缩放比例，默认1.0
}
```

### 尺寸计算

```
原始尺寸: raw_size = (page.width * crop_width, page.height * crop_height)
显示尺寸: display_size = (raw_size.width * scale, raw_size.height * scale)
帧尺寸: frame_size = (sum(display_widths), max(display_heights))
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: UniformHeight produces equal heights

*For any* two images with positive dimensions, when UniformHeight alignment is applied, the resulting display heights (height × scale) SHALL be equal.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.2**

### Property 2: None alignment produces unit scale

*For any* set of images, when None alignment mode is selected, all calculated scale factors SHALL be exactly 1.0.

**Validates: Requirements 2.1**

### Property 3: UniformWidth produces equal widths

*For any* two images with positive dimensions, when UniformWidth alignment is applied, the resulting display widths (width × scale) SHALL be equal (within floating-point tolerance).

**Validates: Requirements 2.3**

### Property 4: Frame building includes valid scale values

*For any* double page frame built with alignment, each PageFrameElement SHALL contain a scale value greater than 0.

**Validates: Requirements 3.1, 3.2**

### Property 5: Frame scale fits viewport while maintaining proportions

*For any* aligned double page frame and viewport, after applying frame scale, the frame dimensions SHALL not exceed viewport dimensions, and the ratio between the two images' scaled heights SHALL remain 1:1 (for UniformHeight mode).

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

### Property 6: Serialization round-trip preserves scale

*For any* PageFrameElement with a scale value, serializing to JSON and deserializing back SHALL produce an element with the same scale value.

**Validates: Requirements 6.1, 6.2, 6.3**

## Error Handling

### 无效尺寸

- 当图片宽度或高度为0时，scale默认为1.0
- 当所有图片高度为0时（UniformHeight模式），所有scale为1.0

### 单页帧

- 单页帧不需要对齐计算，scale始终为1.0

### 序列化缺失

- JSON中缺少scale字段时，使用默认值1.0（通过`#[serde(default)]`实现）

## Testing Strategy

### 单元测试

1. `ContentScaleCalculator`的各种输入组合
2. `PageFrame::double_aligned`的构建逻辑
3. 序列化/反序列化的正确性

### 属性测试

使用`proptest`库进行属性测试：

```rust
use proptest::prelude::*;

proptest! {
    /// Property 1: UniformHeight produces equal heights
    /// **Feature: smart-double-page-layout, Property 1: UniformHeight produces equal heights**
    #[test]
    fn prop_uniform_height_equal_heights(
        w1 in 1.0..10000.0f64,
        h1 in 1.0..10000.0f64,
        w2 in 1.0..10000.0f64,
        h2 in 1.0..10000.0f64,
    ) {
        let sizes = vec![Size::new(w1, h1), Size::new(w2, h2)];
        let scales = ContentScaleCalculator::calculate(&sizes, WidePageStretch::UniformHeight);
        
        let display_h1 = h1 * scales[0];
        let display_h2 = h2 * scales[1];
        
        prop_assert!((display_h1 - display_h2).abs() < 0.001);
    }
}
```

### 测试框架

- Rust后端：`proptest` crate
- 每个属性测试运行至少100次迭代
- 测试注释格式：`**Feature: {feature_name}, Property {number}: {property_text}**`
