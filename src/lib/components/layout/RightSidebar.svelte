<script lang="ts">
	/**
	 * NeoView - Right Sidebar Component (shadcn-svelte 重构)
	 * 右侧边栏组件 - 使用 shadcn-svelte Sidebar 结构
	 */
	import { Info, FileText, Pin, PinOff, Sparkles, GripVertical } from '@lucide/svelte';
	import {
		activeRightPanel,
		setActiveRightPanel,
		rightSidebarWidth,
		rightSidebarPinned,
		rightSidebarOpen,
		panels
	} from '$lib/stores';
	import type { RightPanelType, PanelConfig } from '$lib/stores';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import ImagePropertiesPanel from '$lib/components/panels/ImagePropertiesPanel.svelte';
	import InfoPanel from '$lib/components/panels/InfoPanel.svelte';
	import UpscalePanel from '$lib/components/panels/UpscalePanel.svelte';
	import { Button } from '$lib/components/ui/button';
	import HoverWrapper from './HoverWrapper.svelte';

	interface Props {
		onResize?: (width: number) => void;
	}

	let { onResize }: Props = $props();
	let isVisible = $state($rightSidebarOpen);
	let localRightSidebarOpen = $state($rightSidebarOpen);

	const navMain = [
		{
			title: '信息',
			url: '#',
			icon: Info,
			value: 'info'
		},
		{
			title: '属性',
			url: '#',
			icon: FileText,
			value: 'properties'
		},
		{
			title: '超分',
			url: '#',
			icon: Sparkles,
			value: 'upscale'
		}
	];

	let activeItem = $state(navMain[0]);

	const infoPanelEnabled = $derived(
		(() => {
			const list = $panels as PanelConfig[];
			const infoPanel = list.find((p) => p.id === 'info');
			if (!infoPanel) return true;
			return infoPanel.visible && infoPanel.location === 'right';
		})()
	);

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

	function handleTabChange(item: (typeof navMain)[0]) {
		activeItem = item;

		// 设置活动面板
		setActiveRightPanel(item.value as RightPanelType);
	}

	// 响应 activeRightPanel 变化
	$effect(() => {
		const enabledInfo = infoPanelEnabled;
		const currentValue = $activeRightPanel;
		let next = navMain.find((nav) => nav.value === currentValue);

		if (next?.value === 'info' && !enabledInfo) {
			next = navMain.find((nav) => nav.value !== 'info');
		}

		if (!next) {
			next = navMain.find((nav) => nav.value !== 'info' || enabledInfo);
		}

		if (!next) return;

		// 同步本地激活项
		if (next.value !== activeItem.value) {
			activeItem = next;
		}

		// 仅在目标值与当前 store 不同时才写回，避免无限循环
		if (next.value !== currentValue) {
			setActiveRightPanel(next.value as RightPanelType);
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
</script>

<HoverWrapper
	bind:isVisible
	pinned={$rightSidebarPinned}
	onVisibilityChange={handleVisibilityChange}
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
									{#each navMain as item (item.value)}
										{#if item.value !== 'info' || infoPanelEnabled}
											<Sidebar.MenuItem>
												<Sidebar.MenuButton
													tooltipContentProps={{
														hidden: false
													}}
													onclick={() => handleTabChange(item)}
													isActive={$activeRightPanel === item.value}
													class="px-2.5 md:px-2"
												>
													{#snippet tooltipContent()}
														{item.title}
													{/snippet}
													<item.icon />
													<span>{item.title}</span>
												</Sidebar.MenuButton>
											</Sidebar.MenuItem>
										{/if}
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
					<Sidebar.Content>
						<Sidebar.Group class="px-0">
							<Sidebar.GroupContent>
								{#if localRightSidebarOpen}
									{#if activeItem.value === 'info' && infoPanelEnabled}
										<InfoPanel />
									{:else if activeItem.value === 'properties'}
										<ImagePropertiesPanel />
									{:else if activeItem.value === 'upscale'}
										<UpscalePanel />
									{/if}
								{/if}
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
