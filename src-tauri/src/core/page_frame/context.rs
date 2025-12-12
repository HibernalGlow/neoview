//! PageFrameContext - 页面帧上下文配置
//! 控制页面帧的构建行为

use super::{PageMode, ReadOrder, Size, AutoRotateType, StretchMode};
use serde::{Deserialize, Serialize};

/// 页面帧上下文配置
/// 
/// 控制页面帧的构建行为，包括：
/// - 单页/双页模式
/// - 阅读方向
/// - 横向页面分割
/// - 横向页面独占
/// - 首页/末页单独显示
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageFrameContext {
    /// 页面模式（单页/双页）
    pub page_mode: PageMode,
    /// 阅读顺序（LTR/RTL）
    pub read_order: ReadOrder,
    /// 是否分割横向页面（单页模式下）
    pub is_supported_divide_page: bool,
    /// 横向页面是否独占（双页模式下）
    pub is_supported_wide_page: bool,
    /// 首页是否单独显示（双页模式下）
    pub is_supported_single_first: bool,
    /// 末页是否单独显示（双页模式下）
    pub is_supported_single_last: bool,
    /// 分割阈值（宽高比大于此值时分割）
    pub divide_page_rate: f64,
    /// 自动旋转模式
    pub auto_rotate: AutoRotateType,
    /// 拉伸模式
    pub stretch_mode: StretchMode,
    /// 画布尺寸
    pub canvas_size: Size,
}

impl PageFrameContext {
    /// 创建默认上下文
    pub fn new() -> Self {
        Self::default()
    }

    /// 设置页面模式
    pub fn with_page_mode(mut self, mode: PageMode) -> Self {
        self.page_mode = mode;
        self
    }

    /// 设置阅读顺序
    pub fn with_read_order(mut self, order: ReadOrder) -> Self {
        self.read_order = order;
        self
    }

    /// 设置是否分割横向页面
    pub fn with_divide_page(mut self, enabled: bool) -> Self {
        self.is_supported_divide_page = enabled;
        self
    }

    /// 设置横向页面是否独占
    pub fn with_wide_page(mut self, enabled: bool) -> Self {
        self.is_supported_wide_page = enabled;
        self
    }

    /// 设置首页是否单独显示
    pub fn with_single_first(mut self, enabled: bool) -> Self {
        self.is_supported_single_first = enabled;
        self
    }

    /// 设置末页是否单独显示
    pub fn with_single_last(mut self, enabled: bool) -> Self {
        self.is_supported_single_last = enabled;
        self
    }

    /// 设置分割阈值
    pub fn with_divide_rate(mut self, rate: f64) -> Self {
        self.divide_page_rate = rate;
        self
    }

    /// 设置自动旋转模式
    pub fn with_auto_rotate(mut self, mode: AutoRotateType) -> Self {
        self.auto_rotate = mode;
        self
    }

    /// 设置拉伸模式
    pub fn with_stretch_mode(mut self, mode: StretchMode) -> Self {
        self.stretch_mode = mode;
        self
    }

    /// 设置画布尺寸
    pub fn with_canvas_size(mut self, size: Size) -> Self {
        self.canvas_size = size;
        self
    }

    /// 获取方向值 (1=LTR, -1=RTL)
    pub fn direction(&self) -> i32 {
        self.read_order.direction()
    }

    /// 是否为单页模式
    pub fn is_single_mode(&self) -> bool {
        self.page_mode == PageMode::Single
    }

    /// 是否为双页模式
    pub fn is_double_mode(&self) -> bool {
        self.page_mode == PageMode::Double
    }

    /// 是否为 RTL 模式
    pub fn is_rtl(&self) -> bool {
        self.read_order == ReadOrder::RightToLeft
    }

    /// 是否为 LTR 模式
    pub fn is_ltr(&self) -> bool {
        self.read_order == ReadOrder::LeftToRight
    }
}

impl Default for PageFrameContext {
    fn default() -> Self {
        Self {
            page_mode: PageMode::Single,
            read_order: ReadOrder::LeftToRight,
            is_supported_divide_page: false,
            is_supported_wide_page: true,
            is_supported_single_first: true,
            is_supported_single_last: false,
            divide_page_rate: 1.0,
            auto_rotate: AutoRotateType::None,
            stretch_mode: StretchMode::Uniform,
            canvas_size: Size::zero(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_context_builder() {
        let ctx = PageFrameContext::new()
            .with_page_mode(PageMode::Double)
            .with_read_order(ReadOrder::RightToLeft)
            .with_divide_page(true)
            .with_divide_rate(1.2);

        assert!(ctx.is_double_mode());
        assert!(ctx.is_rtl());
        assert!(ctx.is_supported_divide_page);
        assert!((ctx.divide_page_rate - 1.2).abs() < 0.001);
        assert_eq!(ctx.direction(), -1);
    }
}
