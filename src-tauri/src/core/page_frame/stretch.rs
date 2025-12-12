//! `WidePageStretch` - 宽页拉伸模式
//! 控制双页模式下不同尺寸图片的对齐方式

use super::Size;
use serde::{Deserialize, Serialize};

/// 宽页拉伸模式
/// 
/// 控制双页模式下两张图片的对齐方式
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

/// 内容缩放计算器
/// 
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
    
    /// 计算高度统一的缩放比例
    /// 
    /// 找到最大高度，然后每个元素的缩放比例 = 最大高度 / 该元素高度
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
    
    /// 计算宽度统一的缩放比例
    /// 
    /// 计算平均宽度，然后每个元素的缩放比例 = 平均宽度 / 该元素宽度
    #[allow(clippy::cast_precision_loss)]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_none_mode() {
        let sizes = vec![
            Size::new(800.0, 1200.0),
            Size::new(1600.0, 800.0),
        ];
        let scales = ContentScaleCalculator::calculate(&sizes, WidePageStretch::None);
        
        assert_eq!(scales.len(), 2);
        assert!((scales[0] - 1.0).abs() < 0.001);
        assert!((scales[1] - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_uniform_height() {
        // 竖向页面 800x1200 和横向页面 1600x800
        let sizes = vec![
            Size::new(800.0, 1200.0),  // 高度 1200
            Size::new(1600.0, 800.0),  // 高度 800
        ];
        let scales = ContentScaleCalculator::calculate(&sizes, WidePageStretch::UniformHeight);
        
        assert_eq!(scales.len(), 2);
        // 第一个元素高度已经是最大，scale = 1.0
        assert!((scales[0] - 1.0).abs() < 0.001);
        // 第二个元素需要放大到 1200 高度，scale = 1200/800 = 1.5
        assert!((scales[1] - 1.5).abs() < 0.001);
        
        // 验证缩放后高度相等
        let h1 = sizes[0].height * scales[0];
        let h2 = sizes[1].height * scales[1];
        assert!((h1 - h2).abs() < 0.001);
    }

    #[test]
    fn test_uniform_width() {
        // 窄页面 600x1200 和宽页面 1000x1200
        let sizes = vec![
            Size::new(600.0, 1200.0),
            Size::new(1000.0, 1200.0),
        ];
        let scales = ContentScaleCalculator::calculate(&sizes, WidePageStretch::UniformWidth);
        
        assert_eq!(scales.len(), 2);
        // 平均宽度 = (600 + 1000) / 2 = 800
        // 第一个 scale = 800/600 = 1.333...
        // 第二个 scale = 800/1000 = 0.8
        let avg_width = 800.0;
        assert!((scales[0] - avg_width / 600.0).abs() < 0.001);
        assert!((scales[1] - avg_width / 1000.0).abs() < 0.001);
        
        // 验证缩放后宽度相等
        let w1 = sizes[0].width * scales[0];
        let w2 = sizes[1].width * scales[1];
        assert!((w1 - w2).abs() < 0.001);
    }

    #[test]
    fn test_single_element() {
        let sizes = vec![Size::new(800.0, 1200.0)];
        
        let scales = ContentScaleCalculator::calculate(&sizes, WidePageStretch::UniformHeight);
        assert_eq!(scales.len(), 1);
        assert!((scales[0] - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_empty_input() {
        let sizes: Vec<Size> = vec![];
        let scales = ContentScaleCalculator::calculate(&sizes, WidePageStretch::UniformHeight);
        assert!(scales.is_empty());
    }

    #[test]
    fn test_zero_height() {
        let sizes = vec![
            Size::new(800.0, 0.0),
            Size::new(800.0, 1200.0),
        ];
        let scales = ContentScaleCalculator::calculate(&sizes, WidePageStretch::UniformHeight);
        
        // 零高度元素应该返回 scale = 1.0
        assert!((scales[0] - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_same_height() {
        let sizes = vec![
            Size::new(800.0, 1200.0),
            Size::new(1600.0, 1200.0),
        ];
        let scales = ContentScaleCalculator::calculate(&sizes, WidePageStretch::UniformHeight);
        
        // 高度相同时，两个 scale 都应该是 1.0
        assert!((scales[0] - 1.0).abs() < 0.001);
        assert!((scales[1] - 1.0).abs() < 0.001);
    }
}
