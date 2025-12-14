<script lang="ts">
	/**
	 * FolderTabBar - 文件面板页签栏
	 * 使用 shadcn Tabs 组件实现多页签管理
	 * 点击图标触发下拉菜单，长按+按钮显示标签栏位置设置（圆形进度条）
	 */
	import {
		X,
		Plus,
		Copy,
		Bookmark,
		Clock,
		Folder,
		Pin,
		PinOff,
		ChevronLeft,
		ChevronRight,
		ClipboardCopy,
		RotateCcw,
		Check,
		PanelTop,
		PanelBottom,
		PanelLeft,
		PanelRight,
		Crosshair
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';

	// 长按相关状态
	const LONG_PRESS_DURATION = 500; // 长按时间 500ms
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressProgress = $state(0); // 0-100 进度
	let longPressAnimationFrame: number | null = null;
	let longPressStartTime = 0;
	let showSettingsPopover = $state(false);
	let longPressTriggered = false; // 标记是否触发了长按

	// 组件销毁时清理定时器
	onDestroy(() => {
		handleLongPressEnd();
	});

	import {
		allTabs,
		activeTabId,
		activeTab,
		folderTabActions,
		isVirtualPath,
		getVirtualPathType,
		recentlyClosedTabs,
		tabBarLayout,
		type TabBarLayout
	} from '../stores/folderTabStore.svelte';

	// 根据路径获取图标类型
	function getTabIconType(path: string): 'bookmark' | 'history' | 'folder' {
		if (isVirtualPath(path)) {
			const type = getVirtualPathType(path);
			if (type === 'bookmark') return 'bookmark';
			if (type === 'history') return 'history';
		}
		return 'folder';
	}

	interface Props {
		homePath?: string;
		onScrollToFocused?: () => void;
	}

	let { homePath = '', onScrollToFocused }: Props = $props();

	// 计算非固定标签页数量
	const unpinnedCount = $derived($allTabs.filter((t) => !t.pinned).length);

	// 检查是否可以关闭指定标签页
	function canCloseTab(tabId: string): boolean {
		const tab = $allTabs.find((t) => t.id === tabId);
		if (!tab) return false;
		if (tab.pinned) return true;
		return unpinnedCount > 1;
	}

	// 检查左侧是否有可关闭的标签页
	function hasClosableLeft(tabId: string): boolean {
		const tabIndex = $allTabs.findIndex((t) => t.id === tabId);
		if (tabIndex <= 0) return false;
		return $allTabs.slice(0, tabIndex).some((t) => !t.pinned);
	}

	// 检查右侧是否有可关闭的标签页
	function hasClosableRight(tabId: string): boolean {
		const tabIndex = $allTabs.findIndex((t) => t.id === tabId);
		if (tabIndex < 0 || tabIndex >= $allTabs.length - 1) return false;
		return $allTabs.slice(tabIndex + 1).some((t) => !t.pinned);
	}

	// 检查是否有其他可关闭的标签页
	function hasClosableOthers(tabId: string): boolean {
		return $allTabs.some((t) => t.id !== tabId && !t.pinned);
	}

	function handleCreateTab() {
		folderTabActions.createTab(homePath);
	}

	function handleCloseTab(tabId: string, e?: MouseEvent) {
		e?.stopPropagation();
		folderTabActions.closeTab(tabId);
	}

	function handleCloseOthers(tabId: string) {
		folderTabActions.closeOthers(tabId);
	}

	function handleCloseLeft(tabId: string) {
		folderTabActions.closeLeft(tabId);
	}

	function handleCloseRight(tabId: string) {
		folderTabActions.closeRight(tabId);
	}

	function handleDuplicateTab(tabId: string) {
		folderTabActions.duplicateTab(tabId);
	}

	function handleTogglePinned(tabId: string) {
		folderTabActions.togglePinned(tabId);
	}

	async function handleCopyPath(path: string) {
		try {
			await navigator.clipboard.writeText(path);
			toast.success('路径已复制到剪贴板');
		} catch {
			toast.error('复制路径失败');
		}
	}

	function handleReopenClosed() {
		const path = folderTabActions.reopenClosedTab();
		if (path) {
			toast.success('已重新打开页签');
		}
	}

	function handleScrollToFocused() {
		onScrollToFocused?.();
	}

	function handleSetTabBarLayout(layout: TabBarLayout) {
		folderTabActions.setTabBarLayout(layout);
		showSettingsPopover = false;
	}

	// 长按开始
	function handleLongPressStart() {
		longPressTriggered = false;
		longPressStartTime = Date.now();
		longPressProgress = 0;

		// 动画更新进度
		const updateProgress = () => {
			const elapsed = Date.now() - longPressStartTime;
			longPressProgress = Math.min((elapsed / LONG_PRESS_DURATION) * 100, 100);

			if (longPressProgress < 100) {
				longPressAnimationFrame = requestAnimationFrame(updateProgress);
			}
		};
		longPressAnimationFrame = requestAnimationFrame(updateProgress);

		// 长按完成后触发
		longPressTimer = setTimeout(() => {
			longPressTriggered = true;
			showSettingsPopover = true;
			clearProgress();
		}, LONG_PRESS_DURATION);
	}

	// 清理进度动画
	function clearProgress() {
		if (longPressAnimationFrame) {
			cancelAnimationFrame(longPressAnimationFrame);
			longPressAnimationFrame = null;
		}
		longPressProgress = 0;
	}

	// 长按结束（取消）
	function handleLongPressEnd() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		clearProgress();
	}

	// 点击处理：只有非长按时才新建页签
	function handlePlusClick() {
		if (!longPressTriggered) {
			handleCreateTab();
		}
		longPressTriggered = false;
	}

	// 中键点击关闭
	function handleMiddleClick(tabId: string, e: MouseEvent) {
		if (e.button === 1) {
			e.preventDefault();
			folderTabActions.closeTab(tabId);
		}
	}

	// Tab 值变化时切换
	function handleTabChange(value: string) {
		folderTabActions.switchTab(value);
	}

	// 判断是否为垂直布局
	const isVertical = $derived($tabBarLayout === 'left' || $tabBarLayout === 'right');
