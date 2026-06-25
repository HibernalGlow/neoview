<script lang="ts">
	/**
	 * NeoView - Quick Library HUD Panel (Split-Screen Docked Layout)
	 * 悬浮式沉浸图库 HUD 面板（屏幕边缘切分对齐布局）
	 */
	import { fly } from 'svelte/transition';
	import FolderPanel from '$lib/components/panels/folderPanel/FolderPanel.svelte';
	import { radialMenuStore } from '$lib/stores/radialMenu';
	import { bookStore } from '$lib/stores/book.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';

	let sidebarOpacity = $state(settingsManager.getSettings().panels.sidebarOpacity);
	let sidebarBlur = $state(settingsManager.getSettings().panels.sidebarBlur ?? 12);

	$effect(() => {
		const unsubscribe = settingsManager.addListener((s) => {
			sidebarOpacity = s.panels.sidebarOpacity;
			sidebarBlur = s.panels.sidebarBlur ?? 12;
		});
		return unsubscribe;
	});

	let W = $state(window.innerWidth);
	let H = $state(window.innerHeight);

	const handleResize = () => {
		W = window.innerWidth;
		H = window.innerHeight;
	};

	$effect(() => {
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	// 关闭轮盘与书籍面板的辅助函数
	function closeRadialMenu() {
		if (radialMenuStore.isOpen) {
			radialMenuStore.cancel();
			setTimeout(() => radialMenuStore.reset(), 0);
		}
	}

	// 监听书籍加载状态，一旦开始加载，自动关闭轮盘及书库面板
	$effect(() => {
		if (bookStore.loading && radialMenuStore.isOpen) {
			closeRadialMenu();
		}
	});

	// 根据右击鼠标位置计算库面板应当贴靠哪一侧屏幕边缘
	const dockSide = $derived.by(() => {
		if (!radialMenuStore.isOpen) return 'left';

		const cX = radialMenuStore.centerX;
		const cY = radialMenuStore.centerY;

		if (W >= H) {
			// 横屏下，鼠标点击在右半屏则面板贴靠左侧边缘，反之贴靠右侧边缘
			return cX > W / 2 ? 'left' : 'right';
		} else {
			// 竖屏下，鼠标点击在下半屏则面板贴靠顶侧边缘，反之贴靠底侧边缘
			return cY > H / 2 ? 'top' : 'bottom';
		}
	});

	// 面板容器的绝对/固定定位 CSS 样式
	const cardStyle = $derived.by(() => {
		if (!radialMenuStore.isOpen) return 'display: none;';

		const cardWidth = 420; // 横屏模式侧边栏宽度
		const cardHeight = Math.min(500, H * 0.45); // 竖屏模式上下栏高度

		if (W >= H) {
			// 横屏模式：铺满高度，切分左右半屏
			if (dockSide === 'left') {
				return `position: fixed; left: 0; top: 0; width: ${cardWidth}px; height: 100vh; z-index: 58; border-right-width: 1px; border-left-width: 0; border-top-width: 0; border-bottom-width: 0; border-radius: 0;`;
			} else {
				return `position: fixed; right: 0; top: 0; width: ${cardWidth}px; height: 100vh; z-index: 58; border-left-width: 1px; border-right-width: 0; border-top-width: 0; border-bottom-width: 0; border-radius: 0;`;
			}
		} else {
			// 竖屏模式：铺满宽度，切分上下半屏
			if (dockSide === 'top') {
				return `position: fixed; left: 0; top: 0; width: 100vw; height: ${cardHeight}px; z-index: 58; border-bottom-width: 1px; border-top-width: 0; border-left-width: 0; border-right-width: 0; border-radius: 0;`;
			} else {
				return `position: fixed; left: 0; bottom: 0; width: 100vw; height: ${cardHeight}px; z-index: 58; border-top-width: 1px; border-bottom-width: 0; border-left-width: 0; border-right-width: 0; border-radius: 0;`;
			}
		}
	});

	// 滑入滑出过渡动画参数
	const transitionParams = $derived.by(() => {
		const cardWidth = 420;
		const cardHeight = Math.min(500, H * 0.45);

		if (W >= H) {
			return {
				x: dockSide === 'left' ? -cardWidth : cardWidth,
				duration: 300,
				opacity: 0.8
			};
		} else {
			return {
				y: dockSide === 'top' ? -cardHeight : cardHeight,
				duration: 300,
				opacity: 0.8
			};
		}
	});

	// 阻止事件冒泡到轮盘组件的辅助函数
	function stopPropagation(e: Event) {
		e.stopPropagation();
	}
</script>

{#if radialMenuStore.isOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		transition:fly={transitionParams}
		data-radial-exclude
		style="{cardStyle} background-color: color-mix(in oklch, var(--background) {sidebarOpacity}%, transparent); backdrop-filter: blur({sidebarBlur}px);"
		class="pointer-events-auto flex flex-col overflow-hidden border p-5 shadow-2xl select-none"
		onpointerdown={stopPropagation}
		onpointerup={stopPropagation}
		onmousedown={stopPropagation}
		onmouseup={stopPropagation}
		onclick={stopPropagation}
	>
		<div class="flex items-center justify-between border-b pb-3">
			<div class="flex flex-col">
				<span class="text-sm font-semibold">快捷书库</span>
				<span class="text-muted-foreground text-[10px]">双击目录或书籍进行切换</span>
			</div>
		</div>

		<div class="bg-card/40 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
			<FolderPanel />
		</div>
	</div>
{/if}
