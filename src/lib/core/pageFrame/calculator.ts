/**
 * ContentSizeCalculator - 内容尺寸计算器
 * 
 * 翻译自 Rust 后端的 calculator.rs
 * 计算页面显示尺寸和缩放比例
 */

import type { Size, StretchMode, AutoRotateType } from './types';
import { Size as SizeUtils } from './types';

/**
 * 内容尺寸计算器
 * 
 * 根据拉伸模式计算图片的显示尺寸和缩放比例
 */
export class ContentSizeCalculator {
	/** 视口尺寸 */
	private viewport: Size;
	/** 拉伸模式 */
	private stretchMode: StretchMode;
	/** 自动旋转类型 */
	private autoRotate: AutoRotateType;
	
	constructor(viewport: Size, stretchMode: StretchMode, autoRotate: AutoRotateType) {
		this.viewport = viewport;
		this.stretchMode = stretchMode;
		this.autoRotate = autoRotate;
	}
	
	/** 更新视口尺寸 */
	setViewport(viewport: Size): void {
		this.viewport = viewport;
	}
	
	/** 更新拉伸模式 */
	setStretchMode(mode: StretchMode): void {
		this.stretchMode = mode;
	}
	
	/** 更新自动旋转类型 */
	setAutoRotate(type: AutoRotateType): void {
		this.autoRotate = type;
	}
	
	/**
	 * 计算显示尺寸和缩放比例
	 * 
	 * @returns [显示尺寸, 缩放比例, 旋转角度]
	 */
	calculate(contentSize: Size): { size: Size; scale: number; rotation: number } {
		if (contentSize.width <= 0 || contentSize.height <= 0) {
			return { size: SizeUtils.zero(), scale: 1, rotation: 0 };
		}
		
		// 计算旋转角度
		const rotation = this.calculateRotation(contentSize);
		
		// 如果需要旋转，交换宽高
		const effectiveSize = Math.abs(rotation) > 45
			? SizeUtils.new(contentSize.height, contentSize.width)
			: contentSize;
		
		// 计算缩放
		const scale = this.calculateScale(effectiveSize);
		
		// 计算显示尺寸
		const displaySize = SizeUtils.new(
			effectiveSize.width * scale,
			effectiveSize.height * scale
		);
		
		return { size: displaySize, scale, rotation };
	}
	
	/**
	 * 计算缩放比例
	 */
	calculateScale(contentSize: Size): number {
		if (contentSize.width <= 0 || contentSize.height <= 0) {
			return 1;
		}
		
		const scaleX = this.viewport.width / contentSize.width;
		const scaleY = this.viewport.height / contentSize.height;
		
		switch (this.stretchMode) {
			case 'none':
				return 1;
			case 'uniform':
				return Math.min(scaleX, scaleY);
			case 'uniformToFill':
				return Math.max(scaleX, scaleY);
			case 'uniformToVertical':
				return scaleY;
			case 'uniformToHorizontal':
				return scaleX;
			case 'fill':
				// 返回一个平均值，实际上 Fill 模式需要分别处理宽高
				return (scaleX + scaleY) / 2;
			default:
				return 1;
		}
	}
	
	/**
	 * 计算旋转角度
	 */
	private calculateRotation(contentSize: Size): number {
		switch (this.autoRotate) {
			case 'none':
				return 0;
			case 'left':
				return -90;
			case 'right':
				return 90;
			case 'auto': {
				// 自动旋转：当图片方向与视口方向不匹配时旋转
				const contentLandscape = SizeUtils.isLandscape(contentSize);
				const viewportLandscape = SizeUtils.isLandscape(this.viewport);
				
				if (contentLandscape !== viewportLandscape) {
					return 90;
				}
				return 0;
			}
			default:
				return 0;
		}
	}
	
	/**
	 * 计算适应视口的尺寸（Uniform 模式）
	 */
	fitToViewport(contentSize: Size): Size {
		const scale = this.calculateScaleUniform(contentSize);
		return SizeUtils.new(contentSize.width * scale, contentSize.height * scale);
	}
	
	/**
	 * 计算填充视口的尺寸（UniformToFill 模式）
	 */
	fillViewport(contentSize: Size): Size {
		const scale = this.calculateScaleFill(contentSize);
		return SizeUtils.new(contentSize.width * scale, contentSize.height * scale);
	}
	
	/**
	 * 计算 Uniform 模式的缩放比例
	 */
	private calculateScaleUniform(contentSize: Size): number {
		if (contentSize.width <= 0 || contentSize.height <= 0) {
			return 1;
		}
		const scaleX = this.viewport.width / contentSize.width;
		const scaleY = this.viewport.height / contentSize.height;
		return Math.min(scaleX, scaleY);
	}
	
	/**
	 * 计算 UniformToFill 模式的缩放比例
	 */
	private calculateScaleFill(contentSize: Size): number {
		if (contentSize.width <= 0 || contentSize.height <= 0) {
			return 1;
		}
		const scaleX = this.viewport.width / contentSize.width;
		const scaleY = this.viewport.height / contentSize.height;
		return Math.max(scaleX, scaleY);
	}
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 快捷函数：计算 Uniform 模式的缩放
 */
export function calculateUniformScale(content: Size, viewport: Size): number {
	if (content.width <= 0 || content.height <= 0) {
		return 1;
	}
	const scaleX = viewport.width / content.width;
	const scaleY = viewport.height / content.height;
	return Math.min(scaleX, scaleY);
}

/**
 * 快捷函数：计算 UniformToFill 模式的缩放
 */
export function calculateFillScale(content: Size, viewport: Size): number {
	if (content.width <= 0 || content.height <= 0) {
		return 1;
	}
	const scaleX = viewport.width / content.width;
	const scaleY = viewport.height / content.height;
	return Math.max(scaleX, scaleY);
}

/**
 * 快捷函数：适应视口
 */
export function fitToViewport(content: Size, viewport: Size): Size {
	const scale = calculateUniformScale(content, viewport);
	return SizeUtils.new(content.width * scale, content.height * scale);
}

/**
 * 快捷函数：填充视口
 */
export function fillViewport(content: Size, viewport: Size): Size {
	const scale = calculateFillScale(content, viewport);
	return SizeUtils.new(content.width * scale, content.height * scale);
}
