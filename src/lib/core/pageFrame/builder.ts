/**
 * PageFrameBuilder - 页面帧构建器
 * 
 * 翻译自 Rust 后端的 builder.rs
 * 根据配置构建页面帧，处理分割和双页逻辑
 * 
 * 核心功能：
 * - 构建单页/双页帧
 * - 计算下一帧/上一帧位置
 * - 虚拟页面索引转换
 */

import type { Page, PagePosition, PageFrame, PageFrameElement } from './types';
import { 
	Page as PageUtils,
	PagePosition as PagePositionUtils,
	PageRange,
	PageFrameElement as PageFrameElementUtils,
	PageFrame as PageFrameUtils
} from './types';
import type { PageFrameContext } from './context';
import { PageFrameContextUtils } from './context';

/**
 * 页面帧构建器
 * 
 * 根据页面列表和配置构建页面帧
 */
export class PageFrameBuilder {
	/** 页面列表 */
	private pages: Page[];
	/** 上下文配置 */
	private context: PageFrameContext;
	/** 缓存：每个页面是否应该分割 */
	private splitCache: boolean[];
	
	constructor(pages: Page[], context: PageFrameContext) {
		this.pages = pages;
		this.context = context;
		this.splitCache = pages.map(p => PageUtils.shouldSplit(p, context.dividePageRate));
	}
	
	/** 更新上下文配置 */
	setContext(context: PageFrameContext): void {
		this.splitCache = this.pages.map(p => PageUtils.shouldSplit(p, context.dividePageRate));
		this.context = context;
	}
	
	/** 更新页面列表 */
	setPages(pages: Page[]): void {
		this.splitCache = pages.map(p => PageUtils.shouldSplit(p, this.context.dividePageRate));
		this.pages = pages;
	}
	
	/** 获取页面数量 */
	pageCount(): number {
		return this.pages.length;
	}
	
	/** 获取页面 */
	getPage(index: number): Page | undefined {
		return this.pages[index];
	}
	
	/** 检查页面是否应该分割 */
	isPageSplit(index: number): boolean {
		// 只有在单页模式且启用分割时才分割
		if (!PageFrameContextUtils.isSingleMode(this.context) || !this.context.isSupportedDividePage) {
			return false;
		}
		return this.splitCache[index] ?? false;
	}
	
	/** 检查页面是否为横向 */
	isPageLandscape(index: number): boolean {
		const page = this.pages[index];
		return page ? PageUtils.isLandscape(page) : false;
	}
	
	/**
	 * 构建指定位置的帧
	 */
	buildFrame(position: PagePosition): PageFrame | null {
		if (position.index >= this.pages.length) {
			return null;
		}
		
		if (this.context.pageMode === 'single') {
			return this.buildSingleFrame(position);
		} else {
			return this.buildDoubleFrame(position);
		}
	}
	
	/**
	 * 构建单页帧
	 */
	private buildSingleFrame(position: PagePosition): PageFrame | null {
		const page = this.pages[position.index];
		if (!page) return null;
		
		const isSplit = this.isPageSplit(position.index);
		const direction = PageFrameContextUtils.direction(this.context);
		
		let element: PageFrameElement;
		
		if (isSplit) {
			// 分割页面
			if (position.part === 0) {
				// 根据阅读方向决定先显示哪半
				if (PageFrameContextUtils.isRtl(this.context)) {
					// RTL: 先显示右半
					element = PageFrameElementUtils.rightHalf(page, PageRange.rightHalf(position.index));
				} else {
					// LTR: 先显示左半
					element = PageFrameElementUtils.leftHalf(page, PageRange.leftHalf(position.index));
				}
			} else {
				// 第二半
				if (PageFrameContextUtils.isRtl(this.context)) {
					element = PageFrameElementUtils.leftHalf(page, PageRange.leftHalf(position.index));
				} else {
					element = PageFrameElementUtils.rightHalf(page, PageRange.rightHalf(position.index));
				}
			}
		} else {
			// 完整页面
			element = PageFrameElementUtils.full(page, PageRange.fullPage(position.index));
		}
		
		return PageFrameUtils.single(element, direction);
	}
	
