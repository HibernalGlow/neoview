<script lang="ts">
	/**
	 * NeoView - Sidebar Component (shadcn-svelte 二级菜单重构 + 动态面板配置)
	 * 左侧边栏组件 - 使用 sidebarConfig 动态管理面板显示、顺序和位置
	 */
	import { Pin, PinOff, GripVertical } from '@lucide/svelte';
	import { readable } from 'svelte/store';
	import {
		activePanel,
		setActivePanelTab,
		leftSidebarWidth,
		leftSidebarPinned,
		leftSidebarLockState,
		leftSidebarOpen,
		sidebarLeftPanels,
		type PanelId,
		type PanelTabType
	} from '$lib/stores';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { PANEL_COMPONENTS } from '$lib/components/panels';
	import { Button } from '$lib/components/ui/button';
	import HoverWrapper from './HoverWrapper.svelte';
	import { appState, type StateSelector } from '$lib/core/state/appState';
	import { settingsManager } from '$lib/settings/settingsManager';

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

	// 钉住/取消钉住
	function togglePin() {
		leftSidebarPinned.set(!$leftSidebarPinned);
	}

	function handlePinContextMenu(e: MouseEvent) {
		e.preventDefault();
		leftSidebarPinned.set(false);
		localSidebarOpen = false;
		leftSidebarOpen.set(false);
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
>
	<div
		class="relative flex h-full"
		style="--sidebar-width: {$leftSidebarWidth}px; width: {$leftSidebarWidth}px;"
	>
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
				<Sidebar.Root
					collapsible="none"
					class="!w-[calc(var(--sidebar-width-icon)_+_1px)]"
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
						</div>
					</Sidebar.Header>

					<Sidebar.Content>
						<Sidebar.Group>
							<Sidebar.GroupContent class="px-0">
								<Sidebar.Menu>
									{#each leftPanels as panel (panel.id)}
										{@const Icon = panel.icon}
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

				<!-- 二级菜单 - 内容面板 -->
				<Sidebar.Root
					collapsible="none"
					class="flex flex-1"
					style="width: calc(var(--sidebar-width) - var(--sidebar-width-icon) - 1px);"
				>
					<Sidebar.Content>
						<Sidebar.Group class="px-0">
							<Sidebar.GroupContent>
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
