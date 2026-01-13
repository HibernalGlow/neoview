<script lang="ts">
	/**
	 * NeoView - Right Sidebar Component (shadcn-svelte 重构)
	 * 右侧边栏组件 - 使用 sidebarConfig 动态管理面板显示、顺序和位置
	 * 支持 MagicCard 鼠标跟随光效
	 */
	import { Pin, PinOff, GripVertical, Move } from '@lucide/svelte';
	import MagicCard from '$lib/components/ui/MagicCard.svelte';
	import {
		activeRightPanel,
		setActiveRightPanel,
		rightSidebarWidth,
		rightSidebarPinned,
		rightSidebarLockState,
		rightSidebarOpen,
		sidebarRightPanels,
		sidebarConfigStore,
		rightSidebarVerticalAlign,
		rightSidebarHorizontalPos,
		rightSidebarHeight,
		type PanelId
	} from '$lib/stores';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { PANEL_COMPONENTS } from '$lib/components/panels';
	import { Button } from '$lib/components/ui/button';
	import HoverWrapper from './HoverWrapper.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';

	interface Props {
		onResize?: (width: number) => void;
	}

	let { onResize }: Props = $props();
	let isVisible = $state($rightSidebarOpen);
	let localRightSidebarOpen = $state($rightSidebarOpen);
	let settings = $state(settingsManager.getSettings());
	let autoHideTiming = $derived(
		settings.panels?.autoHideTiming ?? { showDelaySec: 0, hideDelaySec: 0 }
	);

	// 从配置获取右侧面板列表
	let rightPanels = $derived($sidebarRightPanels);

	// 当前激活的面板 ID
	let activePanelId = $state<PanelId>('info');

	// 使用共用的面板组件映射
	const panelComponents = PANEL_COMPONENTS;

	// 拖拽调整大小
	let isResizing = $state(false);
	let startX = 0;
	let startWidth = 0;

	function handleMouseDown(e: MouseEvent) {
		// console.log('[RightSidebar] handleMouseDown called', e.clientX, $rightSidebarWidth);
		isResizing = true;
		startX = e.clientX;
		startWidth = $rightSidebarWidth;
		e.preventDefault();
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isResizing) return;

		const delta = startX - e.clientX; // 右侧边栏，向左拖拽时delta为正（增加宽度）
		const newWidth = Math.max(200, Math.min(600, startWidth + delta));

		// console.log('[RightSidebar] handleMouseMove', {
		// 	clientX: e.clientX,
		// 	startX,
		// 	delta,
		// 	startWidth,
		// 	newWidth
		// });

		rightSidebarWidth.set(newWidth);
		onResize?.(newWidth);
	}

	function handleMouseUp() {
		// console.log('[RightSidebar] handleMouseUp called, isResizing was:', isResizing);
		isResizing = false;
	}

	// 拖拽移动侧边栏位置
	let isDragging = $state(false);
	let dragStartX = 0;
	let dragStartY = 0;
	let initialXPos = 0;
	let initialYPos = 0;

	function handleDragStart(e: PointerEvent) {
		if ($rightSidebarHeight === 'full') return; // 全高模式不允许拖拽
		isDragging = true;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		initialXPos = $rightSidebarHorizontalPos;
		initialYPos = $rightSidebarVerticalAlign;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		e.preventDefault();
	}

	function handleDragMove(e: PointerEvent) {
		if (!isDragging) return;
		
		const deltaX = e.clientX - dragStartX;
		const deltaY = e.clientY - dragStartY;
		
		// 转换为百分比 (右侧边栏 X 轴反向)
		const xDeltaPercent = (deltaX / window.innerWidth) * -200; // 负号因为右侧边栏左移=增加偏移
		const yDeltaPercent = (deltaY / window.innerHeight) * 200;
		
		const newXPos = Math.max(0, Math.min(100, initialXPos + xDeltaPercent));
		const newYPos = Math.max(0, Math.min(100, initialYPos + yDeltaPercent));
		
		sidebarConfigStore.setRightSidebarHorizontalPos(newXPos);
		sidebarConfigStore.setRightSidebarVerticalAlign(newYPos);
	}

	function handleDragEnd(e: PointerEvent) {
		if (isDragging) {
			isDragging = false;
			(e.target as HTMLElement).releasePointerCapture(e.pointerId);
		}
	}

	// 钉住/取消钉住
	function togglePin() {
		rightSidebarPinned.set(!$rightSidebarPinned);
	}

	function handlePinContextMenu(e: MouseEvent) {
		e.preventDefault();
		rightSidebarPinned.set(false);
		localRightSidebarOpen = false;
		rightSidebarOpen.set(false);
	}

	// 悬停显示/隐藏逻辑 - 使用 HoverWrapper 管理
	function handleVisibilityChange(visible: boolean) {
		// 锁定隐藏时，不响应悬停
		if ($rightSidebarLockState === false) return;
		if (!$rightSidebarPinned && $rightSidebarLockState !== true) {
			localRightSidebarOpen = visible;
			rightSidebarOpen.set(visible);
		}
	}

	function handleTabChange(panelId: PanelId) {
		activePanelId = panelId;
		// 设置活动面板
		setActiveRightPanel(panelId as any);
	}

	// 响应 activeRightPanel 变化
	$effect(() => {
		if ($activeRightPanel && rightPanels.some((p) => p.id === $activeRightPanel)) {
			activePanelId = $activeRightPanel as PanelId;
		}
	});

	// 响应钉住状态和锁定状态
	$effect(() => {
		// 锁定隐藏时，强制关闭
		if ($rightSidebarLockState === false) {
			localRightSidebarOpen = false;
			rightSidebarOpen.set(false);
			return;
		}
		// 锁定显示或钉住时，强制打开
		if ($rightSidebarPinned || $rightSidebarLockState === true) {
			localRightSidebarOpen = true;
			rightSidebarOpen.set(true);
		}
	});

	// 同步本地状态与store
	$effect(() => {
		localRightSidebarOpen = $rightSidebarOpen;
	});

	// 全局鼠标事件
	$effect(() => {
		// console.log('[RightSidebar] Setting up global mouse event listeners');
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);

		return () => {
			// console.log('[RightSidebar] Cleaning up global mouse event listeners');
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
	});

	settingsManager.addListener((next) => {
		settings = next;
	});
