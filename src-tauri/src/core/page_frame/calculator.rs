//! ContentSizeCalculator - 内容尺寸计算器
//! 计算页面显示尺寸和缩放比例

use super::Size;
use serde::{Deserialize, Serialize};

/// 拉伸模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StretchMode {
    /// 无拉伸（原始尺寸）
    None,
    /// 适应视口（保持宽高比，完全显示）
    Uniform,
    /// 填充视口（保持宽高比，可能裁剪）
    UniformToFill,
    /// 适应高度
    UniformToVertical,
    /// 适应宽度
    UniformToHorizontal,
    /// 拉伸填充（不保持宽高比）
    Fill,
}

impl Default for StretchMode {
    fn default() -> Self {
        Self::Uniform
    }
}

/// 自动旋转类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AutoRotateType {
    /// 不旋转
    None,
    /// 向左旋转 90 度
    Left,
    /// 向右旋转 90 度
    Right,
    /// 自动（根据图片和视口方向）
    Auto,
}

impl Default for AutoRotateType {
    fn default() -> Self {
        Self::None
    }
}

/// 内容尺寸计算器
/// 
/// 根据拉伸模式计算图片的显示尺寸和缩放比例
pub struct ContentSizeCalculator {
    /// 视口尺寸
    viewport: Size,
    /// 拉伸模式
    stretch_mode: StretchMode,
    /// 自动旋转类型
    auto_rotate: AutoRotateType,
}

impl ContentSizeCalculator {
    /// 创建计算器
    pub fn new(viewport: Size, stretch_mode: StretchMode, auto_rotate: AutoRotateType) -> Self {
        Self {
            viewport,
            stretch_mode,
            auto_rotate,
        }
    }

    /// 计算显示尺寸和缩放比例
    /// 
    /// 返回 (显示尺寸, 缩放比例, 旋转角度)
    pub fn calculate(&self, content_size: Size) -> (Size, f64, f64) {
        if content_size.width <= 0.0 || content_size.height <= 0.0 {
            return (Size::zero(), 1.0, 0.0);
        }

        // 计算旋转角度
        let rotation = self.calculate_rotation(content_size);
        
        // 如果需要旋转，交换宽高
        let effective_size = if rotation.abs() > 45.0 {
            Size::new(content_size.height, content_size.width)
        } else {
            content_size
        };

        // 计算缩放
        let scale = self.calculate_scale(effective_size);
        
        // 计算显示尺寸
        let display_size = Size::new(
            effective_size.width * scale,
            effective_size.height * scale,
        );

        (display_size, scale, rotation)
    }

    /// 计算缩放比例
    pub fn calculate_scale(&self, content_size: Size) -> f64 {
        if content_size.width <= 0.0 || content_size.height <= 0.0 {
            return 1.0;
        }

        let scale_x = self.viewport.width / content_size.width;
        let scale_y = self.viewport.height / content_size.height;

        match self.stretch_mode {
            StretchMode::None => 1.0,
            StretchMode::Uniform => scale_x.min(scale_y),
            StretchMode::UniformToFill => scale_x.max(scale_y),
            StretchMode::UniformToVertical => scale_y,
            StretchMode::UniformToHorizontal => scale_x,
            StretchMode::Fill => {
                // 返回一个平均值，实际上 Fill 模式需要分别处理宽高
                (scale_x + scale_y) / 2.0
            }
        }
    }

    /// 计算旋转角度
    fn calculate_rotation(&self, content_size: Size) -> f64 {
        match self.auto_rotate {
            AutoRotateType::None => 0.0,
            AutoRotateType::Left => -90.0,
            AutoRotateType::Right => 90.0,
            AutoRotateType::Auto => {
                // 自动旋转：当图片方向与视口方向不匹配时旋转
                let content_landscape = content_size.is_landscape();
                let viewport_landscape = self.viewport.is_landscape();
                
                if content_landscape != viewport_landscape {
                    // 方向不匹配，旋转 90 度
                    90.0
                } else {
                    0.0
                }
            }
        }
    }

