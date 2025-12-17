/**
 * 属性测试：imageTransitionManager
 * 
 * **Feature: image-transition-fix, Property 1: Scale calculation correctness**
 * **Validates: Requirements 1.2, 1.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateTargetScale, isLandscapeImage, type ImageDimensions, type ViewportSize } from './imageTransitionManager';
import type { ZoomMode } from '$lib/settings/settingsManager';

// 生成有效的尺寸（正整数）
const validDimension = fc.integer({ min: 1, max: 10000 });

// 生成有效的图片尺寸
const validImageDimensions = fc.record({
  width: validDimension,
  height: validDimension
});

// 生成有效的视口尺寸
const validViewportSize = fc.record({
  width: validDimension,
  height: validDimension
});

// 生成缩放模式
const zoomModes: ZoomMode[] = ['fit', 'fill', 'fitWidth', 'fitHeight', 'original', 'fitLeftAlign', 'fitRightAlign'];
const validZoomMode = fc.constantFrom(...zoomModes);

describe('calculateTargetScale', () => {
  /**
   * **Feature: image-transition-fix, Property 1: Scale calculation correctness**
   * **Validates: Requirements 1.2, 1.4**
   * 
   * *For any* valid image dimensions and viewport size, the calculated scale
   * SHALL produce a value that ensures the image fits within the viewport
   * according to the specified zoom mode.
   */
  it('should calculate correct scale for fit mode - image fits within viewport', () => {
    fc.assert(
      fc.property(validImageDimensions, validViewportSize, (dims, viewport) => {
        const scale = calculateTargetScale(dims, viewport, 'fit');
        
        // 缩放后的尺寸
        const scaledWidth = dims.width * scale;
        const scaledHeight = dims.height * scale;
        
        // fit 模式：图片应该完全在视口内（允许小误差）
        expect(scaledWidth).toBeLessThanOrEqual(viewport.width + 0.001);
        expect(scaledHeight).toBeLessThanOrEqual(viewport.height + 0.001);
        
        // 至少有一边应该接近视口边界
        const touchesWidth = Math.abs(scaledWidth - viewport.width) < 0.001;
        const touchesHeight = Math.abs(scaledHeight - viewport.height) < 0.001;
        expect(touchesWidth || touchesHeight).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should calculate correct scale for fill mode - image covers viewport', () => {
    fc.assert(
      fc.property(validImageDimensions, validViewportSize, (dims, viewport) => {
        const scale = calculateTargetScale(dims, viewport, 'fill');
        
        // 缩放后的尺寸
        const scaledWidth = dims.width * scale;
        const scaledHeight = dims.height * scale;
        
        // fill 模式：图片应该覆盖整个视口（允许小误差）
        expect(scaledWidth).toBeGreaterThanOrEqual(viewport.width - 0.001);
        expect(scaledHeight).toBeGreaterThanOrEqual(viewport.height - 0.001);
      }),
      { numRuns: 100 }
    );
  });

  it('should calculate correct scale for fitWidth mode', () => {
    fc.assert(
      fc.property(validImageDimensions, validViewportSize, (dims, viewport) => {
        const scale = calculateTargetScale(dims, viewport, 'fitWidth');
        
        // 缩放后的宽度应该等于视口宽度
        const scaledWidth = dims.width * scale;
        expect(Math.abs(scaledWidth - viewport.width)).toBeLessThan(0.001);
      }),
      { numRuns: 100 }
    );
  });

  it('should calculate correct scale for fitHeight mode', () => {
    fc.assert(
      fc.property(validImageDimensions, validViewportSize, (dims, viewport) => {
        const scale = calculateTargetScale(dims, viewport, 'fitHeight');
        
        // 缩放后的高度应该等于视口高度
        const scaledHeight = dims.height * scale;
        expect(Math.abs(scaledHeight - viewport.height)).toBeLessThan(0.001);
      }),
      { numRuns: 100 }
    );
  });

  it('should return 1 for original mode', () => {
    fc.assert(
      fc.property(validImageDimensions, validViewportSize, (dims, viewport) => {
        const scale = calculateTargetScale(dims, viewport, 'original');
        expect(scale).toBe(1);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: image-transition-fix, Property 2: Fallback scale safety**
   * **Validates: Requirements 1.3, 2.2**
   * 
   * *For any* scenario where image dimensions are unavailable (null or zero),
   * the scale calculation SHALL return 1.0 as a safe default.
   */
  it('should return 1 when dimensions are invalid', () => {
    const invalidDims = [
      { width: 0, height: 100 },
      { width: 100, height: 0 },
      { width: 0, height: 0 }
    ];
    
    const validViewport = { width: 800, height: 600 };
    
    for (const dims of invalidDims) {
      for (const mode of zoomModes) {
        const scale = calculateTargetScale(dims, validViewport, mode);
        expect(scale).toBe(1);
      }
    }
  });

  it('should return 1 when viewport is invalid', () => {
    const validDims = { width: 1920, height: 1080 };
    const invalidViewports = [
      { width: 0, height: 600 },
      { width: 800, height: 0 },
      { width: 0, height: 0 }
    ];
    
    for (const viewport of invalidViewports) {
      for (const mode of zoomModes) {
        const scale = calculateTargetScale(validDims, viewport, mode);
        expect(scale).toBe(1);
      }
    }
  });

  it('should always return positive scale', () => {
    fc.assert(
      fc.property(validImageDimensions, validViewportSize, validZoomMode, (dims, viewport, mode) => {
        const scale = calculateTargetScale(dims, viewport, mode);
        expect(scale).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});

describe('isLandscapeImage', () => {
  it('should correctly identify landscape images', () => {
    fc.assert(
      fc.property(validImageDimensions, (dims) => {
        const isLandscape = isLandscapeImage(dims);
        expect(isLandscape).toBe(dims.width > dims.height);
      }),
      { numRuns: 100 }
    );
  });
});