	/**
	 * 构建双页帧
	 * 
	 * 按照 NeeView 的 CreatePageFrame 逻辑：
	 * 1. 当前页横向 → 独占
	 * 2. 下一页横向 → 当前页独占
	 * 3. 首页/尾页检查
	 * 4. 正常双页
	 */
	private buildDoubleFrame(position: PagePosition): PageFrame | null {
		const page = this.pages[position.index];
		if (!page) return null;
		
		const direction = PageFrameContextUtils.direction(this.context);
		
		// 1. 当前页横向 → 独占
		if (this.context.isSupportedWidePage && PageUtils.isLandscape(page)) {
			const element = PageFrameElementUtils.full(page, PageRange.fullPage(position.index));
			return PageFrameUtils.single(element, direction);
		}
		
		// 2. 获取下一页
		const nextIndex = position.index + 1;
		if (nextIndex >= this.pages.length) {
			// 没有下一页，当前页独占
			const element = PageFrameElementUtils.full(page, PageRange.fullPage(position.index));
			return PageFrameUtils.single(element, direction);
		}
		
		const nextPage = this.pages[nextIndex];
		if (!nextPage) {
			const element = PageFrameElementUtils.full(page, PageRange.fullPage(position.index));
			return PageFrameUtils.single(element, direction);
		}
		
		// 3. 下一页横向 → 当前页独占
		if (this.context.isSupportedWidePage && PageUtils.isLandscape(nextPage)) {
			const element = PageFrameElementUtils.full(page, PageRange.fullPage(position.index));
			return PageFrameUtils.single(element, direction);
		}
		
		// 4. 首页/尾页单独显示
		const isFirst = position.index === 0 || nextIndex === 0;
		const isLast = position.index === this.pages.length - 1 || nextIndex === this.pages.length - 1;
		
		if ((this.context.isSupportedSingleFirst && isFirst) ||
			(this.context.isSupportedSingleLast && isLast)) {
			const element = PageFrameElementUtils.full(page, PageRange.fullPage(position.index));
			return PageFrameUtils.single(element, direction);
		}
		
		// 5. 正常双页
		const e1 = PageFrameElementUtils.full(page, PageRange.fullPage(position.index));
		const e2 = PageFrameElementUtils.full(nextPage, PageRange.fullPage(nextIndex));
		
		return PageFrameUtils.doubleAligned(e1, e2, direction, this.context.widePageStretch);
	}
	
	/**
	 * 检查页面是否应该单独显示
	 */
	private shouldDisplayAlone(index: number): boolean {
		const page = this.pages[index];
		if (!page) return true;
		
		// 横向页面独占
		if (this.context.isSupportedWidePage && PageUtils.isLandscape(page)) {
			return true;
		}
		
		// 首页单独显示
		if (this.context.isSupportedSingleFirst && index === 0) {
			return true;
		}
		
		// 末页单独显示
		if (this.context.isSupportedSingleLast && index === this.pages.length - 1) {
			return true;
		}
		
		return false;
	}
	
	/**
	 * 检查两个页面是否应该组成双页
	 */
	private canFormDoublePage(index: number, nextIndex: number): boolean {
		const page = this.pages[index];
		if (!page) return false;
		
		// 当前页横向 → 不能组成双页
		if (this.context.isSupportedWidePage && PageUtils.isLandscape(page)) {
			return false;
		}
		
		const nextPage = this.pages[nextIndex];
		if (!nextPage) return false;
		
		// 下一页横向 → 不能组成双页
		if (this.context.isSupportedWidePage && PageUtils.isLandscape(nextPage)) {
			return false;
		}
		
		// 首页/尾页检查
		const isFirst = index === 0 || nextIndex === 0;
		const isLast = index === this.pages.length - 1 || nextIndex === this.pages.length - 1;
		
		if ((this.context.isSupportedSingleFirst && isFirst) ||
			(this.context.isSupportedSingleLast && isLast)) {
			return false;
		}
		
		return true;
	}
	
	/**
	 * 获取下一帧位置
	 */
	nextFramePosition(current: PagePosition): PagePosition | null {
		const isSplit = this.isPageSplit(current.index);
		
		if (this.context.pageMode === 'single') {
			if (isSplit && current.part === 0) {
				// 分割页面的第一半 -> 第二半
				return PagePositionUtils.new(current.index, 1);
			} else if (current.index + 1 < this.pages.length) {
				// 下一页
				return PagePositionUtils.new(current.index + 1, 0);
			}
			return null;
		} else {
			// 双页模式：计算当前帧的步长
			const step = this.getFrameStep(current.index);
			const nextIndex = current.index + step;
			if (nextIndex < this.pages.length) {
				return PagePositionUtils.new(nextIndex, 0);
			}
			return null;
		}
	}
	
