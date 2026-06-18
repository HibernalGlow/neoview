<script lang="ts">
	/**
	 * NeoView - Info Panel Component
	 * 信息面板 - 纯容器，使用 CardRenderer 渲染卡片
	 */
	import { Info, ExternalLink, Copy } from '@lucide/svelte';
	import {
		infoPanelStore,
		type ViewerBookInfo,
		type ViewerImageInfo
	} from '$lib/stores/infoPanel.svelte';
	import { FileSystemAPI } from '$lib/api';
	import { cardConfigStore } from '$lib/stores/cardConfig.svelte';
	import CardRenderer from '$lib/cards/CardRenderer.svelte';

	let imageInfo = $state<ViewerImageInfo | null>(null);
	let bookInfo = $state<ViewerBookInfo | null>(null);
	let contextMenu = $state<{ x: number; y: number; open: boolean }>({ x: 0, y: 0, open: false });

	// 从 cardConfigStore 获取可见卡片（已排序）
	// 所有卡片都显示，每个卡片内部处理空数据状态
	const visibleCards = $derived(cardConfigStore.getPanelCards('info').filter((c) => c.visible));

	$effect(() => {
		const unsubscribe = infoPanelStore.subscribe((state) => {
			imageInfo = state.imageInfo;
			bookInfo = state.bookInfo;
		});
		return unsubscribe;
	});

	// 复制路径
	function copyPath() {
		if (bookInfo?.path) {
			navigator.clipboard.writeText(bookInfo.path);
		} else if (imageInfo?.path) {
			navigator.clipboard.writeText(imageInfo.path);
		}
		hideContextMenu();
	}

	// 在资源管理器中打开
	async function openInExplorer() {
		const path = bookInfo?.path || imageInfo?.path;
		if (path) {
			try {
				await FileSystemAPI.showInFileManager(path);
			} catch (err) {
				console.error('在资源管理器中打开失败:', err);
			}
		}
		hideContextMenu();
	}

	// 显示右键菜单
	function showContextMenu(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		let menuX = e.clientX;
		let menuY = e.clientY;

		if (menuX === 0 && menuY === 0 && e.target instanceof HTMLElement) {
			const rect = e.target.getBoundingClientRect();
			menuX = rect.left + rect.width / 2;
			menuY = rect.top + rect.height / 2;
		}

		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const menuWidth = 180;

		if (e.clientX + menuWidth > viewportWidth) {
			menuX = viewportWidth - menuWidth - 10;
		}
		if (menuX < 10) menuX = 10;

		const maxMenuHeight = viewportHeight * 0.7;
		if (menuY + maxMenuHeight > viewportHeight) {
			menuY = viewportHeight - maxMenuHeight - 10;
		}

		contextMenu = { x: menuX, y: menuY, open: true };
	}

	// 隐藏右键菜单
	function hideContextMenu() {
		contextMenu = { x: 0, y: 0, open: false };
	}
</script>

<div
	class="flex h-full flex-col"
	oncontextmenu={showContextMenu}
	role="region"
	aria-label="信息面板"
>
	<!-- 标题栏 -->
	<div class="px-4 py-3">
		<div class="flex items-center gap-2">
			<Info class="h-5 w-5" />
			<h3 class="font-semibold">详细信息</h3>
		</div>
	</div>

	<div class="flex-1 overflow-auto">
		<div class="flex flex-col space-y-3 px-4 py-3">
			{#if visibleCards.length > 0}
				{#each visibleCards as card (card.id)}
					<div style="order: {card.order}">
						<CardRenderer cardId={card.id} panelId="info" />
					</div>
				{/each}
			{:else}
				<!-- 空状态 -->
				<div class="text-muted-foreground flex flex-col items-center justify-center py-12">
					<div class="relative mb-4">
						<Info class="h-16 w-16 opacity-20" />
					</div>
					<div class="space-y-2 text-center">
						<p class="text-lg font-medium">暂无信息</p>
						<p class="text-sm opacity-70">打开图像文件后查看详细信息</p>
						<div class="bg-muted/50 mt-4 space-y-1 rounded-lg p-3 text-xs">
							<p class="text-foreground font-medium">支持格式：</p>
							<p>• 图像：JPG, PNG, GIF, WebP, AVIF</p>
							<p>• 文档：PDF, CBZ, CBR</p>
							<p>• 视频：MP4, WebM (缩略图)</p>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- 右键菜单 -->
	{#if contextMenu.open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="context-menu bg-popover/80 text-popover-foreground fixed z-50 min-w-[8rem] overflow-hidden rounded-md border p-1 shadow-md backdrop-blur-md"
			style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
			role="menu"
			tabindex="-1"
			onmousedown={(e: MouseEvent) => e.stopPropagation()}
		>
			<button
				type="button"
				class="hover:bg-accent flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm select-none"
				onclick={copyPath}
			>
				<Copy class="mr-2 h-4 w-4" />
				<span>复制路径</span>
			</button>
			<hr class="bg-border -mx-1 my-1 h-px border-0" />
			<button
				type="button"
				class="hover:bg-accent flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm select-none disabled:pointer-events-none disabled:opacity-50"
				onclick={openInExplorer}
				disabled={!bookInfo?.path && !imageInfo?.path}
			>
				<ExternalLink class="mr-2 h-4 w-4" />
				<span>在资源管理器中打开</span>
			</button>
		</div>
	{/if}
</div>