    /// 计算适应视口的尺寸（Uniform 模式）
    pub fn fit_to_viewport(&self, content_size: Size) -> Size {
        let scale = self.calculate_scale_uniform(content_size);
        Size::new(content_size.width * scale, content_size.height * scale)
    }

    /// 计算填充视口的尺寸（UniformToFill 模式）
    pub fn fill_viewport(&self, content_size: Size) -> Size {
        let scale = self.calculate_scale_fill(content_size);
        Size::new(content_size.width * scale, content_size.height * scale)
    }

    /// 计算 Uniform 模式的缩放比例
    fn calculate_scale_uniform(&self, content_size: Size) -> f64 {
        if content_size.width <= 0.0 || content_size.height <= 0.0 {
            return 1.0;
        }
        let scale_x = self.viewport.width / content_size.width;
        let scale_y = self.viewport.height / content_size.height;
        scale_x.min(scale_y)
    }

    /// 计算 UniformToFill 模式的缩放比例
    fn calculate_scale_fill(&self, content_size: Size) -> f64 {
        if content_size.width <= 0.0 || content_size.height <= 0.0 {
            return 1.0;
        }
        let scale_x = self.viewport.width / content_size.width;
        let scale_y = self.viewport.height / content_size.height;
        scale_x.max(scale_y)
    }
}

/// 快捷函数：计算 Uniform 模式的缩放
pub fn calculate_uniform_scale(content: Size, viewport: Size) -> f64 {
    if content.width <= 0.0 || content.height <= 0.0 {
        return 1.0;
    }
    let scale_x = viewport.width / content.width;
    let scale_y = viewport.height / content.height;
    scale_x.min(scale_y)
}

/// 快捷函数：计算 UniformToFill 模式的缩放
pub fn calculate_fill_scale(content: Size, viewport: Size) -> f64 {
    if content.width <= 0.0 || content.height <= 0.0 {
        return 1.0;
    }
    let scale_x = viewport.width / content.width;
    let scale_y = viewport.height / content.height;
    scale_x.max(scale_y)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_uniform_scale() {
        let viewport = Size::new(1920.0, 1080.0);
        let calc = ContentSizeCalculator::new(viewport, StretchMode::Uniform, AutoRotateType::None);

        // 横向图片适应横向视口
        let content = Size::new(3840.0, 2160.0);
        let scale = calc.calculate_scale(content);
        assert!((scale - 0.5).abs() < 0.001);

        // 竖向图片适应横向视口
        let content = Size::new(1080.0, 1920.0);
        let scale = calc.calculate_scale(content);
        assert!((scale - 1080.0 / 1920.0).abs() < 0.001);
    }

    #[test]
    fn test_fill_scale() {
        let viewport = Size::new(1920.0, 1080.0);
        let calc = ContentSizeCalculator::new(viewport, StretchMode::UniformToFill, AutoRotateType::None);

        // 横向图片填充横向视口
        let content = Size::new(3840.0, 2160.0);
        let scale = calc.calculate_scale(content);
        assert!((scale - 0.5).abs() < 0.001);

        // 竖向图片填充横向视口
        let content = Size::new(1080.0, 1920.0);
        let scale = calc.calculate_scale(content);
        // 应该按宽度缩放
        assert!((scale - 1920.0 / 1080.0).abs() < 0.001);
    }

    #[test]
    fn test_auto_rotate() {
        let viewport = Size::new(1920.0, 1080.0); // 横向视口
        let calc = ContentSizeCalculator::new(viewport, StretchMode::Uniform, AutoRotateType::Auto);

        // 竖向图片在横向视口中应该旋转
        let content = Size::new(1080.0, 1920.0);
        let (_, _, rotation) = calc.calculate(content);
        assert!((rotation - 90.0).abs() < 0.001);

        // 横向图片在横向视口中不旋转
        let content = Size::new(1920.0, 1080.0);
        let (_, _, rotation) = calc.calculate(content);
        assert!((rotation - 0.0).abs() < 0.001);
    }
}
