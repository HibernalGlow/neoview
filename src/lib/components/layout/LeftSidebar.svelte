
<script lang="ts">
	/**
	 * NeoView - Sidebar Component (shadcn-svelte 二级菜单重构 + 动态面板配置)
	 * 左侧边栏组件 - 使用 sidebarConfig 动态管理面板显示、顺序和位置
	 * 支持 MagicCard 鼠标跟随光效
	 */
	import { Pin, PinOff, GripVertical, GripHorizontal, MousePointer2, ArrowDownRight } from '@lucide/svelte';
	import { readable } from 'svelte/store';
	import MagicCard from '$lib/components/ui/MagicCard.svelte';
	import {
		activePanel,
		setActivePanelTab,
		leftSidebarWidth,
		leftSidebarPinned,
		leftSidebarLockState,
		leftSidebarOpen,
		sidebarLeftPanels,
		sidebarConfigStore,
		leftSidebarVerticalAlign,
		leftSidebarHorizontalPos,
		leftSidebarHeight,
		leftSidebarCustomHeight,
		enableBlankAreaCollapse,
		blankAreaCollapseMode,
		showDragHandle,
		type PanelId,
		type PanelTabType
	} from '$lib/stores';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { PANEL_COMPONENTS } from '$lib/components/panels';
	import { Button } from '$lib/components/ui/button';
	import HoverWrapper from './HoverWrapper.svelte';
	import { appState, type StateSelector } from '$lib/core/state/appState';
	import { settingsManager } from '$lib/settings/settingsManager';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		onResize?: (width: number) => void;
	}

	let { onResize }: Props = $props();
	let isVisible = $state($leftSidebarOpen);
	let localSidebarOpen = $state($leftSidebarOpen);
	let settings = $state(settingsManager.getSettings());
	let autoHideTiming = $derived(
		settings.panels?.autoHideTiming ?? { showDelaySec: 0, hideDelaySec: 0 }
	);

	// 从配置获取左侧面板列表
	let leftPanels = $derived($sidebarLeftPanels);

	// 当前激活的面板 ID
	let activePanelId = $state<PanelId>('folder');

	// 使用共用的面板组件映射
	const panelComponents = PANEL_COMPONENTS;

	function createAppStateStore<T>(selector: StateSelector<T>) {
		const initial = selector(appState.getSnapshot());
		return readable(initial, (set) => appState.subscribe(selector, (value) => set(value)));
	}

	const viewerState = createAppStateStore((state) => state.viewer);
	const bookState = createAppStateStore((state) => state.book);

	const sidebarBookSummary = $derived(
		$bookState.totalPages > 0
			? `第 ${$bookState.currentPageIndex + 1}/${$bookState.totalPages} 页`
			: '未打开书籍'
	);
	const sidebarWindowSummary = $derived(
		!$viewerState.pageWindow || $viewerState.pageWindow.stale
			? '窗口初始化中'
			: `窗口中心 ${$viewerState.pageWindow.center + 1} · 前 ${$viewerState.pageWindow.forward.length} / 后 ${$viewerState.pageWindow.backward.length}`
	);

	// 拖拽调整大小
	let isResizing = $state(false);
	let startX = 0;
	let startWidth = 0;

	function handleMouseDown(e: MouseEvent) {
		isResizing = true;
		startX = e.clientX;
		startWidth = $leftSidebarWidth;
		e.preventDefault();
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isResizing) return;

		const delta = e.clientX - startX;
		const newWidth = Math.max(200, Math.min(600, startWidth + delta));

		leftSidebarWidth.set(newWidth);
		onResize?.(newWidth);
	}

	function handleMouseUp() {
		isResizing = false;
	}

	// 拖拽移动侧边栏位置
	let isDragging = $state(false);
	let dragStartX = 0;
	let dragStartY = 0;
	let initialXPos = 0;
	let initialYPos = 0;

	function handleDragStart(e: PointerEvent) {
		if ($leftSidebarHeight === 'full') return; // 全高模式不允许拖拽
		isDragging = true;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		initialXPos = $leftSidebarHorizontalPos;
		initialYPos = $leftSidebarVerticalAlign;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		e.preventDefault();
	}

	function handleDragMove(e: PointerEvent) {
		if (!isDragging) return;
		
		const deltaX = e.clientX - dragStartX;
		const deltaY = e.clientY - dragStartY;
		
		// 转换为百分比 (屏幕宽度/高度的比例)
		const xDeltaPercent = (deltaX / window.innerWidth) * 200; // 放大系数让拖拽更敏感
		const yDeltaPercent = (deltaY / window.innerHeight) * 200;
		
		const newXPos = Math.max(0, Math.min(100, initialXPos + xDeltaPercent));
		const newYPos = Math.max(0, Math.min(100, initialYPos + yDeltaPercent));
		
		sidebarConfigStore.setLeftSidebarHorizontalPos(newXPos);
		sidebarConfigStore.setLeftSidebarVerticalAlign(newYPos);
	}

	function handleDragEnd(e: PointerEvent) {
		if (isDragging) {
			isDragging = false;
			(e.target as HTMLElement).releasePointerCapture(e.pointerId);
		}
	}

	// 边角缩放 (同时调整宽和高)
	let isCornerResizing = $state(false);
	let cornerStartX = 0;
	let cornerStartY = 0;
	let cornerStartWidth = 0;
	let cornerStartHeight = 0;

	function handleCornerResizeStart(e: PointerEvent) {
		isCornerResizing = true;
		cornerStartX = e.clientX;
		cornerStartY = e.clientY;
		cornerStartWidth = $leftSidebarWidth;
		cornerStartHeight = $leftSidebarHeight === 'full' ? 100 : $leftSidebarCustomHeight;
		
		// 如果是全高模式开始缩放，先切换到自定义模式
		if ($leftSidebarHeight === 'full') {
			sidebarConfigStore.setLeftSidebarHeight('custom');
			sidebarConfigStore.setLeftSidebarCustomHeight(100);
		}
		
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		e.preventDefault();
		e.stopPropagation();
	}

	function handleCornerResizeMove(e: PointerEvent) {
		if (!isCornerResizing) return;

		// 宽度调整
		const deltaX = e.clientX - cornerStartX;
		const newWidth = Math.max(200, Math.min(600, cornerStartWidth + deltaX));
		leftSidebarWidth.set(newWidth);
		onResize?.(newWidth);

		// 高度调整
		const deltaY = e.clientY - cornerStartY;
		const deltaHeightPercent = (deltaY / window.innerHeight) * 100;
		const newHeight = Math.max(10, Math.min(100, cornerStartHeight + deltaHeightPercent));
		
		if (newHeight >= 99.5) {
			sidebarConfigStore.setLeftSidebarHeight('full');
			sidebarConfigStore.setLeftSidebarCustomHeight(100);
		} else {
			sidebarConfigStore.setLeftSidebarHeight('custom');
			sidebarConfigStore.setLeftSidebarCustomHeight(newHeight);
		}
	}

	function handleCornerResizeEnd(e: PointerEvent) {
		if (isCornerResizing) {
			isCornerResizing = false;
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		}
	}

	// 钉住/取消钉住
	function togglePin() {
		leftSidebarPinned.set(!$leftSidebarPinned);
	}

	function handlePinContextMenu(e: MouseEvent) {
		e.preventDefault();
		collapseSidebar();
	}

	function collapseSidebar() {
		leftSidebarPinned.set(false);
		localSidebarOpen = false;
		leftSidebarOpen.set(false);
	}

	function isInteractiveElement(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		return Boolean(
			target.closest(
				'button,a,input,textarea,select,label,[role="button"],[role="switch"],[data-sidebar="menu-button"]'
			)
		);
	}

	function handleBlankAreaClick(e: MouseEvent) {
		if (!$enableBlankAreaCollapse || $blankAreaCollapseMode !== 'single') return;
		if (isInteractiveElement(e.target)) return;
		collapseSidebar();
	}

	function handleBlankAreaDoubleClick(e: MouseEvent) {
		if (!$enableBlankAreaCollapse || $blankAreaCollapseMode !== 'double') return;
		if (isInteractiveElement(e.target)) return;
		collapseSidebar();
	}

	// 悬停显示/隐藏逻辑 - 使用 HoverWrapper 管理
	function handleVisibilityChange(visible: boolean) {
		// 锁定隐藏时，不响应悬停
		if ($leftSidebarLockState === false) return;
		if (!$leftSidebarPinned && $leftSidebarLockState !== true) {
			localSidebarOpen = visible;
			leftSidebarOpen.set(visible);
		}
	}

	function handleTabChange(panelId: PanelId) {
		activePanelId = panelId;

		// 设置活动面板
		setActivePanelTab(panelId as PanelTabType);

		// 确保侧边栏打开
		localSidebarOpen = true;
		leftSidebarOpen.set(true);
	}

	// 响应 activePanel 变化（避免无限循环）
	$effect(() => {
		const currentActive = leftPanels.find((p) => p.id === $activePanel);
		if (currentActive && currentActive.id !== activePanelId) {
			activePanelId = currentActive.id;
		}
	});

	// 响应钉住状态和锁定状态
	$effect(() => {
		// 锁定隐藏时，强制关闭
		if ($leftSidebarLockState === false) {
			localSidebarOpen = false;
			leftSidebarOpen.set(false);
			return;
		}
		// 锁定显示或钉住时，强制打开
		if ($leftSidebarPinned || $leftSidebarLockState === true) {
			localSidebarOpen = true;
			leftSidebarOpen.set(true);
		}
	});

	settingsManager.addListener((next) => {
		settings = next;
	});

	// 同步本地状态与store
	$effect(() => {
		localSidebarOpen = $leftSidebarOpen;
	});

	// 全局鼠标事件
	$effect(() => {
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);

		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
	});
