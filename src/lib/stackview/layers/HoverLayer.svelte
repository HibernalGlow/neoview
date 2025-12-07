<!--
  HoverLayer - 悬停滚动层（事件驱动版）
  
  原理：根据图片溢出量计算安全的 transform-origin 范围
  - 当图片 <= 视口：位置固定在 50%（居中）
  - 当图片 > 视口：位置范围限制在安全区间，确保边缘不露出
  
  优化：
  - 纯事件驱动，无持续 RAF 循环
  - 边界计算使用 $derived 缓存
  - 单次 RAF 批量更新，避免重复触发
  - 【性能优化】彻底移除 mousemove 中的 getBoundingClientRect 调用
  - 使用 ResizeObserver 和 scroll 事件更新缓存
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	let {
		enabled = false,
		sidebarMargin = 50,
		deadZoneRatio = 0.2,
		viewportSize = { width: 0, height: 0 },
		displaySize = { width: 0, height: 0 }, // 图片实际显示尺寸（已应用缩放）
		onPositionChange
	}: {
		enabled?: boolean;
		sidebarMargin?: number;
		deadZoneRatio?: number;
		viewportSize?: { width: number; height: number };
		displaySize?: { width: number; height: number };
		onPositionChange?: (x: number, y: number) => void;
	} = $props();

	let layerRef: HTMLDivElement | null = $state(null);

	// 缓存 rect，避免频繁调用 getBoundingClientRect
	// 优化：不再使用时间缓存，而是通过 ResizeObserver 和事件更新
	let cachedRect: DOMRect | null = null;

	function updateRect() {
		if (layerRef) {
			cachedRect = layerRef.getBoundingClientRect();
		}
	}

	// 单次 RAF 调度器
	let pendingUpdate: { x: number; y: number } | null = null;
	let rafId: number | null = null;

	// 缓存边界计算（简化版：只看宽高比）
	// 横屏图(宽>高)溢出后只能左右滚动，竖屏图(高>宽)溢出后只能上下滚动
	let bounds = $derived.by(() => {
		if (!viewportSize.width || !viewportSize.height || !displaySize.width || !displaySize.height) {
			return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
		}

		const imgAspect = displaySize.width / displaySize.height;
		const vpAspect = viewportSize.width / viewportSize.height;
		const isWider = imgAspect > vpAspect;

		if (isWider) {
			// 横屏图：只能左右滚动
			return { minX: 0, maxX: 100, minY: 50, maxY: 50 };
		} else {
			// 竖屏图：只能上下滚动
			return { minX: 50, maxX: 50, minY: 0, maxY: 100 };
		}
	});

	// 调度单次 RAF 更新
	function scheduleUpdate(x: number, y: number) {
		pendingUpdate = { x, y };
		if (rafId === null) {
			rafId = requestAnimationFrame(flushUpdate);
		}
	}

	function flushUpdate() {
		rafId = null;
		if (pendingUpdate) {
			onPositionChange?.(pendingUpdate.x, pendingUpdate.y);
			pendingUpdate = null;
		}
	}

	// 直接在 mousemove 中计算并调度更新
	function onMouseMove(e: MouseEvent) {
		if (!enabled || !layerRef) return;

		// 如果没有 cachedRect，尝试更新一次
		if (!cachedRect) {
			updateRect();
		}

		const rect = cachedRect;
		if (!rect) return;

		const localX = e.clientX - rect.left;
		const localY = e.clientY - rect.top;

		// 边界检测
		if (localX < 0 || localX > rect.width || localY < 0 || localY > rect.height) {
			return;
		}

		// 侧边栏排除
		if (localX < sidebarMargin || localX > rect.width - sidebarMargin) {
			return;
		}

		// 死区检测
		const centerX = rect.width / 2;
		const centerY = rect.height / 2;
		const relX = localX - centerX;
		const relY = localY - centerY;
		const deadZoneSizeX = (rect.width * deadZoneRatio) / 2;
		const deadZoneSizeY = (rect.height * deadZoneRatio) / 2;

		if (Math.abs(relX) < deadZoneSizeX && Math.abs(relY) < deadZoneSizeY) {
			return;
		}

		// 映射到安全范围
		const normalizedX = localX / rect.width;
		const normalizedY = localY / rect.height;
		const x = bounds.minX + normalizedX * (bounds.maxX - bounds.minX);
		const y = bounds.minY + normalizedY * (bounds.maxY - bounds.minY);

		scheduleUpdate(x, y);
	}

	let resizeObserver: ResizeObserver | null = null;

	onMount(() => {
		window.addEventListener('mousemove', onMouseMove, { passive: true });
		// 监听滚动（因为滚动会改变元素与视口的相对位置）
		window.addEventListener('scroll', updateRect, { capture: true, passive: true });
		// 监听窗口 resize
		window.addEventListener('resize', updateRect, { passive: true });

		if (layerRef) {
			resizeObserver = new ResizeObserver(() => {
				updateRect();
			});
			resizeObserver.observe(layerRef);
			// 初始更新
			updateRect();
		}
	});

	onDestroy(() => {
		window.removeEventListener('mousemove', onMouseMove);
		window.removeEventListener('scroll', updateRect, { capture: true });
		window.removeEventListener('resize', updateRect);

		if (resizeObserver) {
			resizeObserver.disconnect();
		}

		if (rafId !== null) {
			cancelAnimationFrame(rafId);
		}
	});
</script>

<!-- 隐藏的参考元素，用于获取边界 -->
<div class="hover-layer-ref" bind:this={layerRef} role="presentation"></div>

<style>
	.hover-layer-ref {
		position: absolute;
		inset: 0;
		z-index: -1;
		pointer-events: none;
	}
</style>
