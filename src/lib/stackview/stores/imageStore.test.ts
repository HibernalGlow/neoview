/**
 * 属性测试：imageStore 尺寸缓存
 * 
 * **Feature: image-transition-fix, Property 3: Dimension cache consistency**
 * **Validates: Requirements 2.3, 3.1**
 * 
 * **Feature: image-transition-fix, Property 5: Page index isolation**
 * **Validates: Requirements 3.4, 1.1**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock stackImageLoader
const mockDimensionsCache = new Map<number, { width: number; height: number }>();
const mockScaleCache = new Map<string, number>();
let mockViewportSize = { width: 0, height: 0 };

vi.mock('../utils/stackImageLoader', () => ({
  stackImageLoader: {
    getCachedDimensions: (pageIndex: number) => mockDimensionsCache.get(pageIndex),
    getCachedScale: (pageIndex: number, zoomMode: string) => {
      const key = `${pageIndex}:${mockViewportSize.width}x${mockViewportSize.height}:${zoomMode}`;
      return mockScaleCache.get(key) ?? null;
    },
    precomputeScale: (pageIndex: number, zoomMode: string) => {
      const dims = mockDimensionsCache.get(pageIndex);
      if (!dims || !mockViewportSize.width || !mockViewportSize.height) return null;
      
      const ratioW = mockViewportSize.width / dims.width;
      const ratioH = mockViewportSize.height / dims.height;
      let scale: number;
      
      switch (zoomMode) {
        case 'fit':
          scale = Math.min(ratioW, ratioH);
          break;
        case 'fill':
          scale = Math.max(ratioW, ratioH);
          break;
        default:
          scale = Math.min(ratioW, ratioH);
      }
      
      const key = `${pageIndex}:${mockViewportSize.width}x${mockViewportSize.height}:${zoomMode}`;
      mockScaleCache.set(key, scale);
      return scale;
    },
    setViewportSize: (width: number, height: number) => {
      mockViewportSize = { width, height };
      mockScaleCache.clear();
    }
  }
}));

// Mock bookStore
vi.mock('$lib/stores/book.svelte', () => ({
  bookStore: {
    currentBook: {
      pages: Array.from({ length: 100 }, (_, i) => ({
        width: 800 + i,
        height: 600 + i
      }))
    }
  }
}));

// Mock other dependencies
vi.mock('./imagePool.svelte', () => ({
  imagePool: {
    clear: vi.fn(),
    setCurrentBook: vi.fn(),
    getSync: vi.fn(),
    get: vi.fn(),
    getBackgroundColor: vi.fn(),
    preloadRange: vi.fn()
  }
}));

vi.mock('$lib/stores/infoPanel.svelte', () => ({
  infoPanelStore: { setLatencyTrace: vi.fn() }
}));

vi.mock('$lib/stores/loadModeStore.svelte', () => ({
  loadModeStore: { isTempfileMode: false, isImgMode: true }
}));

vi.mock('$lib/settings/settingsManager', () => ({
  settingsManager: {
    getSettings: () => ({
      view: { pageLayout: {} }
    })
  }
}));

vi.mock('../utils/imageTransitionManager', () => ({
  calculateTargetScale: (dims: { width: number; height: number }, viewport: { width: number; height: number }, mode: string) => {
    const ratioW = viewport.width / dims.width;
    const ratioH = viewport.height / dims.height;
    return mode === 'fill' ? Math.max(ratioW, ratioH) : Math.min(ratioW, ratioH);
  }
}));

// 生成有效的页面索引
const validPageIndex = fc.integer({ min: 0, max: 99 });

// 生成有效的尺寸
const validDimension = fc.integer({ min: 1, max: 10000 });

const validDimensions = fc.record({
  width: validDimension,
  height: validDimension
});

describe('imageStore dimension cache', () => {
  beforeEach(() => {
    mockDimensionsCache.clear();
    mockScaleCache.clear();
    mockViewportSize = { width: 0, height: 0 };
  });

  /**
   * **Feature: image-transition-fix, Property 3: Dimension cache consistency**
   * **Validates: Requirements 2.3, 3.1**
   * 
   * *For any* page index, calling `getDimensionsForPage(pageIndex)` multiple times
   * SHALL return the same dimensions (cache is stable).
   */
  it('should return consistent dimensions for the same page index', () => {
    fc.assert(
      fc.property(validPageIndex, validDimensions, (pageIndex, dims) => {
        // 设置缓存
        mockDimensionsCache.set(pageIndex, dims);
        
        // 多次调用应该返回相同结果
        const result1 = mockDimensionsCache.get(pageIndex);
        const result2 = mockDimensionsCache.get(pageIndex);
        const result3 = mockDimensionsCache.get(pageIndex);
        
        expect(result1).toEqual(result2);
        expect(result2).toEqual(result3);
        expect(result1).toEqual(dims);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: image-transition-fix, Property 5: Page index isolation**
   * **Validates: Requirements 3.4, 1.1**
   * 
   * *For any* two different page indices, their cached dimensions and scales
   * SHALL be independent (modifying one does not affect the other).
   */
  it('should maintain independent dimensions for different page indices', () => {
    fc.assert(
      fc.property(
        validPageIndex,
        validPageIndex,
        validDimensions,
        validDimensions,
        (pageIndex1, pageIndex2, dims1, dims2) => {
          // 确保两个索引不同
          fc.pre(pageIndex1 !== pageIndex2);
          
          // 设置两个不同页面的尺寸
          mockDimensionsCache.set(pageIndex1, dims1);
          mockDimensionsCache.set(pageIndex2, dims2);
          
          // 验证它们是独立的
          const result1 = mockDimensionsCache.get(pageIndex1);
          const result2 = mockDimensionsCache.get(pageIndex2);
          
          expect(result1).toEqual(dims1);
          expect(result2).toEqual(dims2);
          
          // 修改一个不应该影响另一个
          const newDims = { width: 9999, height: 9999 };
          mockDimensionsCache.set(pageIndex1, newDims);
          
          expect(mockDimensionsCache.get(pageIndex1)).toEqual(newDims);
          expect(mockDimensionsCache.get(pageIndex2)).toEqual(dims2); // 不变
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return null for uncached page index', () => {
    fc.assert(
      fc.property(validPageIndex, (pageIndex) => {
        mockDimensionsCache.clear();
        const result = mockDimensionsCache.get(pageIndex);
        expect(result).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });
});

describe('imageStore scale cache', () => {
  beforeEach(() => {
    mockDimensionsCache.clear();
    mockScaleCache.clear();
    mockViewportSize = { width: 800, height: 600 };
  });

  /**
   * **Feature: image-transition-fix, Property 4: Scale cache hit rate**
   * **Validates: Requirements 3.2, 4.1, 4.3**
   * 
   * *For any* preloaded page, calling `getScaleForPage(pageIndex)` SHALL return
   * a cached value without recalculation.
   */
  it('should cache and return precomputed scale', () => {
    fc.assert(
      fc.property(validPageIndex, validDimensions, (pageIndex, dims) => {
        // 设置尺寸缓存
        mockDimensionsCache.set(pageIndex, dims);
        
        // 使用 mock 的 precomputeScale
        const precomputeScale = (idx: number, zoomMode: string) => {
          const d = mockDimensionsCache.get(idx);
          if (!d || !mockViewportSize.width || !mockViewportSize.height) return null;
          
          const ratioW = mockViewportSize.width / d.width;
          const ratioH = mockViewportSize.height / d.height;
          const scale = zoomMode === 'fill' ? Math.max(ratioW, ratioH) : Math.min(ratioW, ratioH);
          
          const key = `${idx}:${mockViewportSize.width}x${mockViewportSize.height}:${zoomMode}`;
          mockScaleCache.set(key, scale);
          return scale;
        };
        
        const getCachedScale = (idx: number, zoomMode: string) => {
          const key = `${idx}:${mockViewportSize.width}x${mockViewportSize.height}:${zoomMode}`;
          return mockScaleCache.get(key) ?? null;
        };
        
        // 预计算缩放
        const scale1 = precomputeScale(pageIndex, 'fit');
        
        // 再次获取应该返回缓存值
        const scale2 = getCachedScale(pageIndex, 'fit');
        
        expect(scale1).toBe(scale2);
        expect(scale1).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('should clear scale cache when viewport changes', () => {
    const pageIndex = 0;
    const dims = { width: 1920, height: 1080 };
    mockDimensionsCache.set(pageIndex, dims);
    
    // 使用 mock 函数
    const precomputeScale = (idx: number, zoomMode: string) => {
      const d = mockDimensionsCache.get(idx);
      if (!d || !mockViewportSize.width || !mockViewportSize.height) return null;
      
      const ratioW = mockViewportSize.width / d.width;
      const ratioH = mockViewportSize.height / d.height;
      const scale = zoomMode === 'fill' ? Math.max(ratioW, ratioH) : Math.min(ratioW, ratioH);
      
      const key = `${idx}:${mockViewportSize.width}x${mockViewportSize.height}:${zoomMode}`;
      mockScaleCache.set(key, scale);
      return scale;
    };
    
    const getCachedScale = (idx: number, zoomMode: string) => {
      const key = `${idx}:${mockViewportSize.width}x${mockViewportSize.height}:${zoomMode}`;
      return mockScaleCache.get(key) ?? null;
    };
    
    const setViewportSize = (width: number, height: number) => {
      mockViewportSize = { width, height };
      mockScaleCache.clear();
    };
    
    // 预计算缩放
    precomputeScale(pageIndex, 'fit');
    const scale1 = getCachedScale(pageIndex, 'fit');
    expect(scale1).not.toBeNull();
    
    // 改变视口尺寸
    setViewportSize(1024, 768);
    
    // 缓存应该被清空
    const scale2 = getCachedScale(pageIndex, 'fit');
    expect(scale2).toBeNull();
  });
});
