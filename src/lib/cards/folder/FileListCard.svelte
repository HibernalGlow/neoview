<script lang="ts">
/**
 * 文件列表卡片
 * 显示当前文件夹的文件列表（使用 FolderStack）
 * 注意：需要从 FolderPanel 上下文获取必需参数
 */
import FolderStack from '$lib/components/panels/folderPanel/components/FolderStack.svelte';
import { 
	activeTabId, 
	tabCurrentPath,
	getTabNavigationCommand
} from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';
import { get } from 'svelte/store';

let currentTabId = $state(get(activeTabId));
let currentPath = $state(get(tabCurrentPath));
let navCommand = $derived(getTabNavigationCommand(currentTabId));

$effect(() => {
	const unsub1 = activeTabId.subscribe(v => { currentTabId = v; });
	const unsub2 = tabCurrentPath.subscribe(v => { currentPath = v; });
	return () => { unsub1(); unsub2(); };
});
</script>

<div class="flex-1 min-h-0 overflow-hidden">
	{#if navCommand}
		<FolderStack 
			tabId={currentTabId} 
			initialPath={currentPath} 
			navigationCommand={navCommand}
		/>
	{:else}
		<div class="flex items-center justify-center h-full text-muted-foreground text-sm">
			正在加载...
		</div>
	{/if}
</div>
