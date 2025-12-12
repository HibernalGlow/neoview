//! PageFrameBuilder - 页面帧构建器
//! 根据配置构建页面帧，处理分割和双页逻辑

use super::{
    CropRect, Page, PageFrame, PageFrameContext, PageFrameElement, PageMode, PagePosition,
    PageRange, ReadOrder, Size,
};

/// 页面帧构建器
/// 
/// 根据页面列表和配置构建页面帧
pub struct PageFrameBuilder {
    /// 页面列表
    pages: Vec<Page>,
    /// 上下文配置
    context: PageFrameContext,
    /// 缓存：每个页面是否应该分割
    split_cache: Vec<bool>,
}

impl PageFrameBuilder {
    /// 创建构建器
    pub fn new(pages: Vec<Page>, context: PageFrameContext) -> Self {
        let split_cache = pages
            .iter()
            .map(|p| p.should_split(context.divide_page_rate))
            .collect();

        Self {
            pages,
            context,
            split_cache,
        }
    }

    /// 更新上下文配置
    pub fn set_context(&mut self, context: PageFrameContext) {
        // 重新计算分割缓存
        self.split_cache = self
            .pages
            .iter()
            .map(|p| p.should_split(context.divide_page_rate))
            .collect();
        self.context = context;
    }

    /// 更新页面列表
    pub fn set_pages(&mut self, pages: Vec<Page>) {
        self.split_cache = pages
            .iter()
            .map(|p| p.should_split(self.context.divide_page_rate))
            .collect();
        self.pages = pages;
    }

    /// 获取页面数量
    pub fn page_count(&self) -> usize {
        self.pages.len()
    }

    /// 获取页面
    pub fn get_page(&self, index: usize) -> Option<&Page> {
        self.pages.get(index)
    }

    /// 检查页面是否应该分割
    pub fn is_page_split(&self, index: usize) -> bool {
        // 只有在单页模式且启用分割时才分割
        if !self.context.is_single_mode() || !self.context.is_supported_divide_page {
            return false;
        }
        self.split_cache.get(index).copied().unwrap_or(false)
    }

    /// 检查页面是否为横向
    pub fn is_page_landscape(&self, index: usize) -> bool {
        self.pages.get(index).map(|p| p.is_landscape()).unwrap_or(false)
    }

    /// 构建指定位置的帧
    pub fn build_frame(&self, position: PagePosition) -> Option<PageFrame> {
        if position.index >= self.pages.len() {
            return None;
        }

        match self.context.page_mode {
            PageMode::Single => self.build_single_frame(position),
            PageMode::Double => self.build_double_frame(position),
        }
    }

    /// 构建单页帧
    fn build_single_frame(&self, position: PagePosition) -> Option<PageFrame> {
        let page = self.pages.get(position.index)?.clone();
        let is_split = self.is_page_split(position.index);

        let element = if is_split {
            // 分割页面
            if position.part == 0 {
                // 根据阅读方向决定先显示哪半
                if self.context.is_rtl() {
                    // RTL: 先显示右半
                    PageFrameElement::right_half(page, PageRange::right_half(position.index))
                } else {
                    // LTR: 先显示左半
                    PageFrameElement::left_half(page, PageRange::left_half(position.index))
                }
            } else {
                // 第二半
                if self.context.is_rtl() {
                    PageFrameElement::left_half(page, PageRange::left_half(position.index))
                } else {
                    PageFrameElement::right_half(page, PageRange::right_half(position.index))
                }
            }
        } else {
            // 完整页面
            PageFrameElement::full(page, PageRange::full_page(position.index))
        };

        Some(PageFrame::single(element, self.context.direction()))
    }

    /// 构建双页帧
    /// 
    /// 按照 NeeView 的 CreatePageFrame 逻辑：
    /// 1. 当前页横向 → 独占
    /// 2. 下一页横向 → 当前页独占（关键修复点）
    /// 3. 首页/尾页检查（检查当前页或下一页）
    /// 4. 正常双页
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

        // 3. 下一页横向 → 当前页独占（关键修复点！）
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

    /// 检查页面是否应该单独显示
    /// 
    /// 注意：这个方法只检查单个页面，用于 prev_frame_position 等场景
    /// build_double_frame 和 get_frame_step 使用内联逻辑，因为需要同时检查当前页和下一页
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

    /// 检查两个页面是否应该组成双页
    /// 
    /// 按照 NeeView 的逻辑，检查：
    /// 1. 当前页横向 → 不能组成双页
    /// 2. 下一页横向 → 不能组成双页
    /// 3. 首页/尾页检查 → 不能组成双页
    fn can_form_double_page(&self, index: usize, next_index: usize) -> bool {
        let page = match self.pages.get(index) {
            Some(p) => p,
            None => return false,
        };

        // 当前页横向 → 不能组成双页
        if self.context.is_supported_wide_page && page.is_landscape() {
            return false;
        }

        let next_page = match self.pages.get(next_index) {
            Some(p) => p,
            None => return false,
        };

        // 下一页横向 → 不能组成双页
        if self.context.is_supported_wide_page && next_page.is_landscape() {
            return false;
        }

        // 首页/尾页检查
        let is_first = index == 0 || next_index == 0;
        let is_last = index == self.pages.len() - 1 || next_index == self.pages.len() - 1;
        
        if (self.context.is_supported_single_first && is_first) ||
           (self.context.is_supported_single_last && is_last) {
            return false;
        }

        true
    }

