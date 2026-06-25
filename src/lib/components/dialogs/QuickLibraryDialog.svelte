<script lang="ts">
	/**
	 * NeoView - Quick Library HUD Panel
	 * 悬浮式沉浸图库 HUD 面板（贴合轮盘自适应布局）
	 */
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

	// 自适应计算库面板位置
	let cardStyle = $derived.by(() => {
		if (!radialMenuStore.isOpen) return 'display: none;';

		const cX = radialMenuStore.visualX;
		const cY = radialMenuStore.visualY;

		const cardWidth = 400; // 宽度
		const cardHeight = Math.min(550, H - 40); // 高度限制
		const menuRadius = radialMenuStore.config.radius ?? 120;
		const margin = menuRadius + 120; // 偏离轮盘中心点的距离（轮盘半径 + 120px 标签和扩张状态缓冲）

		let left = 0;
		let top = 0;

		// 横屏模式 (横向偏置，置于轮盘左侧或右侧剩余空间最大的位置)
		if (W >= H) {
			// 纵向居中对齐轮盘，同时确保不超出屏幕上下边界
			top = Math.max(20, Math.min(H - cardHeight - 20, cY - cardHeight / 2));

			if (cX > W / 2) {
				// 轮盘在右侧，面板放左侧
				left = Math.max(20, cX - margin - cardWidth);
			} else {
				// 轮盘在左侧，面板放右侧
				left = Math.min(W - cardWidth - 20, cX + margin);
			}
		}
		// 竖屏模式 (纵向偏置，置于轮盘上方或下方剩余空间最大的位置)
		else {
			// 横向居中对齐轮盘，同时确保不超出屏幕左右边界
			left = Math.max(20, Math.min(W - cardWidth - 20, cX - cardWidth / 2));

			if (cY > H / 2) {
				// 轮盘在下方，面板放上方
				top = Math.max(20, cY - margin - cardHeight);
			} else {
				// 轮盘在上方，面板放下方
				top = Math.min(H - cardHeight - 20, cY + margin);
			}
		}

		return `position: fixed; left: ${left}px; top: ${top}px; width: ${cardWidth}px; height: ${cardHeight}px; z-index: 58;`;
	});

	// 阻止事件冒泡到轮盘组件的辅助函数
	function stopPropagation(e: Event) {
		e.stopPropagation();
	}
</script>

{#if radialMenuStore.isOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		data-radial-exclude
		style="{cardStyle} background-color: color-mix(in oklch, var(--background) {sidebarOpacity}%, transparent); backdrop-filter: blur({sidebarBlur}px);"
		class="pointer-events-auto flex flex-col overflow-hidden rounded-xl border p-4 shadow-2xl select-none"
		onpointerdown={stopPropagation}
		onpointerup={stopPropagation}
		onmousedown={stopPropagation}
		onmouseup={stopPropagation}
		onclick={stopPropagation}
	>
		<div class="flex items-center justify-between border-b pb-2">
			<div class="flex flex-col">
				<span class="text-sm font-semibold">快捷书库</span>
				<span class="text-muted-foreground text-[10px]">双击目录或书籍进行切换</span>
			</div>
		</div>

		<div class="bg-card/40 mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
			<FolderPanel />
		</div>
	</div>
{/if}
