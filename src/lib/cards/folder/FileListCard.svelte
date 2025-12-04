<script lang="ts">
/**
 * 文件列表卡片
 * 显示当前文件夹的文件列表（使用 FolderStack）
 */
import FolderStack from '$lib/components/panels/folderPanel/components/FolderStack.svelte';
import { writable } from 'svelte/store';
import { 
	activeTabId, 
	tabCurrentPath,
	allTabs
} from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';
import { get } from 'svelte/store';

// 导航命令 store（与 FolderStack 通信）
const navigationCommand = writable<{ type: 'init' | 'push' | 'pop' | 'goto' | 'history'; path?: string; index?: number } | null>(null);

let currentTabId = $state(get(activeTabId));
let currentPath = $state(get(tabCurrentPath));
let tabs = $state(get(allTabs));

$effect(() => {
	const unsub1 = activeTabId.subscribe(v => { currentTabId = v; });
	const unsub2 = tabCurrentPath.subscribe(v => { currentPath = v; });
	const unsub3 = allTabs.subscribe(v => { tabs = v; });
	return () => { unsub1(); unsub2(); unsub3(); };
});

// 获取当前标签页
const currentTab = $derived(tabs.find(t => t.id === currentTabId));
</script>

<div class="flex-1 min-h-0 overflow-hidden">
	{#if currentTab}
		<FolderStack 
			tabId={currentTabId} 
			initialPath={currentTab.currentPath || currentTab.homePath}
			{navigationCommand}
		/>
	{:else}
		<div class="flex items-center justify-center h-full text-muted-foreground text-sm">
			正在加载...
		</div>
	{/if}
</div>