</script>

<Tabs.Root value={$activeTabId} onValueChange={handleTabChange} class="w-full">
	<div
		class={isVertical
			? 'flex flex-col items-start gap-1 px-1 py-1'
			: 'flex items-start gap-1 px-1 py-1'}
	>
		<!-- 页签列表 -->
		<Tabs.List
			class={isVertical
				? 'flex flex-col h-auto gap-1 bg-transparent p-0 w-full'
				: 'flex h-auto flex-wrap gap-1 bg-transparent p-0'}
		>
			{#each $allTabs as tab (tab.id)}
				<Tabs.Trigger
					value={tab.id}
					class={isVertical
						? 'group h-7 w-full gap-1 rounded-md px-2.5 text-xs data-[state=active]:shadow-sm justify-start'
						: 'group h-7 max-w-[180px] min-w-[80px] gap-1 rounded-md px-2.5 text-xs data-[state=active]:shadow-sm'}
					onauxclick={(e) => handleMiddleClick(tab.id, e)}
					title={tab.currentPath || tab.title}
				>
					<!-- 点击图标触发下拉菜单 -->
					<DropdownMenu.Root>
						<DropdownMenu.Trigger
							class="flex items-center justify-center shrink-0 hover:bg-accent rounded p-0.5 -ml-1"
							onclick={(e: MouseEvent) => e.stopPropagation()}
						>
							{#if tab.pinned}
								<Pin class="h-3 w-3 text-blue-500" />
							{:else if getTabIconType(tab.currentPath) === 'bookmark'}
								<Bookmark class="h-3.5 w-3.5 text-amber-500" />
							{:else if getTabIconType(tab.currentPath) === 'history'}
								<Clock class="h-3.5 w-3.5 text-blue-500" />
							{:else}
								<Folder class="h-3.5 w-3.5" />
							{/if}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content class="w-56">
							<!-- 复制操作 -->
							<DropdownMenu.Item onclick={() => handleDuplicateTab(tab.id)}>
								<Copy class="mr-2 h-4 w-4" />
								复制页签
							</DropdownMenu.Item>
							{#if !isVirtualPath(tab.currentPath)}
								<DropdownMenu.Item onclick={() => handleCopyPath(tab.currentPath)}>
									<ClipboardCopy class="mr-2 h-4 w-4" />
									复制路径
								</DropdownMenu.Item>
							{/if}

							<DropdownMenu.Separator />

							<!-- 固定操作 -->
							<DropdownMenu.Item onclick={() => handleTogglePinned(tab.id)}>
								{#if tab.pinned}
									<PinOff class="mr-2 h-4 w-4" />
									取消固定
								{:else}
									<Pin class="mr-2 h-4 w-4" />
									固定页签
								{/if}
							</DropdownMenu.Item>

							<!-- 定位当前文件 -->
							{#if $activeTab?.focusedItem}
								<DropdownMenu.Item onclick={handleScrollToFocused}>
									<Crosshair class="mr-2 h-4 w-4" />
									定位当前文件
								</DropdownMenu.Item>
							{/if}

							<DropdownMenu.Separator />

							<!-- 关闭操作 -->
							{#if canCloseTab(tab.id)}
								<DropdownMenu.Item onclick={() => handleCloseTab(tab.id)}>
									<X class="mr-2 h-4 w-4" />
									关闭
								</DropdownMenu.Item>
							{/if}
							{#if hasClosableOthers(tab.id)}
								<DropdownMenu.Item onclick={() => handleCloseOthers(tab.id)}>
									<X class="mr-2 h-4 w-4" />
									关闭其他
								</DropdownMenu.Item>
							{/if}
							{#if hasClosableLeft(tab.id)}
								<DropdownMenu.Item onclick={() => handleCloseLeft(tab.id)}>
									<ChevronLeft class="mr-2 h-4 w-4" />
									关闭左侧
								</DropdownMenu.Item>
							{/if}
							{#if hasClosableRight(tab.id)}
								<DropdownMenu.Item onclick={() => handleCloseRight(tab.id)}>
									<ChevronRight class="mr-2 h-4 w-4" />
									关闭右侧
								</DropdownMenu.Item>
							{/if}

							<!-- 重新打开 -->
							{#if $recentlyClosedTabs.length > 0}
								<DropdownMenu.Separator />
								<DropdownMenu.Item onclick={handleReopenClosed}>
									<RotateCcw class="mr-2 h-4 w-4" />
									重新打开关闭的页签
								</DropdownMenu.Item>
							{/if}
						</DropdownMenu.Content>
					</DropdownMenu.Root>

					<span class="flex-1 truncate text-left">{tab.title}</span>
					{#if canCloseTab(tab.id)}
						<span
							class="hover:bg-destructive/20 flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-60 group-hover:hover:opacity-100"
							onclick={(e) => handleCloseTab(tab.id, e)}
							onkeydown={(e) => e.key === 'Enter' && handleCloseTab(tab.id)}
							role="button"
							tabindex="0"
							title="关闭页签"
						>
							<X class="h-3 w-3" />
						</span>
					{/if}
				</Tabs.Trigger>
			{/each}
		</Tabs.List>

		<!-- 新建页签按钮（长按显示标签栏位置菜单，圆形进度条） -->
		<DropdownMenu.Root bind:open={showSettingsPopover}>
			<DropdownMenu.Trigger>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant="ghost"
							size="icon"
							class="h-7 w-7 shrink-0 relative"
							onclick={handlePlusClick}
							onmousedown={handleLongPressStart}
							onmouseup={handleLongPressEnd}
							onmouseleave={handleLongPressEnd}
							ontouchstart={handleLongPressStart}
							ontouchend={handleLongPressEnd}
							ontouchcancel={handleLongPressEnd}
						>
							<!-- 圆形进度条 SVG -->
							{#if longPressProgress > 0}
								<svg
									class="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
									viewBox="0 0 28 28"
								>
									<circle
										cx="14"
										cy="14"
										r="12"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-dasharray={2 * Math.PI * 12}
										stroke-dashoffset={2 * Math.PI * 12 * (1 - longPressProgress / 100)}
										class="text-primary opacity-60"
									/>
								</svg>
							{/if}
							<Plus class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>新建页签（长按设置位置）</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content class="w-48">
				<!-- 标签栏位置选项 -->
				<DropdownMenu.Label>标签栏位置</DropdownMenu.Label>
				<DropdownMenu.Separator />
				<DropdownMenu.Item onclick={() => handleSetTabBarLayout('top')}>
					<PanelTop class="mr-2 h-4 w-4" />
					上
					{#if $tabBarLayout === 'top'}
						<Check class="ml-auto h-4 w-4" />
					{/if}
				</DropdownMenu.Item>
				<DropdownMenu.Item onclick={() => handleSetTabBarLayout('bottom')}>
					<PanelBottom class="mr-2 h-4 w-4" />
					下
					{#if $tabBarLayout === 'bottom'}
						<Check class="ml-auto h-4 w-4" />
					{/if}
				</DropdownMenu.Item>
				<DropdownMenu.Item onclick={() => handleSetTabBarLayout('left')}>
					<PanelLeft class="mr-2 h-4 w-4" />
					左
					{#if $tabBarLayout === 'left'}
						<Check class="ml-auto h-4 w-4" />
					{/if}
				</DropdownMenu.Item>
				<DropdownMenu.Item onclick={() => handleSetTabBarLayout('right')}>
					<PanelRight class="mr-2 h-4 w-4" />
					右
					{#if $tabBarLayout === 'right'}
						<Check class="ml-auto h-4 w-4" />
					{/if}
				</DropdownMenu.Item>
				<!-- 重新打开关闭的页签 -->
				{#if $recentlyClosedTabs.length > 0}
					<DropdownMenu.Separator />
					<DropdownMenu.Item onclick={handleReopenClosed}>
						<RotateCcw class="mr-2 h-4 w-4" />
						重新打开关闭的页签
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</Tabs.Root>
