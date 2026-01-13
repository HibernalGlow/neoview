<script lang="ts">
	/**
	 * NeoView - Main Layout Component
	 * 主布局组件 - 集成自动隐藏功能
	 */
	import {
		leftSidebarOpen,
		leftSidebarWidth,
		rightSidebarOpen,
		rightSidebarWidth,
		pageLeft,
		pageRight,
		zoomIn,
		zoomOut,
		sidebarLeftPanels,
		sidebarRightPanels,
		activePanel,
		// 高度配置
		leftSidebarHeight,
		leftSidebarCustomHeight,
		leftSidebarVerticalAlign,
		rightSidebarHeight,
		rightSidebarCustomHeight,
		rightSidebarVerticalAlign,
		getSidebarHeightPercent,
		getVerticalAlignStyle
	} from '$lib/stores';
	import { bookStore } from '$lib/stores/book.svelte';
	import LeftSidebar from './LeftSidebar.svelte';
	import RightSidebar from './RightSidebar.svelte';
	import { TopToolbar } from './TopToolbar/index';
	import BottomThumbnailBar from './BottomThumbnailBar.svelte';
	import { StackView } from '$lib/stackview';
	import AreaOverlay from '../ui/AreaOverlay.svelte';
	import HoverAreasOverlay from '../ui/HoverAreasOverlay.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';

	let { children } = $props();
	let settings = $state(settingsManager.getSettings());
	let hoverAreas = $derived(settings.panels?.hoverAreas);

	// 计算左侧边栏高度和对齐样式
	let leftHeightPercent = $derived(getSidebarHeightPercent($leftSidebarHeight, $leftSidebarCustomHeight));
	let leftVerticalStyle = $derived(getVerticalAlignStyle($leftSidebarVerticalAlign, leftHeightPercent));
	let leftHeightStyle = $derived(`height: ${leftHeightPercent}%;`);
	let leftWidth = $derived($leftSidebarOpen ? $leftSidebarWidth : (hoverAreas?.leftTriggerWidth ?? 32));

	// 计算右侧边栏高度和对齐样式
	let rightHeightPercent = $derived(getSidebarHeightPercent($rightSidebarHeight, $rightSidebarCustomHeight));
	let rightVerticalStyle = $derived(getVerticalAlignStyle($rightSidebarVerticalAlign, rightHeightPercent));
	let rightHeightStyle = $derived(`height: ${rightHeightPercent}%;`);
	let rightWidth = $derived($rightSidebarOpen ? $rightSidebarWidth : (hoverAreas?.rightTriggerWidth ?? 32));

	// 调试日志
	$effect(() => {
		console.log('[MainLayout] Left:', {
			preset: $leftSidebarHeight,
			percent: leftHeightPercent,
			width: leftWidth,
			style: leftHeightStyle,
			alignStyle: leftVerticalStyle
		});
		console.log('[MainLayout] Right:', {
			preset: $rightSidebarHeight,
			percent: rightHeightPercent,
			width: rightWidth,
			style: rightHeightStyle,
			alignStyle: rightVerticalStyle
		});
	});

	function handleSidebarResize(width: number) {
		leftSidebarWidth.set(width);
	}

	function handleRightSidebarResize(width: number) {
		rightSidebarWidth.set(width);
	}

	// 区域覆盖层状态
	let showAreaOverlay = $state(false);
	let showHoverAreasOverlay = $state(false);

	// 监听区域覆盖层切换事件
	$effect(() => {
		const handleAreaOverlayToggle = (e: CustomEvent) => {
			showAreaOverlay = e.detail.show;
		};

		window.addEventListener('areaOverlayToggle', handleAreaOverlayToggle as EventListener);
		return () => {
			window.removeEventListener('areaOverlayToggle', handleAreaOverlayToggle as EventListener);
		};
	});

	$effect(() => {
		const handleHoverAreasToggle = (e: CustomEvent) => {
			showHoverAreasOverlay = e.detail.show;
		};

		window.addEventListener('hoverAreasOverlayToggle', handleHoverAreasToggle as EventListener);
		return () => {
			window.removeEventListener(
				'hoverAreasOverlayToggle',
				handleHoverAreasToggle as EventListener
			);
		};
	});

	$effect(() => {
		settingsManager.addListener((newSettings) => {
			settings = newSettings;
		});
	});

	// 处理区域操作事件
	function handleAreaAction(e: CustomEvent) {
		const { action } = e.detail;
		console.log('执行区域操作:', action);

		// 这里可以根据action执行相应的操作
		// 例如：翻页、缩放等
		switch (action) {
			case 'nextPage': {
				void pageRight();
				break;
			}
			case 'prevPage': {
				void pageLeft();
				break;
			}
			case 'pageLeft': {
				const settings = settingsManager.getSettings();
				const readingDirection = settings.book.readingDirection;
				if (readingDirection === 'right-to-left') {
					// 右开模式下，逻辑“向左翻页”对应物理向右翻
					void pageRight();
				} else {
					void pageLeft();
				}
				break;
			}
			case 'pageRight': {
				const settings = settingsManager.getSettings();
				const readingDirection = settings.book.readingDirection;
				if (readingDirection === 'right-to-left') {
					// 右开模式下，逻辑“向右翻页”对应物理向左翻
					void pageLeft();
				} else {
					void pageRight();
				}
				break;
			}
			case 'zoomIn':
				zoomIn();
				break;
			case 'zoomOut':
				zoomOut();
				break;
			// 其他操作...
		}
	}

	// 全局鼠标事件
</script>

<div class="bg-background fixed inset-0" role="application" aria-label="NeoView 主界面">
	<!-- 自动隐藏顶部工具栏（包含标题栏） -->
	<TopToolbar />

	<!-- 主内容区域（全屏） -->
	<div class="absolute inset-0 overflow-hidden">
		{#if bookStore.viewerOpen}
			<!-- 图片查看器 -->
			<StackView showPageInfo={true} showProgress={true} />
		{:else}
			<!-- 默认内容 -->
			{@render children?.()}
		{/if}
	</div>

	<!-- 自动隐藏底部缩略图栏 -->
	<BottomThumbnailBar />

	<!-- 左侧边栏（悬浮，始终可用） -->
	<div
		class="absolute left-0 z-[55] pointer-events-none"
		style="{leftVerticalStyle} {leftHeightStyle} width: {leftWidth}px;"
	>
		<div class="pointer-events-auto h-full w-full">
			<LeftSidebar onResize={handleSidebarResize} />
		</div>
	</div>

	<!-- 右侧边栏（悬浮，始终可用） -->
	<div
		class="absolute right-0 z-[55] pointer-events-none"
		style="{rightVerticalStyle} {rightHeightStyle} width: {rightWidth}px;"
	>
		<div class="pointer-events-auto h-full w-full">
			<RightSidebar onResize={handleRightSidebarResize} />
		</div>
	</div>

	<!-- 区域覆盖层 -->
	<AreaOverlay
		bind:show={showAreaOverlay}
		on:areaAction={handleAreaAction}
		sidebarOpen={$leftSidebarOpen}
		rightSidebarOpen={$rightSidebarOpen}
	/>
	<HoverAreasOverlay bind:show={showHoverAreasOverlay} />
</div>
