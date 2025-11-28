/**
 * PageFrameManager - 页面帧管理器
 * 
 * 核心功能：
 * 1. 根据虚拟页面列表创建页面帧
 * 2. 支持单页/双页模式
 * 3. 处理首页/尾页特殊显示
 * 4. 支持插入空白页
 * 
 * 参考 NeeView 的 PageFrameFactory
 */

import type {
  PageFrame,
  PageFrameElement,
  PageFrameConfig,
  PagePosition,
  PageRange,
  PageTerminal,
  VirtualPage,
  Size,
} from './types';
import {
  defaultPageFrameConfig,
  PagePositionEmpty,
  isPagePositionEmpty,
  createPageRangeForOnePage,
  getPageRangeNext,
  pageRangeContains,
  isPageRangeEmpty,
} from './types';
import type { VirtualPageList } from './virtualPageList';

// ============================================================================
// 辅助函数
// ============================================================================

function generateFrameId(): string {
  return `frame-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function isLandscape(size: Size): boolean {
  return size.width > size.height;
}

function mergePageRanges(ranges: PageRange[]): PageRange {
  if (ranges.length === 0) {
    return { min: PagePositionEmpty, max: PagePositionEmpty };
  }

  let minIndex = Infinity;
  let minPart = 0;
  let maxIndex = -Infinity;
  let maxPart = 0;

  for (const range of ranges) {
    if (isPageRangeEmpty(range)) continue;

    const minValue = range.min.index * 2 + range.min.part;
    const maxValue = range.max.index * 2 + range.max.part;

    if (minValue < minIndex * 2 + minPart) {
      minIndex = range.min.index;
      minPart = range.min.part;
    }
    if (maxValue > maxIndex * 2 + maxPart) {
      maxIndex = range.max.index;
      maxPart = range.max.part;
    }
  }

  if (minIndex === Infinity) {
    return { min: PagePositionEmpty, max: PagePositionEmpty };
  }

  return {
    min: { index: minIndex, part: minPart as 0 | 1 },
    max: { index: maxIndex, part: maxPart as 0 | 1 },
  };
}

// ============================================================================
// PageFrameManager
// ============================================================================

export class PageFrameManager {
  private _virtualPageList: VirtualPageList;
  private _config: PageFrameConfig;
  private _frameCache: Map<string, PageFrame> = new Map();

  constructor(virtualPageList: VirtualPageList, config: Partial<PageFrameConfig> = {}) {
    this._virtualPageList = virtualPageList;
    this._config = { ...defaultPageFrameConfig, ...config };
  }

  // ============================================================================
  // 配置
  // ============================================================================

  get config(): PageFrameConfig {
    return { ...this._config };
  }

  setConfig(config: Partial<PageFrameConfig>): void {
    this._config = { ...this._config, ...config };
    this.clearCache();
  }

  setVirtualPageList(list: VirtualPageList): void {
    this._virtualPageList = list;
    this.clearCache();
  }

  clearCache(): void {
    this._frameCache.clear();
  }

  // ============================================================================
  // 帧创建
  // ============================================================================

  /**
   * 创建页面帧
   * @param position 起始位置
   * @param direction 创建方向 (1=向后, -1=向前)
   */
  createFrame(position: PagePosition, direction: 1 | -1): PageFrame | null {
    // 验证位置
    if (!this._config.isLoop && !this._virtualPageList.isValidVirtualIndex(position.index)) {
      return null;
    }

    // 修正位置
    const fixedPosition = this.fixFramePosition(position, direction);
    if (isPagePositionEmpty(fixedPosition)) {
      return null;
    }

    // 检查缓存
    const cacheKey = `${fixedPosition.index}-${fixedPosition.part}-${direction}`;
    if (this._frameCache.has(cacheKey)) {
      return this._frameCache.get(cacheKey)!;
    }

    // 创建帧
    const frame = this.buildFrame(fixedPosition, direction);
    if (frame) {
      this._frameCache.set(cacheKey, frame);
    }

    return frame;
  }

  /**
   * 获取帧的下一页
   */
  getNextPage(frame: PageFrame, direction: 1 | -1): VirtualPage | null {
    const nextPos = getPageRangeNext(frame.frameRange, direction);
    if (isPagePositionEmpty(nextPos)) return null;

    const nextPage = this._virtualPageList.getVirtualPage(nextPos.index);
    if (!nextPage) return null;

    // 检查是否已在帧中
    if (frame.elements.some(e => e.virtualPage.virtualIndex === nextPage.virtualIndex)) {
      return null;
    }

    return nextPage;
  }

  /**
   * 获取首帧范围
   */
  getFirstTerminalRange(): PageRange {
    return {
      min: { index: -1, part: 0 },
      max: { index: -1, part: 1 },
    };
  }

  /**
   * 获取尾帧范围
   */
  getLastTerminalRange(): PageRange {
    const count = this._virtualPageList.length;
    return {
      min: { index: count, part: 0 },
      max: { index: count, part: 1 },
    };
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 修正帧起始位置
   */
  private fixFramePosition(position: PagePosition, direction: 1 | -1): PagePosition {
    const page = this._virtualPageList.getVirtualPage(position.index);
    if (!page) return PagePositionEmpty;

    // 如果支持分割且是横向页面，保持原位置
    if (
      this._config.framePageSize === 1 &&
      page.isDivided
    ) {
      return position;
    }

    // 否则修正到页面边界
    return {
      index: position.index,
      part: direction < 0 ? 1 : 0,
    };
  }

  /**
   * 构建页面帧
   */
  private buildFrame(position: PagePosition, direction: 1 | -1): PageFrame | null {
    const element1 = this.createElement(position, direction);
    if (!element1) return null;

    // 单页模式
    if (this._config.framePageSize === 1) {
      return this.createSingleFrame(element1, direction);
    }

    // 双页模式
    const virtualPage = element1.virtualPage;

    // 横向页面视为双页
    if (this._config.supportWidePage && isLandscape(virtualPage.physicalPage.size)) {
      return this.createSingleFrame(element1, direction);
    }

    // 首页单独显示
    if (this._config.singleFirstPage && position.index === 0) {
      return this.createSingleFrame(element1, direction);
    }

    // 尾页单独显示
    if (this._config.singleLastPage && position.index === this._virtualPageList.length - 1) {
      return this.createSingleFrame(element1, direction);
    }

    // 尝试获取第二页
    const nextIndex = position.index + direction;
    const nextPage = this._virtualPageList.getVirtualPage(nextIndex);

    if (!nextPage) {
      // 没有第二页
      if (this._config.insertDummyPage) {
        return this.createWideFrameWithDummy(element1, direction);
      }
      return this.createSingleFrame(element1, direction);
    }

    // 第二页也是横向，不合并
    if (this._config.supportWidePage && isLandscape(nextPage.physicalPage.size)) {
      return this.createSingleFrame(element1, direction);
    }

    // 第二页是首页/尾页，不合并
    if (this._config.singleFirstPage && nextIndex === 0) {
      return this.createSingleFrame(element1, direction);
    }
    if (this._config.singleLastPage && nextIndex === this._virtualPageList.length - 1) {
      return this.createSingleFrame(element1, direction);
    }

    // 创建双页帧
    const element2 = this.createElement({ index: nextIndex, part: 0 }, direction);
    if (!element2) {
      return this.createSingleFrame(element1, direction);
    }

    return this.createWideFrame(element1, element2, direction);
  }

  /**
   * 创建页面帧元素
   */
  private createElement(position: PagePosition, direction: 1 | -1): PageFrameElement | null {
    const virtualPage = this._virtualPageList.getVirtualPage(position.index);
    if (!virtualPage) return null;

    const pageRange = createPageRangeForOnePage(position, direction);

    // 如果是分割页面，调整范围
    let adjustedRange = pageRange;
    if (virtualPage.isDivided) {
      adjustedRange = {
        min: { index: position.index, part: virtualPage.part },
        max: { index: position.index, part: virtualPage.part },
      };
    }

    const rawSize = this.getElementRawSize(virtualPage);

    return {
      virtualPage,
      scale: 1,
      offset: { x: 0, y: 0 },
      isDummy: false,
      rawSize,
      pageRange: adjustedRange,
    };
  }

  /**
   * 获取元素原始尺寸
   */
  private getElementRawSize(virtualPage: VirtualPage): Size {
    if (virtualPage.cropRect) {
      return {
        width: virtualPage.cropRect.width,
        height: virtualPage.cropRect.height,
      };
    }
    return virtualPage.physicalPage.size;
  }

  /**
   * 创建单页帧
   */
  private createSingleFrame(element: PageFrameElement, direction: 1 | -1): PageFrame {
    const terminal = this.getTerminal(element.pageRange);

    return {
      id: generateFrameId(),
      elements: [element],
      frameRange: element.pageRange,
      direction,
      size: element.rawSize,
      stretchedSize: element.rawSize,
      terminal,
    };
  }

  /**
   * 创建带空白页的双页帧
   */
  private createWideFrameWithDummy(element: PageFrameElement, direction: 1 | -1): PageFrame {
    if (!this.canInsertDummyPage(element)) {
      return this.createSingleFrame(element, direction);
    }

    const dummyElement: PageFrameElement = {
      ...element,
      isDummy: true,
    };

    return this.createWideFrame(element, dummyElement, direction);
  }

  /**
   * 检查是否可以插入空白页
   */
  private canInsertDummyPage(element: PageFrameElement): boolean {
    if (!this._config.insertDummyPage) return false;
    if (this._virtualPageList.length < 2) return false;

    const index = element.virtualPage.virtualIndex;

    // 首页
    if (index === 0) {
      return this._config.singleFirstPage;
    }

    // 尾页
    if (index === this._virtualPageList.length - 1) {
      return this._config.singleLastPage;
    }

    return true;
  }

  /**
   * 创建双页帧
   */
  private createWideFrame(
    element1: PageFrameElement,
    element2: PageFrameElement,
    direction: 1 | -1
  ): PageFrame {
    // 根据方向排列元素
    const elements = direction > 0 ? [element1, element2] : [element2, element1];

    // 根据阅读方向调整
    const orderedElements = this._config.readOrder === 'rtl'
      ? elements.reverse()
      : elements;

    // 计算帧范围
    const frameRange = mergePageRanges(orderedElements.map(e => e.pageRange));

    // 计算帧尺寸 (两页并排)
    const scales = this.calcContentScale(orderedElements.map(e => e.rawSize));
    
    // 应用缩放
    const scaledElements = orderedElements.map((e, i) => ({
      ...e,
      scale: scales[i],
    }));

    // 计算总尺寸
    const totalWidth = scaledElements.reduce((sum, e) => sum + e.rawSize.width * e.scale, 0);
    const maxHeight = Math.max(...scaledElements.map(e => e.rawSize.height * e.scale));

    // 计算偏移
    let offsetX = 0;
    for (const e of scaledElements) {
      e.offset = { x: offsetX, y: 0 };
      offsetX += e.rawSize.width * e.scale;
    }

    const terminal = this.getTerminal(frameRange);

    return {
      id: generateFrameId(),
      elements: scaledElements,
      frameRange,
      direction,
      size: { width: totalWidth, height: maxHeight },
      stretchedSize: { width: totalWidth, height: maxHeight },
      terminal,
    };
  }

  /**
   * 计算内容缩放 (使两页高度一致)
   */
  private calcContentScale(sizes: Size[]): number[] {
    if (sizes.length === 0) return [];
    if (sizes.length === 1) return [1];

    // 找到最大高度
    const maxHeight = Math.max(...sizes.map(s => s.height));

    // 计算每个元素的缩放比例
    return sizes.map(s => maxHeight / s.height);
  }

  /**
   * 获取终端标记
   */
  private getTerminal(range: PageRange): PageTerminal {
    if (this._config.isLoop) return 0;

    const firstPos = this._virtualPageList.firstPosition();
    const lastPos = this._virtualPageList.lastPosition();

    let terminal = 0;

    if (pageRangeContains(range, firstPos)) {
      terminal |= 1; // First
    }
    if (pageRangeContains(range, lastPos)) {
      terminal |= 2; // Last
    }

    return terminal as PageTerminal;
  }

  // ============================================================================
  // 导航辅助
  // ============================================================================

  /**
   * 获取指定位置的帧，如果不存在则创建
   */
  getOrCreateFrame(virtualIndex: number, direction: 1 | -1 = 1): PageFrame | null {
    const position: PagePosition = { index: virtualIndex, part: 0 };
    return this.createFrame(position, direction);
  }

  /**
   * 获取下一帧
   */
  getNextFrame(currentFrame: PageFrame, direction: 1 | -1): PageFrame | null {
    const nextPos = getPageRangeNext(currentFrame.frameRange, direction);
    if (isPagePositionEmpty(nextPos)) return null;

    // 检查边界
    if (!this._config.isLoop) {
      if (nextPos.index < 0 || nextPos.index >= this._virtualPageList.length) {
        return null;
      }
    }

    return this.createFrame(nextPos, direction);
  }

  /**
   * 获取帧序列
   */
  getFrameSequence(startIndex: number, count: number, direction: 1 | -1): PageFrame[] {
    const frames: PageFrame[] = [];
    let currentPos: PagePosition = { index: startIndex, part: direction > 0 ? 0 : 1 };

    for (let i = 0; i < count; i++) {
      const frame = this.createFrame(currentPos, direction);
      if (!frame) break;

      frames.push(frame);
      currentPos = getPageRangeNext(frame.frameRange, direction);

      if (isPagePositionEmpty(currentPos)) break;
      if (!this._config.isLoop) {
        if (currentPos.index < 0 || currentPos.index >= this._virtualPageList.length) {
          break;
        }
      }
    }

    return frames;
  }
}