    /// 获取下一帧位置
    pub fn next_frame_position(&self, current: PagePosition) -> Option<PagePosition> {
        let is_split = self.is_page_split(current.index);

        match self.context.page_mode {
            PageMode::Single => {
                if is_split && current.part == 0 {
                    // 分割页面的第一半 -> 第二半
                    Some(PagePosition::new(current.index, 1))
                } else if current.index + 1 < self.pages.len() {
                    // 下一页
                    Some(PagePosition::new(current.index + 1, 0))
                } else {
                    None
                }
            }
            PageMode::Double => {
                // 计算当前帧的步长
                let step = self.get_frame_step(current.index);
                let next_index = current.index + step;
                if next_index < self.pages.len() {
                    Some(PagePosition::new(next_index, 0))
                } else {
                    None
                }
            }
        }
    }

    /// 获取上一帧位置
    pub fn prev_frame_position(&self, current: PagePosition) -> Option<PagePosition> {
        match self.context.page_mode {
            PageMode::Single => {
                let is_split = self.is_page_split(current.index);
                if is_split && current.part == 1 {
                    // 分割页面的第二半 -> 第一半
                    Some(PagePosition::new(current.index, 0))
                } else if current.index > 0 {
                    // 上一页
                    let prev_index = current.index - 1;
                    let prev_split = self.is_page_split(prev_index);
                    Some(PagePosition::new(prev_index, if prev_split { 1 } else { 0 }))
                } else {
                    None
                }
            }
            PageMode::Double => {
                if current.index == 0 {
                    return None;
                }

                // 向前查找上一帧的起始位置
                let prev_index = current.index - 1;
                
                // 如果上一页应该单独显示，直接返回
                if self.should_display_alone(prev_index) {
                    return Some(PagePosition::new(prev_index, 0));
                }

                // 检查上一页是否是双页帧的第二页
                // 使用 can_form_double_page 检查 prev_index - 1 和 prev_index 是否能组成双页
                if prev_index > 0 && self.can_form_double_page(prev_index - 1, prev_index) {
                    return Some(PagePosition::new(prev_index - 1, 0));
                }

                Some(PagePosition::new(prev_index, 0))
            }
        }
    }

    /// 获取帧的步长（双页模式下）
    /// 
    /// 按照 NeeView 的逻辑，与 build_double_frame 保持一致：
    /// 1. 当前页横向 → 步进 1
    /// 2. 下一页横向 → 步进 1
    /// 3. 首页/尾页检查 → 步进 1
    /// 4. 正常双页 → 步进 2
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

    /// 计算总虚拟页数
    /// 
    /// 考虑分割页面的额外计数
    pub fn total_virtual_pages(&self) -> usize {
        if !self.context.is_single_mode() || !self.context.is_supported_divide_page {
            return self.pages.len();
        }

        self.pages.len() + self.split_cache.iter().filter(|&&s| s).count()
    }

    /// 从虚拟索引获取位置
    pub fn position_from_virtual(&self, virtual_index: usize) -> PagePosition {
        if !self.context.is_single_mode() || !self.context.is_supported_divide_page {
            return PagePosition::new(virtual_index.min(self.pages.len().saturating_sub(1)), 0);
        }

        let mut current_virtual = 0;
        for (index, &is_split) in self.split_cache.iter().enumerate() {
            let page_virtual_count = if is_split { 2 } else { 1 };
            
            if current_virtual + page_virtual_count > virtual_index {
                let part = if is_split && virtual_index > current_virtual { 1 } else { 0 };
                return PagePosition::new(index, part);
            }
            
            current_virtual += page_virtual_count;
        }

        // 超出范围，返回最后一页
        let last_index = self.pages.len().saturating_sub(1);
        let last_split = self.is_page_split(last_index);
        PagePosition::new(last_index, if last_split { 1 } else { 0 })
    }

    /// 从位置获取虚拟索引
    pub fn virtual_from_position(&self, position: PagePosition) -> usize {
        if !self.context.is_single_mode() || !self.context.is_supported_divide_page {
            return position.index;
        }

        let mut virtual_index = 0;
        for (index, &is_split) in self.split_cache.iter().enumerate() {
            if index == position.index {
                return virtual_index + position.part as usize;
            }
            virtual_index += if is_split { 2 } else { 1 };
        }

        virtual_index
    }