</script>

<HoverWrapper
	bind:isVisible
	pinned={$rightSidebarPinned}
	onVisibilityChange={handleVisibilityChange}
	hideDelay={autoHideTiming.hideDelaySec * 1000}
	showDelay={autoHideTiming.showDelaySec * 1000}
>
	<div
		class="relative flex h-full"
		style="--sidebar-width: {$rightSidebarWidth}px; width: {$rightSidebarWidth}px;"
	>
		<Sidebar.Provider
			bind:open={localRightSidebarOpen}
			onOpenChange={(v) => {
				localRightSidebarOpen = v;
				rightSidebarOpen.set(v);
			}}
			style="--sidebar-width: {$rightSidebarWidth}px;"
		>
			<Sidebar.Root
				side="right"
				collapsible="offcanvas"
				class="overflow-hidden [&>[data-sidebar=sidebar]]:flex-row-reverse"
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
									variant={$rightSidebarPinned ? 'default' : 'ghost'}
									size="icon"
									class="h-9 w-9"
									onclick={togglePin}
									oncontextmenu={handlePinContextMenu}
								>
									{#if $rightSidebarPinned}
										<PinOff class="h-4 w-4" />
									{:else}
										<Pin class="h-4 w-4" />
									{/if}
								</Button>
								<!-- 拖拽移动按钮 -->
								{#if $rightSidebarHeight !== 'full'}
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
										<Move class="h-4 w-4" />
									</button>
								{/if}
							</div>
						</Sidebar.Header>

						<Sidebar.Content>
							<Sidebar.Group>
								<Sidebar.GroupContent class="px-0">
									<Sidebar.Menu>
										{#each rightPanels as panel (panel.id)}
											{@const Icon = panel.icon}
											<Sidebar.MenuItem>
												<Sidebar.MenuButton
													tooltipContentProps={{
														hidden: false
													}}
													onclick={() => handleTabChange(panel.id)}
													isActive={activePanelId === panel.id}
													class="px-2"
												>
													{#snippet tooltipContent()}
														{panel.title}
													{/snippet}
													<Icon />
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
								{#each rightPanels as panel (panel.id)}
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
					class="hover:bg-accent text-muted-foreground absolute top-1/2 left-0 z-60 -translate-y-1/2 cursor-ew-resize rounded-r-md p-1 opacity-0 transition-all hover:opacity-100"
					onmousedown={handleMouseDown}
					oncontextmenu={handlePinContextMenu}
					aria-label="调整右侧边栏宽度"
				>
					<GripVertical class="h-4 w-4" />
				</button>
			</Sidebar.Root>
		</Sidebar.Provider>
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
