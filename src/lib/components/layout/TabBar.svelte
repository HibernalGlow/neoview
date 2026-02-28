<script lang="ts">
	/**
	 * Tab Bar Component
	 * 标签栏组件 - 显示和管理多个标签
	 */
	import { tabManager } from '$lib/core/tabs/tabManager';
	import { Button } from '$lib/components/ui/button';
	import { X, Plus } from '@lucide/svelte';

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
</script>

<div class="bg-secondary/50 flex items-center gap-1 overflow-x-auto border-b px-2 py-1">
	{#each tabs as tab (tab.id)}
		<button
			class={`group relative flex min-w-[120px] max-w-[200px] items-center gap-2 rounded-t-md px-3 py-1.5 text-sm transition-colors ${activeTab?.id === tab.id ? 'bg-background text-foreground' : 'bg-secondary/50 text-muted-foreground'}`}
			onclick={() => handleSwitchTab(tab.id)}
			title={tab.title}
		>
			<span class="flex-1 truncate text-left">{tab.title}</span>
			<div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
				{#if tabs.length > 1}
					<Button
						variant="ghost"
						size="icon"
						class="hover:bg-destructive h-4 w-4"
						onclick={(e: MouseEvent) => handleCloseTab(tab.id, e)}
						title="关闭标签"
					>
						<X class="h-3 w-3" />
					</Button>
				{/if}
			</div>
		</button>
	{/each}

	<Button variant="ghost" size="icon" class="h-7 w-7" onclick={handleCreateTab} title="新建标签">
		<Plus class="h-4 w-4" />
	</Button>
</div>
