<script lang="ts">
	/**
	 * NeoView - Right Sidebar Component (shadcn-svelte 重构)
	 * 右侧边栏组件 - 使用 sidebarConfig 动态管理面板显示、顺序和位置
	 */
	import { Pin, PinOff, GripVertical } from '@lucide/svelte';
	import {
		activeRightPanel,
		setActiveRightPanel,
		rightSidebarWidth,
		rightSidebarPinned,
		rightSidebarOpen,
		sidebarRightPanels,
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
	let autoHideTiming = $derived(settings.panels?.autoHideTiming ?? { showDelaySec: 0, hideDelaySec: 0 });

	// 从配置获取右侧面板列表
	let rightPanels = $derived($sidebarRightPanels);
	
	// 当前激活的面板 ID
	let activePanelId = $state<PanelId>('files');
	
	// 使用共用的面板组件映射
	const panelComponents = PANEL_COMPONENTS;

	// 拖拽调整大小
	let isResizing = $state(false);
	let startX = 0;
	let startWidth = 0;

	function handleMouseDown(e: MouseEvent) {
		console.log('[RightSidebar] handleMouseDown called', e.clientX, $rightSidebarWidth);
		isResizing = true;
		startX = e.clientX;
		startWidth = $rightSidebarWidth;
		e.preventDefault();
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isResizing) return;

		const delta = startX - e.clientX; // 右侧边栏，向左拖拽时delta为正（增加宽度）
		const newWidth = Math.max(200, Math.min(600, startWidth + delta));

		console.log('[RightSidebar] handleMouseMove', {
			clientX: e.clientX,
			startX,
			delta,
			startWidth,
			newWidth
		});

		rightSidebarWidth.set(newWidth);
		onResize?.(newWidth);
	}

	function handleMouseUp() {
		console.log('[RightSidebar] handleMouseUp called, isResizing was:', isResizing);
		isResizing = false;
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
		if (!$rightSidebarPinned) {
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
		if ($activeRightPanel && rightPanels.some(p => p.id === $activeRightPanel)) {
			activePanelId = $activeRightPanel as PanelId;
		}
	});

	// 响应钉住状态
	$effect(() => {
		if ($rightSidebarPinned) {
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
		console.log('[RightSidebar] Setting up global mouse event listeners');
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);

		return () => {
			console.log('[RightSidebar] Cleaning up global mouse event listeners');
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
				<Sidebar.Root
					collapsible="none"
					class="!w-[calc(var(--sidebar-width-icon)_+_1px)] border-l"
					style="width: calc(var(--sidebar-width-icon) + 1px);"
				>
					<Sidebar.Header class="flex flex-col gap-2 border-b px-1.5 py-2">
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
						</div>
					</Sidebar.Header>

					<Sidebar.Content>
						<Sidebar.Group>
							<Sidebar.GroupContent class="px-1.5 md:px-0">
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
												class="px-2.5 md:px-2"
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
					class="hidden flex-1 md:flex"
					style="width: calc(var(--sidebar-width) - var(--sidebar-width-icon) - 1px);"
				>
					<Sidebar.Content class="h-full">
						<Sidebar.Group class="h-full flex-1 p-0">
							<Sidebar.GroupContent class="h-full">
								<!-- 使用 CSS 隐藏而非条件渲染，保持组件实例不被销毁 -->
								{#each rightPanels as panel (panel.id)}
									{@const PanelComponent = panelComponents[panel.id]}
									{#if PanelComponent}
										<div class="h-full {activePanelId === panel.id ? '' : 'hidden'}">
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
					class="hover:bg-accent text-muted-foreground absolute left-0 top-1/2 z-[60] -translate-y-1/2 cursor-ew-resize rounded-r-md p-1 transition-colors"
					onmousedown={handleMouseDown}
					aria-label="调整右侧边栏宽度"
				>
					<GripVertical class="h-4 w-4" />
				</button>
			</Sidebar.Root>
		</Sidebar.Provider>
	</div>
</HoverWrapper>