    /// 获取包含指定页面索引的帧位置
    pub fn frame_position_for_index(&self, page_index: usize) -> PagePosition {
        if page_index >= self.pages.len() {
            return PagePosition::new(self.pages.len().saturating_sub(1), 0);
        }

        match self.context.page_mode {
            PageMode::Single => PagePosition::new(page_index, 0),
            PageMode::Double => {
                // 在双页模式下，需要找到包含此页面的帧的起始位置
                if page_index == 0 || self.should_display_alone(page_index) {
                    return PagePosition::new(page_index, 0);
                }

                // 检查是否是双页帧的第二页
                // 使用 can_form_double_page 检查 prev_index 和 page_index 是否能组成双页
                let prev_index = page_index - 1;
                if self.can_form_double_page(prev_index, page_index) {
                    // 上一页和当前页能组成双页，所以当前页是双页帧的第二页
                    // 返回帧的起始位置
                    return PagePosition::new(prev_index, 0);
                }

                PagePosition::new(page_index, 0)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_pages(specs: &[(u32, u32)]) -> Vec<Page> {
        specs
            .iter()
            .enumerate()
            .map(|(i, (w, h))| Page::new(i, "".into(), "".into(), format!("{i}.jpg"), 0, *w, *h))
            .collect()
    }

    #[test]
    fn test_single_mode_no_split() {
        let pages = create_pages(&[(800, 1200), (800, 1200), (800, 1200)]);
        let context = PageFrameContext::new().with_page_mode(PageMode::Single);
        let builder = PageFrameBuilder::new(pages, context);

        let frame = builder.build_frame(PagePosition::new(0, 0)).unwrap();
        assert!(frame.is_single());
        assert_eq!(frame.start_index(), 0);

        let next = builder.next_frame_position(PagePosition::new(0, 0)).unwrap();
        assert_eq!(next.index, 1);
    }

    #[test]
    fn test_single_mode_with_split() {
        // 横向页面
        let pages = create_pages(&[(2000, 1000), (800, 1200)]);
        let context = PageFrameContext::new()
            .with_page_mode(PageMode::Single)
            .with_divide_page(true)
            .with_divide_rate(1.0);
        let builder = PageFrameBuilder::new(pages, context);

        // 第一页应该分割
        assert!(builder.is_page_split(0));
        assert!(!builder.is_page_split(1));

        // 第一半
        let frame1 = builder.build_frame(PagePosition::new(0, 0)).unwrap();
        assert!(frame1.first_element().unwrap().crop_rect.is_some());

        // 下一个位置应该是第二半
        let next = builder.next_frame_position(PagePosition::new(0, 0)).unwrap();
        assert_eq!(next.index, 0);
        assert_eq!(next.part, 1);

        // 再下一个应该是第二页
        let next2 = builder.next_frame_position(next).unwrap();
        assert_eq!(next2.index, 1);
    }

    #[test]
    fn test_double_mode() {
        let pages = create_pages(&[(800, 1200), (800, 1200), (800, 1200), (800, 1200)]);
        let context = PageFrameContext::new()
            .with_page_mode(PageMode::Double)
            .with_single_first(false);
        let builder = PageFrameBuilder::new(pages, context);

        // 第一帧应该包含两页
        let frame = builder.build_frame(PagePosition::new(0, 0)).unwrap();
        assert!(frame.is_double());
        assert!(frame.contains_index(0));
        assert!(frame.contains_index(1));

        // 下一帧位置
        let next = builder.next_frame_position(PagePosition::new(0, 0)).unwrap();
        assert_eq!(next.index, 2);
    }

    #[test]
    fn test_double_mode_wide_page() {
        // 第二页是横向
        let pages = create_pages(&[(800, 1200), (2000, 1000), (800, 1200)]);
        let context = PageFrameContext::new()
            .with_page_mode(PageMode::Double)
            .with_wide_page(true)
            .with_single_first(false);
        let builder = PageFrameBuilder::new(pages, context);

        // 第一帧只有第一页（因为第二页是横向）
        let frame1 = builder.build_frame(PagePosition::new(0, 0)).unwrap();
        assert!(frame1.is_single());
        assert_eq!(frame1.start_index(), 0);

        // 第二帧是横向页面单独显示
        let frame2 = builder.build_frame(PagePosition::new(1, 0)).unwrap();
        assert!(frame2.is_single());
        assert_eq!(frame2.start_index(), 1);
    }

    #[test]
    fn test_virtual_page_count() {
        let pages = create_pages(&[(2000, 1000), (800, 1200), (2000, 1000)]);
        let context = PageFrameContext::new()
            .with_page_mode(PageMode::Single)
            .with_divide_page(true)
            .with_divide_rate(1.0);
        let builder = PageFrameBuilder::new(pages, context);

        // 3 物理页 + 2 横向页 = 5 虚拟页
        assert_eq!(builder.total_virtual_pages(), 5);
    }

    #[test]
    fn test_rtl_split_order() {
        let pages = create_pages(&[(2000, 1000)]);
        let context = PageFrameContext::new()
            .with_page_mode(PageMode::Single)
            .with_divide_page(true)
            .with_divide_rate(1.0)
            .with_read_order(ReadOrder::RightToLeft);
        let builder = PageFrameBuilder::new(pages, context);

        // RTL 模式下，第一半应该是右半
        let frame = builder.build_frame(PagePosition::new(0, 0)).unwrap();
        let crop = frame.first_element().unwrap().crop_rect.unwrap();
        assert!((crop.x - 0.5).abs() < 0.001); // 右半
    }
}
