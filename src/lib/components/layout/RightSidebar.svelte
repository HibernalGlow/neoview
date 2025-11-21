<script lang="ts">
	/**
	 * NeoView - Right Sidebar Component (shadcn-svelte 重构)
	 * 右侧边栏组件 - 使用 shadcn-svelte Sidebar 结构
	 */
	import { Info, FileText, Pin, PinOff, Sparkles } from '@lucide/svelte';
	import { activeRightPanel, setActiveRightPanel, rightSidebarWidth, rightSidebarPinned, rightSidebarOpen } from '$lib/stores';
	import type { RightPanelType } from '$lib/stores';
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

	// 悬停显示/隐藏逻辑 - 使用 HoverWrapper 管理
	function handleVisibilityChange(visible: boolean) {
		if (!$rightSidebarPinned) {
			localRightSidebarOpen = visible;
			rightSidebarOpen.set(visible);
		}
	}

	function handleTabChange(item: typeof navMain[0]) {
		activeItem = item;
		
		// 设置活动面板
		setActiveRightPanel(item.value as RightPanelType);
	}

	// 响应 activeRightPanel 变化
	$effect(() => {
		const currentActive = navMain.find(nav => nav.value === $activeRightPanel);
		if (currentActive) {
			activeItem = currentActive;
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
			<Sidebar.Root collapsible="none" class="!w-[calc(var(--sidebar-width-icon)_+_1px)] border-l" style="width: calc(var(--sidebar-width-icon) + 1px);">
				<Sidebar.Header>
					<Sidebar.Menu>
						<Sidebar.MenuItem>
							<Sidebar.MenuButton size="lg" class="md:h-8 md:p-0">
								{#snippet child({ props })}
									<div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
										<Info class="size-4" />
									</div>
									
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					</Sidebar.Menu>
				</Sidebar.Header>
				
				<Sidebar.Content>
					<Sidebar.Group>
						<Sidebar.GroupContent class="px-1.5 md:px-0">
							<Sidebar.Menu>
								{#each navMain as item (item.value)}
									<Sidebar.MenuItem>
										<Sidebar.MenuButton
											tooltipContentProps={{
												hidden: false,
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
								{/each}
							</Sidebar.Menu>
						</Sidebar.GroupContent>
					</Sidebar.Group>
				</Sidebar.Content>
			</Sidebar.Root>

			<!-- 二级菜单 - 内容面板 -->
			<Sidebar.Root collapsible="none" class="hidden flex-1 md:flex" style="width: calc(var(--sidebar-width) - var(--sidebar-width-icon) - 1px);">
				<Sidebar.Header class="gap-3.5 border-b p-4">
					<div class="flex w-full items-center justify-end">
						<div class="flex items-center gap-2">
							<Button variant="ghost" size="sm" onclick={togglePin}>
								{#if $rightSidebarPinned}
									<PinOff class="h-4 w-4" />
								{:else}
									<Pin class="h-4 w-4" />
								{/if}
							</Button>
							<Sidebar.Trigger asChild>
								<Button variant="ghost" size="sm">
									×
								</Button>
							</Sidebar.Trigger>
						</div>
					</div>
				</Sidebar.Header>
				
				<Sidebar.Content>
					<Sidebar.Group class="px-0">
						<Sidebar.GroupContent>
							{#if activeItem.value === 'info'}
								<InfoPanel />
							{:else if activeItem.value === 'properties'}
								<ImagePropertiesPanel />
							{:else if activeItem.value === 'upscale'}
								<UpscalePanel />
							{/if}
						</Sidebar.GroupContent>
					</Sidebar.Group>
				</Sidebar.Content>
			</Sidebar.Root>
		</Sidebar.Root>
	</Sidebar.Provider>
	</div>

	<!-- 拖拽调整大小的分隔条 - 移到外部 -->
	<div
		class="absolute top-0 bottom-0 left-0 w-4 cursor-col-resize transition-colors z-[60]"
		onmousedown={handleMouseDown}
		role="separator"
		aria-label="调整右侧边栏宽度"
		aria-orientation="vertical"
	>
		<!-- 拖拽区域（加大点击区域） -->
		<div class="absolute top-0 bottom-0 -left-2 -right-2"></div>
	</div>
</HoverWrapper>
