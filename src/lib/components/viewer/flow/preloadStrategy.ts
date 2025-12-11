/**
 * PreloadStrategy - 智能预加载策略
 * 参考 NeeView 的双向预加载策略，优化翻页体验
 */

import { bookStore } from '$lib/stores/book.svelte';

export interface PreloadPlan {
	// 必须立即加载的页面（当前显示）
	immediate: number[];
	// 高优先级预加载（下一页方向）
	nextHigh: number[];
	// 高优先级预加载（上一页方向）
	prevHigh: number[];
	// 普通优先级预加载（更远的页面）
	normal: number[];
}

export interface PreloadConfig {
	// 总预加载页数
	preloadSize: number;
	// 前向预加载比例（0-1，剩余为后向）
	forwardRatio: number;
	// 是否双页模式
	isDoublePage: boolean;
	// 翻页方向（1=向后，-1=向前）
	direction: number;
}

const DEFAULT_CONFIG: PreloadConfig = {
	preloadSize: 10, // 【优化】从 8 提升到 10，更激进的预加载
	forwardRatio: 0.7, // 70% 前向，30% 后向
	isDoublePage: false,
	direction: 1
};

/**
 * 计算预加载计划
 * 参考 NeeView 的策略：
 * 1. 先加载当前页
 * 2. 立即加载翻页方向的下一页
 * 3. 立即加载反方向的一页
 * 4. 继续加载翻页方向的剩余页
 * 5. 填充反方向的剩余配额
 */
export function calculatePreloadPlan(
	currentIndex: number,
	totalPages: number,
	config: Partial<PreloadConfig> = {}
): PreloadPlan {
	const cfg = { ...DEFAULT_CONFIG, ...config };
	const { preloadSize, forwardRatio, isDoublePage, direction } = cfg;

	const plan: PreloadPlan = {
		immediate: [],
		nextHigh: [],
		prevHigh: [],
		normal: []
	};

	// 边界检查
	if (totalPages <= 0 || currentIndex < 0 || currentIndex >= totalPages) {
		return plan;
	}

	// 1. 当前页（立即加载）
	plan.immediate.push(currentIndex);

	// 双页模式下，加载下一页
	if (isDoublePage && currentIndex + 1 < totalPages) {
		plan.immediate.push(currentIndex + 1);
	}

	// 计算前后预加载数量
	const forwardCount = Math.ceil(preloadSize * forwardRatio);
	const backwardCount = preloadSize - forwardCount;

	// 确定前进/后退方向
	const nextDir = direction;
	const prevDir = -direction;

	// 2. 高优先级：翻页方向的下一页
	const nextStart = isDoublePage ? currentIndex + 2 : currentIndex + 1;
	if (nextDir === 1) {
		// 向后翻页
		if (nextStart < totalPages) {
			plan.nextHigh.push(nextStart);
			if (isDoublePage && nextStart + 1 < totalPages) {
				plan.nextHigh.push(nextStart + 1);
			}
		}
	} else {
		// 向前翻页
		const prevStart = currentIndex - 1;
		if (prevStart >= 0) {
			plan.nextHigh.push(prevStart);
			if (isDoublePage && prevStart - 1 >= 0) {
				plan.nextHigh.push(prevStart - 1);
			}
		}
	}

	// 3. 高优先级：反方向的一页
	if (prevDir === 1) {
		const idx = isDoublePage ? currentIndex + 2 : currentIndex + 1;
		if (idx < totalPages && !plan.immediate.includes(idx) && !plan.nextHigh.includes(idx)) {
			plan.prevHigh.push(idx);
		}
	} else {
		const idx = currentIndex - 1;
		if (idx >= 0 && !plan.immediate.includes(idx) && !plan.nextHigh.includes(idx)) {
			plan.prevHigh.push(idx);
		}
	}

	// 已分配的页面
	const assigned = new Set([...plan.immediate, ...plan.nextHigh, ...plan.prevHigh]);

	// 4. 普通优先级：继续加载前进方向
	let forwardLoaded = plan.nextHigh.length;
	if (nextDir === 1) {
		for (let i = nextStart + (isDoublePage ? 2 : 1); i < totalPages && forwardLoaded < forwardCount; i++) {
			if (!assigned.has(i)) {
				plan.normal.push(i);
				assigned.add(i);
				forwardLoaded++;
			}
		}
	} else {
		for (let i = currentIndex - 2; i >= 0 && forwardLoaded < forwardCount; i--) {
			if (!assigned.has(i)) {
				plan.normal.push(i);
				assigned.add(i);
				forwardLoaded++;
			}
		}
	}

	// 5. 填充反方向
	let backwardLoaded = plan.prevHigh.length;
	if (prevDir === 1) {
		for (let i = currentIndex + (isDoublePage ? 2 : 1); i < totalPages && backwardLoaded < backwardCount; i++) {
			if (!assigned.has(i)) {
				plan.normal.push(i);
				assigned.add(i);
				backwardLoaded++;
			}
		}
	} else {
		for (let i = currentIndex - 1; i >= 0 && backwardLoaded < backwardCount; i--) {
			if (!assigned.has(i)) {
				plan.normal.push(i);
				assigned.add(i);
				backwardLoaded++;
			}
		}
	}

	return plan;
}

/**
 * 获取当前书籍的预加载计划
 */
export function getCurrentPreloadPlan(config: Partial<PreloadConfig> = {}): PreloadPlan {
	const currentBook = bookStore.currentBook;
	if (!currentBook) {
		return { immediate: [], nextHigh: [], prevHigh: [], normal: [] };
	}

	return calculatePreloadPlan(
		bookStore.currentPageIndex,
		currentBook.pages.length,
		config
	);
}

/**
 * 将预加载计划转换为优先级队列
 */
export function planToQueue(plan: PreloadPlan): Array<{ pageIndex: number; priority: number }> {
	const queue: Array<{ pageIndex: number; priority: number }> = [];

	// 立即加载：优先级 100
	for (const idx of plan.immediate) {
		queue.push({ pageIndex: idx, priority: 100 });
	}

	// 高优先级前向：优先级 90
	for (const idx of plan.nextHigh) {
		queue.push({ pageIndex: idx, priority: 90 });
	}

	// 高优先级后向：优先级 80
	for (const idx of plan.prevHigh) {
		queue.push({ pageIndex: idx, priority: 80 });
	}

	// 普通优先级：优先级 50-70（按顺序递减）
	let normalPriority = 70;
	for (const idx of plan.normal) {
		queue.push({ pageIndex: idx, priority: normalPriority });
		normalPriority = Math.max(50, normalPriority - 5);
	}

	return queue;
}

/**
 * 追踪翻页方向
 */
let lastPageIndex = -1;
let currentDirection = 1;

export function trackPageDirection(newPageIndex: number): number {
	if (lastPageIndex >= 0) {
		if (newPageIndex > lastPageIndex) {
			currentDirection = 1;
		} else if (newPageIndex < lastPageIndex) {
			currentDirection = -1;
		}
		// 相等时保持原方向
	}
	lastPageIndex = newPageIndex;
	return currentDirection;
}

export function getCurrentDirection(): number {
	return currentDirection;
}

export function resetDirectionTracking(): void {
	lastPageIndex = -1;
	currentDirection = 1;
}
