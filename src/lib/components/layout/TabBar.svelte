<script lang="ts">
	/**
	 * Tab Bar Component
	 * 标签栏组件 - 显示和管理多个标签
	 */
	import { tabManager, type TabInfo } from '$lib/core/tabs/tabManager';
	import { Button } from '$lib/components/ui/button';
	import { X, Plus } from '@lucide/svelte';
	import { windowManager } from '$lib/core/windows/windowManager';

	let tabs = $derived(tabManager.getAllTabs());
	let activeTab = $derived(tabManager.getActiveTab());

	async function handleCreateTab() {
		tabManager.createTab();
	}

	function handleSwitchTab(tabId: string) {
		tabManager.switchToTab(tabId);
	}

	function handleCloseTab(tabId: string, e: MouseEvent) {
		e.stopPropagation();
		tabManager.closeTab(tabId);
	}

	async function handleOpenInNewWindow(tabId: string) {
		const tab = tabManager.getAllTabs().find(t => t.id === tabId);
		if (tab?.bookPath) {
			await windowManager.createViewerWindow(tab.bookPath);
		}
	}
</script>

<div class="flex items-center gap-1 border-b bg-secondary/50 px-2 py-1 overflow-x-auto">
	{#each tabs as tab (tab.id)}
		<button
			class="flex items-center gap-2 px-3 py-1.5 rounded-t-md text-sm transition-colors relative group min-w-[120px] max-w-[200px]"
			class:bg-background={activeTab?.id === tab.id}
			class:text-foreground={activeTab?.id === tab.id}
			class:bg-secondary/50={activeTab?.id !== tab.id}
			class:text-muted-foreground={activeTab?.id !== tab.id}
			onclick={() => handleSwitchTab(tab.id)}
			title={tab.title}
		>
			<span class="truncate flex-1 text-left">{tab.title}</span>
			<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
				<Button
					variant="ghost"
					size="icon"
					class="h-4 w-4"
					onclick={(e) => handleOpenInNewWindow(tab.id)}
					title="在新窗口中打开"
				>
					<Plus class="h-3 w-3" />
				</Button>
				{#if tabs.length > 1}
					<Button
						variant="ghost"
						size="icon"
						class="h-4 w-4 hover:bg-destructive"
						onclick={(e) => handleCloseTab(tab.id, e)}
						title="关闭标签"
					>
						<X class="h-3 w-3" />
					</Button>
				{/if}
			</div>
		</button>
	{/each}
	
	<Button
		variant="ghost"
		size="icon"
		class="h-7 w-7"
		onclick={handleCreateTab}
		title="新建标签"
	>
		<Plus class="h-4 w-4" />
	</Button>
</div>