</script>

<HoverWrapper
	bind:isVisible
	pinned={$leftSidebarPinned}
	onVisibilityChange={handleVisibilityChange}
	hideDelay={autoHideTiming.hideDelaySec * 1000}
	showDelay={autoHideTiming.showDelaySec * 1000}
	side="left"
>
	<div
		class="relative flex h-full"
		style="--sidebar-width: {$leftSidebarWidth}px; width: {$leftSidebarWidth}px;"
	>
		<div class="flex-1 flex min-h-0">
		<Sidebar.Provider
			bind:open={localSidebarOpen}
			onOpenChange={(v) => {
				localSidebarOpen = v;
				leftSidebarOpen.set(v);
			}}
			style="--sidebar-width: {$leftSidebarWidth}px;"
		>
			<Sidebar.Root
				side="left"
				collapsible="offcanvas"
				class="overflow-hidden [&>[data-sidebar=sidebar]]:flex-row"
			>
				<!-- 一级菜单 - 图标模式 -->
				<MagicCard
					class="!w-[calc(var(--sidebar-width-icon)_+_1px)] h-full"
					gradientSize={80}
					gradientOpacity={0.4}
				>
					<Sidebar.Root
						collapsible="none"
						class="!w-[calc(var(--sidebar-width-icon)_+_1px)] h-full"
						style="width: calc(var(--sidebar-width-icon) + 1px);"
					>
						<Sidebar.Header class="flex flex-col gap-2 px-1.5 py-2">
							<div class="flex flex-col gap-1">
								<Button
									variant={$leftSidebarPinned ? 'default' : 'ghost'}
									size="icon"
									class="h-9 w-9"
									onclick={togglePin}
									oncontextmenu={handlePinContextMenu}
								>
									{#if $leftSidebarPinned}
										<PinOff class="h-4 w-4" />
									{:else}
										<Pin class="h-4 w-4" />
									{/if}
								</Button>
								<!-- 拖拽移动按钮 -->
								{#if $showDragHandle && $leftSidebarHeight !== 'full'}
									<button
										type="button"
										class="h-9 w-9 flex items-center justify-center rounded-md cursor-move transition-colors
											{isDragging ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground hover:text-foreground'}"
										onpointerdown={handleDragStart}
										onpointermove={handleDragMove}
										onpointerup={handleDragEnd}
										onpointercancel={handleDragEnd}
										title="拖拽移动侧边栏"
									>
										<MousePointer2 class="h-4 w-4" />
									</button>
								{/if}
							</div>
						</Sidebar.Header>

						<Sidebar.Content>
							<Sidebar.Group>
								<Sidebar.GroupContent
									class="px-0 h-full"
									onclick={handleBlankAreaClick}
									ondblclick={handleBlankAreaDoubleClick}
								>
									<Sidebar.Menu>
										{#each leftPanels as panel (panel.id)}
											<Sidebar.MenuItem>
												<Sidebar.MenuButton
													tooltipContentProps={{
														hidden: false
													}}
													onclick={() => handleTabChange(panel.id)}
													isActive={$activePanel === panel.id}
													class="px-2"
												>
													{#snippet tooltipContent()}
														{panel.title}
													{/snippet}
													<Icon name={panel.id} fallback={panel.icon} class="h-4 w-4" />
													<span>{panel.title}</span>
												</Sidebar.MenuButton>
											</Sidebar.MenuItem>
										{/each}
									</Sidebar.Menu>
								</Sidebar.GroupContent>
							</Sidebar.Group>
						</Sidebar.Content>
					</Sidebar.Root>
				</MagicCard>

				<!-- 二级菜单 - 内容面板 -->
				<Sidebar.Root
					collapsible="none"
					class="flex flex-1"
					style="width: calc(var(--sidebar-width) - var(--sidebar-width-icon) - 1px);"
				>
					<Sidebar.Content class="h-full">
						<Sidebar.Group class="h-full flex-1 p-0">
							<Sidebar.GroupContent class="h-full">
								<!-- 使用 content-visibility: hidden 保持布局信息，避免切换时重新计算尺寸 -->
								{#each leftPanels as panel (panel.id)}
									{@const PanelComponent = panelComponents[panel.id]}
									{#if PanelComponent}
										<div 
											class="panel-content-wrapper"
											class:panel-content-hidden={activePanelId !== panel.id}
										>
											<PanelComponent />
										</div>
									{/if}
								{/each}
							</Sidebar.GroupContent>
						</Sidebar.Group>
					</Sidebar.Content>
				</Sidebar.Root>
				<!-- 拖拽手柄 -->
				<button
					type="button"
					class="hover:bg-accent text-muted-foreground absolute top-1/2 right-0 z-50 -translate-y-1/2 cursor-ew-resize rounded-l-md p-1 opacity-0 transition-all hover:opacity-100"
					onmousedown={handleMouseDown}
					oncontextmenu={handlePinContextMenu}
					aria-label="调整侧边栏宽度"
				>
					<GripVertical class="h-4 w-4" />
				</button>

				<!-- 边角缩放手柄 (右下角) -->
				{#if $leftSidebarHeight !== 'full'}
					<button
						type="button"
						class="absolute bottom-0 right-0 z-[60] p-1 cursor-nwse-resize text-muted-foreground/30 hover:text-primary transition-colors
							{isCornerResizing ? 'text-primary' : ''}"
						onpointerdown={handleCornerResizeStart}
						onpointermove={handleCornerResizeMove}
						onpointerup={handleCornerResizeEnd}
						onpointercancel={handleCornerResizeEnd}
						aria-label="同时调整侧边栏宽高"
					>
						<ArrowDownRight class="h-4 w-4" />
					</button>
				{/if}
			</Sidebar.Root>
		</Sidebar.Provider>
	</div>
	</div>
</HoverWrapper>

<style>
	.panel-content-wrapper {
		height: 100%;
		contain: layout style;
	}
	.panel-content-hidden {
		content-visibility: hidden;
		/* 保留固有尺寸，避免切换时重新计算 */
		contain-intrinsic-size: auto 100%;
		height: 0;
		overflow: hidden;
	}
</style>