	/**
	 * 获取上一帧位置
	 */
	prevFramePosition(current: PagePosition): PagePosition | null {
		if (this.context.pageMode === 'single') {
			const isSplit = this.isPageSplit(current.index);
			if (isSplit && current.part === 1) {
				// 分割页面的第二半 -> 第一半
				return PagePositionUtils.new(current.index, 0);
			} else if (current.index > 0) {
				// 上一页
				const prevIndex = current.index - 1;
				const prevSplit = this.isPageSplit(prevIndex);
				return PagePositionUtils.new(prevIndex, prevSplit ? 1 : 0);
			}
			return null;
		} else {
			// 双页模式
			if (current.index === 0) {
				return null;
			}
			
			const prevIndex = current.index - 1;
			
			// 如果上一页应该单独显示，直接返回
			if (this.shouldDisplayAlone(prevIndex)) {
				return PagePositionUtils.new(prevIndex, 0);
			}
			
			// 检查上一页是否是双页帧的第二页
			if (prevIndex > 0 && this.canFormDoublePage(prevIndex - 1, prevIndex)) {
				return PagePositionUtils.new(prevIndex - 1, 0);
			}
			
			return PagePositionUtils.new(prevIndex, 0);
		}
	}
	
	/**
	 * 获取帧的步长（双页模式下）
	 */
	private getFrameStep(index: number): number {
		const page = this.pages[index];
		if (!page) return 1;
		
		// 1. 当前页横向 → 步进 1
		if (this.context.isSupportedWidePage && PageUtils.isLandscape(page)) {
			return 1;
		}
		
		// 2. 没有下一页 → 步进 1
		const nextIndex = index + 1;
		if (nextIndex >= this.pages.length) {
			return 1;
		}
		
		const nextPage = this.pages[nextIndex];
		if (!nextPage) return 1;
		
		// 3. 下一页横向 → 步进 1
		if (this.context.isSupportedWidePage && PageUtils.isLandscape(nextPage)) {
			return 1;
		}
		
		// 4. 首页/尾页单独显示
		const isFirst = index === 0 || nextIndex === 0;
		const isLast = index === this.pages.length - 1 || nextIndex === this.pages.length - 1;
		
		if ((this.context.isSupportedSingleFirst && isFirst) ||
			(this.context.isSupportedSingleLast && isLast)) {
			return 1;
		}
		
		// 5. 正常双页 → 步进 2
		return 2;
	}
	
	/**
	 * 计算总虚拟页数
	 */
	totalVirtualPages(): number {
		if (!PageFrameContextUtils.isSingleMode(this.context) || !this.context.isSupportedDividePage) {
			return this.pages.length;
		}
		
		return this.pages.length + this.splitCache.filter(s => s).length;
	}
	
	/**
	 * 从虚拟索引获取位置
	 */
	positionFromVirtual(virtualIndex: number): PagePosition {
		if (!PageFrameContextUtils.isSingleMode(this.context) || !this.context.isSupportedDividePage) {
			return PagePositionUtils.new(Math.min(virtualIndex, Math.max(0, this.pages.length - 1)), 0);
		}
		
		let currentVirtual = 0;
		for (let index = 0; index < this.splitCache.length; index++) {
			const isSplit = this.splitCache[index];
			const pageVirtualCount = isSplit ? 2 : 1;
			
			if (currentVirtual + pageVirtualCount > virtualIndex) {
				const part = isSplit && virtualIndex > currentVirtual ? 1 : 0;
				return PagePositionUtils.new(index, part);
			}
			
			currentVirtual += pageVirtualCount;
		}
		
		// 超出范围，返回最后一页
		const lastIndex = Math.max(0, this.pages.length - 1);
		const lastSplit = this.isPageSplit(lastIndex);
		return PagePositionUtils.new(lastIndex, lastSplit ? 1 : 0);
	}
	
	/**
	 * 从位置获取虚拟索引
	 */
	virtualFromPosition(position: PagePosition): number {
		if (!PageFrameContextUtils.isSingleMode(this.context) || !this.context.isSupportedDividePage) {
			return position.index;
		}
		
		let virtualIndex = 0;
		for (let index = 0; index < this.splitCache.length; index++) {
			const isSplit = this.splitCache[index];
			if (index === position.index) {
				return virtualIndex + position.part;
			}
			virtualIndex += isSplit ? 2 : 1;
		}
		
		return virtualIndex;
	}
	
	/**
	 * 获取包含指定页面索引的帧位置
	 */
	framePositionForIndex(pageIndex: number): PagePosition {
		if (pageIndex >= this.pages.length) {
			return PagePositionUtils.new(Math.max(0, this.pages.length - 1), 0);
		}
		
		if (this.context.pageMode === 'single') {
			return PagePositionUtils.new(pageIndex, 0);
		}
		
		// 双页模式
		if (pageIndex === 0 || this.shouldDisplayAlone(pageIndex)) {
			return PagePositionUtils.new(pageIndex, 0);
		}
		
		// 检查是否是双页帧的第二页
		const prevIndex = pageIndex - 1;
		if (this.canFormDoublePage(prevIndex, pageIndex)) {
			return PagePositionUtils.new(prevIndex, 0);
		}
		
		return PagePositionUtils.new(pageIndex, 0);
	}
}
