<script lang="ts">
	/**
	 * NeoView - Sidebar Component (shadcn-svelte 二级菜单重构 + 原生交互)
	 * 左侧边栏组件 - 使用 shadcn-svelte Sidebar 二级菜单结构，恢复拖拽和悬停逻辑
	 */
	import { Folder, History, Bookmark, Info, Image as ImageIcon, List, Pin, PinOff } from '@lucide/svelte';
	import { readable } from 'svelte/store';
import { activePanel, setActivePanelTab, sidebarWidth, sidebarPinned, sidebarOpen } from '$lib/stores';
import type { PanelTabType } from '$lib/stores';
	import * as Sidebar from '$lib/components/ui/sidebar';
import FileBrowser from '$lib/components/panels/FileBrowser.svelte';
import HistoryPanel from '$lib/components/panels/HistoryPanel.svelte';
import BookmarkPanel from '$lib/components/panels/BookmarkPanel.svelte';
import ThumbnailsPanel from '$lib/components/panels/ThumbnailsPanel.svelte';
import InfoPanel from '$lib/components/panels/InfoPanel.svelte';
import { Button } from '$lib/components/ui/button';
import HoverWrapper from './HoverWrapper.svelte';
import PanelContextMenu from '$lib/components/ui/PanelContextMenu.svelte';
import { appState, type StateSelector } from '$lib/core/state/appState';
import { Maximize2, ExternalLink, X } from '@lucide/svelte';

	interface Props {
		onResize?: (width: number) => void;
	}

	let { onResize }: Props = $props();
	let isVisible = $state($sidebarOpen);
	let localSidebarOpen = $state($sidebarOpen);

	const sidebar = Sidebar.useSidebar();

	type NavItem = {
		title: string;
		url: string;
		icon: typeof Folder;
		value: PanelTabType;
	};

	const navMain: NavItem[] = [
		{
			title: '文件夹',
			url: '#',
			icon: Folder,
			value: 'folder'
		},
		{
			title: '历史记录',
			url: '#',
			icon: History,
			value: 'history'
		},
		{
			title: '书签',
			url: '#',
			icon: Bookmark,
			value: 'bookmark'
		},
		{
			title: '缩略图',
			url: '#',
			icon: ImageIcon,
			value: 'thumbnail'
		},
		{
			title: '播放列表',
			url: '#',
			icon: List,
			value: 'playlist'
		},
		{
			title: '信息',
			url: '#',
			icon: Info,
			value: 'info'
		}
	];

	let activeItem = $state(navMain[0]);

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
		startWidth = $sidebarWidth;
		e.preventDefault();
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isResizing) return;

		const delta = e.clientX - startX;
		const newWidth = Math.max(200, Math.min(600, startWidth + delta));
		
		sidebarWidth.set(newWidth);
		onResize?.(newWidth);
	}

	function handleMouseUp() {
		isResizing = false;
	}

	// 钉住/取消钉住
	function togglePin() {
		sidebarPinned.set(!$sidebarPinned);
	}

	// 悬停显示/隐藏逻辑 - 使用 HoverWrapper 管理
	function handleVisibilityChange(visible: boolean) {
		if (!$sidebarPinned) {
			localSidebarOpen = visible;
			sidebarOpen.set(visible);
		}
	}

	function handleTabChange(item: NavItem) {
		activeItem = item;
		
		// 设置活动面板
		setActivePanelTab(item.value as PanelTabType);
		
		// 确保侧边栏打开
		sidebar.setOpen(true);
	}

	// 响应 activePanel 变化（避免无限循环）
	$effect(() => {
		const currentActive = navMain.find(nav => nav.value === $activePanel);
		if (currentActive && currentActive.value !== activeItem.value) {
			activeItem = currentActive;
		}
	});

	// 响应钉住状态
	$effect(() => {
		if ($sidebarPinned) {
			localSidebarOpen = true;
			sidebarOpen.set(true);
		}
	});

	// 同步本地状态与store
	$effect(() => {
		localSidebarOpen = $sidebarOpen;
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
	pinned={$sidebarPinned} 
	onVisibilityChange={handleVisibilityChange}
>
	<div
		class="relative flex h-full"
		style="--sidebar-width: {$sidebarWidth}px; width: {$sidebarWidth}px;"
	>
		<Sidebar.Provider 
			bind:open={localSidebarOpen} 
			onOpenChange={(v) => {
				localSidebarOpen = v;
				sidebarOpen.set(v);
			}}
			style="--sidebar-width: {$sidebarWidth}px;"
		>
			<Sidebar.Root
				side="left"
				collapsible="offcanvas"
				class="overflow-hidden [&>[data-sidebar=sidebar]]:flex-row"
			>
			<!-- 一级菜单 - 图标模式 -->
			<Sidebar.Root collapsible="none" class="!w-[calc(var(--sidebar-width-icon)_+_1px)] border-r" style="width: calc(var(--sidebar-width-icon) + 1px);">
				<Sidebar.Header>
					<Sidebar.Menu>
						<Sidebar.MenuItem>
							<Sidebar.MenuButton size="lg" class="md:h-8 md:p-0">
								{#snippet child({ props })}
									<div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
										<Folder class="size-4" />
									</div>
									<div class="grid flex-1 text-left text-sm leading-tight">
										<span class="truncate font-medium">NeoView</span>
										<span class="truncate text-xs">Image Viewer</span>
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
											isActive={$activePanel === item.value}
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
					<div class="flex w-full items-center justify-between">
						<div class="text-foreground text-base font-medium">
							{activeItem.title}
							<div class="text-xs text-muted-foreground mt-1 space-x-2">
								<span>{sidebarBookSummary}</span>
								{#if $viewerState.pageWindow && !$viewerState.pageWindow.stale}
									<span>{sidebarWindowSummary}</span>
								{/if}
							</div>
						</div>
						<div class="flex items-center gap-3">
							<span class={`text-xs ${$viewerState.loading ? 'text-amber-500' : 'text-emerald-500'}`}>
								{$viewerState.loading ? '加载中' : '就绪'} · {$viewerState.viewMode}
							</span>
							<Button variant="ghost" size="sm" onclick={togglePin}>
								{#if $sidebarPinned}
									<PinOff class="h-4 w-4" />
								{:else}
									<Pin class="h-4 w-4" />
								{/if}
							</Button>
							<Button variant="ghost" size="sm" onclick={() => sidebar.setOpen(false)}>
								×
							</Button>
						</div>
					</div>
				</Sidebar.Header>
				
				<Sidebar.Content>
					<Sidebar.Group class="px-0">
						<Sidebar.GroupContent>
							<PanelContextMenu
								items={[
									{
										label: '在新窗口中打开',
										action: () => {
											console.log('在新窗口中打开:', activeItem.value);
											// TODO: 实现新窗口打开逻辑
										},
										icon: ExternalLink
									},
									{
										label: $sidebarPinned ? '取消钉住' : '钉住',
										action: () => {
											togglePin();
										},
										icon: $sidebarPinned ? PinOff : Pin
									},
									{
										label: '',
										action: () => {},
										separator: true
									},
									{
										label: '关闭面板',
										action: () => {
											sidebarOpen.set(false);
										},
										icon: X
									}
								]}
								zIndex={10000}
							>
								{#snippet children()}
									{#if activeItem.value === 'folder'}
										<FileBrowser />
									{:else if activeItem.value === 'history'}
										<HistoryPanel />
									{:else if activeItem.value === 'bookmark'}
										<BookmarkPanel />
									{:else if activeItem.value === 'thumbnail'}
										<ThumbnailsPanel />
									{:else if activeItem.value === 'playlist'}
										<div class="p-4">
											<h3 class="text-lg font-semibold mb-4">播放列表</h3>
											<p class="text-sm text-muted-foreground">播放列表功能正在开发中...</p>
										</div>
									{:else if activeItem.value === 'info'}
										<InfoPanel />
									{/if}
								{/snippet}
							</PanelContextMenu>
						</Sidebar.GroupContent>
					</Sidebar.Group>
				</Sidebar.Content>
			</Sidebar.Root>
		</Sidebar.Root>
	</Sidebar.Provider>

	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- 拖拽调整大小的分隔条（div 仅承载鼠标事件，不处理键盘） -->
	<div
		class="absolute top-0 bottom-0 right-0 w-4 cursor-col-resize transition-colors z-50"
		onmousedown={handleMouseDown}
		role="separator"
		aria-label="调整侧边栏宽度"
		aria-orientation="vertical"
	>
		<!-- 拖拽区域（加大点击区域） -->
		<div class="absolute top-0 bottom-0 -left-2 -right-2"></div>
	</div>
</div>
</HoverWrapper>
