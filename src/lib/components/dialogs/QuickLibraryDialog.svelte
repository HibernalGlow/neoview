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
		let currentWidth = cardWidth;
		let currentHeight = cardHeight;
		let borderStyle = '';

		// 横屏模式 (让卡片占满高度，纵向 height 为 H，top 为 0，横向跟随轮盘并贴紧)
		if (W >= H) {
			top = 0;
			currentHeight = H;

			if (cX > W / 2) {
				// 轮盘在右侧，面板放左侧
				left = Math.max(0, cX - margin - cardWidth);
			} else {
				// 轮盘在左侧，面板放右侧
				left = Math.min(W - cardWidth, cX + margin);
			}

			// 只有左右边框，无上下边框，无圆角
			borderStyle =
				'border-left: 1px solid var(--border); border-right: 1px solid var(--border); border-top: none; border-bottom: none; border-radius: 0px;';
		}
		// 竖屏模式 (让卡片占满宽度，横向 width 为 W，left 为 0，纵向跟随轮盘并贴紧)
		else {
			left = 0;
			currentWidth = W;

			if (cY > H / 2) {
				// 轮盘在下方，面板放上方
				top = Math.max(0, cY - margin - cardHeight);
			} else {
				// 轮盘在上方，面板放下方
				top = Math.min(H - cardHeight, cY + margin);
			}

			// 只有上下边框，无左右边框，无圆角
			borderStyle =
				'border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); border-left: none; border-right: none; border-radius: 0px;';
		}

		return `position: fixed; left: ${left}px; top: ${top}px; width: ${currentWidth}px; height: ${currentHeight}px; z-index: 58; ${borderStyle}`;
	});

	// 阻止事件冒泡到轮盘组件的辅助函数
	function stopPropagation(e: Event) {
		e.stopPropagation();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	data-radial-exclude
	style="{cardStyle} background-color: color-mix(in oklch, var(--background) {sidebarOpacity}%, transparent); backdrop-filter: blur({sidebarBlur}px);"
	class="pointer-events-auto flex flex-col overflow-hidden p-3 shadow-2xl select-none"
	class:pointer-events-none={!radialMenuStore.isOpen}
	onpointerdown={stopPropagation}
	onpointerup={stopPropagation}
	onmousedown={stopPropagation}
	onmouseup={stopPropagation}
	onclick={stopPropagation}
>
	<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
		<FolderPanel />
	</div>
</div>
