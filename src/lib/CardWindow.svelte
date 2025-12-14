<script lang="ts">
	/**
	 * CardWindow - 卡片独立窗口组件
	 * 支持多标签页的卡片窗口，从 URL 参数获取窗口 ID 和初始卡片
	 * Requirements: 1.3, 2.2, 6.1, 6.2, 6.3, 6.4
	 */
	import { onMount, onDestroy } from 'svelte';
	import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { Button } from '$lib/components/ui/button';
	import { X, Maximize, Minus } from '@lucide/svelte';
	import { getOrCreateTabStore, type CardWindowTabStore } from '$lib/stores/cardWindowTabStore.svelte';
	import { cardWindowManager } from '$lib/core/windows/cardWindowManager';
	import TabBar from '$lib/components/cardwindow/TabBar.svelte';
	import CardRenderer from '$lib/cards/CardRenderer.svelte';

	// 标签页 store
	let tabStore = $state<CardWindowTabStore | null>(null);
	
	// 响应式状态
	let activeCardId = $state<string>('');
	let windowTitle = $state('卡片窗口');
	let windowId = $state<string>('');
	let appWindow: ReturnType<typeof getCurrentWebviewWindow> | null = null;

	/**
	 * 从 URL 查询参数解析窗口 ID
	 */
	function getWindowIdFromUrl(): string {
		const params = new URLSearchParams(window.location.search);
		return params.get('windowId') || '';
	}

	/**
	 * 从 URL 查询参数获取初始卡片 ID
	 */
	function getInitialCardIdFromUrl(): string | null {
		const params = new URLSearchParams(window.location.search);
		return params.get('cardId');
	}

	onMount(async () => {
		// 从 URL 解析窗口 ID 和初始卡片 ID
		windowId = getWindowIdFromUrl();
		const initialCardId = getInitialCardIdFromUrl();
		
		if (!windowId) {
			console.error('[CardWindow] 无法从 URL 解析窗口 ID');
			return;
		}
		
		console.log('[CardWindow] 初始化窗口:', windowId, '初始卡片:', initialCardId);
		
		// 获取当前窗口
		appWindow = getCurrentWebviewWindow();
		
		// 初始化标签页 store
		tabStore = getOrCreateTabStore(windowId, initialCardId || undefined);
		
		// 更新响应式状态
		updateState();

		// 设置窗口标题
		if (tabStore?.activeTab && appWindow) {
			windowTitle = tabStore.activeTab.title;
			await appWindow.setTitle(windowTitle);
		}

		// 添加键盘快捷键监听
		window.addEventListener('keydown', handleKeyDown);
	});

	onDestroy(() => {
		window.removeEventListener('keydown', handleKeyDown);
	});

	function updateState() {
		if (tabStore) {
			activeCardId = tabStore.activeTab?.cardId || '';
			windowTitle = tabStore.activeTab?.title || '卡片窗口';
		}
	}

	// 派生状态
	const sortedTabs = $derived(tabStore?.sortedTabs || []);
	const currentActiveTabId = $derived(tabStore?.activeTabId || '');
	const tabCount = $derived(tabStore?.tabCount || 0);

	// 键盘快捷键处理
	function handleKeyDown(e: KeyboardEvent) {
		if (!tabStore) return;

		// Ctrl+W: 关闭当前标签页
		if (e.ctrlKey && e.key === 'w') {
			e.preventDefault();
			closeActiveTab();
		}
		// Ctrl+Tab: 下一个标签页
		else if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault();
			tabStore.nextTab();
			updateState();
		}
		// Ctrl+Shift+Tab: 上一个标签页
		else if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
			e.preventDefault();
			tabStore.previousTab();
			updateState();
		}
		// Ctrl+T: 打开添加卡片菜单
		else if (e.ctrlKey && e.key === 't') {
			e.preventDefault();
			showAddCardDropdown = true;
		}
	}

	let showAddCardDropdown = $state(false);

	// 标签页操作
	function handleTabClick(tabId: string) {
		if (!tabStore) return;
		tabStore.setActiveTab(tabId);
		updateState();
		appWindow?.setTitle(windowTitle);
	}

	function handleTabClose(tabId: string) {
		if (!tabStore) return;
		
		// 如果只有一个标签页，关闭整个窗口
		if (tabCount === 1) {
			closeWindow();
			return;
		}

		tabStore.removeTab(tabId);
		updateState();
		cardWindowManager.saveConfigs();
	}

	function closeActiveTab() {
		if (!tabStore || !currentActiveTabId) return;
		handleTabClose(currentActiveTabId);
	}

	function handleTabReorder(tabId: string, newOrder: number) {
		if (!tabStore) return;
		tabStore.moveTab(tabId, newOrder);
		cardWindowManager.saveConfigs();
	}

	function handleAddCard(cardId: string) {
		if (!tabStore) return;
		tabStore.addTab(cardId);
		updateState();
		cardWindowManager.saveConfigs();
		showAddCardDropdown = false;
	}

	function handleTabDuplicate(tabId: string) {
		if (!tabStore) return;
		tabStore.duplicateTab(tabId);
		updateState();
		cardWindowManager.saveConfigs();
	}

	// 窗口控制
	async function minimizeWindow() {
		await appWindow?.minimize();
	}

	async function maximizeWindow() {
		await appWindow?.toggleMaximize();
	}

	async function closeWindow() {
		if (windowId) {
			await cardWindowManager.closeCardWindow(windowId);
		}
	}
</script>

<svelte:head>
	<title>{windowTitle} - NeoView</title>
</svelte:head>

<div class="h-screen w-screen flex flex-col bg-background select-none" data-tauri-drag-region>
	<!-- 标题栏 -->
	<div 
		class="h-8 bg-secondary/95 backdrop-blur-sm flex items-center justify-between px-2 border-b"
		data-tauri-drag-region
	>
		<div class="flex items-center gap-2 flex-1 min-w-0" data-tauri-drag-region>
			<span class="text-sm font-medium truncate" data-tauri-drag-region>{windowTitle}</span>
		</div>
		<div class="flex items-center gap-0.5">
			<Button 
				variant="ghost" 
				size="icon" 
				class="h-6 w-6 hover:bg-muted" 
				onclick={minimizeWindow}
			>
				<Minus class="h-3 w-3" />
			</Button>
			<Button 
				variant="ghost" 
				size="icon" 
				class="h-6 w-6 hover:bg-muted" 
				onclick={maximizeWindow}
			>
				<Maximize class="h-3 w-3" />
			</Button>
			<Button 
				variant="ghost" 
				size="icon" 
				class="h-6 w-6 hover:bg-destructive hover:text-destructive-foreground" 
				onclick={closeWindow}
			>
				<X class="h-3.5 w-3.5" />
			</Button>
		</div>
	</div>

	<!-- 标签栏 -->
	{#if tabStore && sortedTabs.length > 0}
		<TabBar
			tabs={sortedTabs}
			activeTabId={currentActiveTabId}
			onTabClick={handleTabClick}
			onTabClose={handleTabClose}
			onTabReorder={handleTabReorder}
			onAddCard={handleAddCard}
			onTabDuplicate={handleTabDuplicate}
			bind:showAddCardDropdown
		/>
	{/if}

	<!-- 内容区域 -->
	<div class="flex-1 overflow-hidden">
		{#if activeCardId}
			<div class="h-full overflow-auto p-2">
				<CardRenderer cardId={activeCardId} panelId="cardwindow" />
			</div>
		{:else}
			<div class="h-full flex items-center justify-center text-muted-foreground">
				<p>没有打开的标签页</p>
			</div>
		{/if}
	</div>
</div>
