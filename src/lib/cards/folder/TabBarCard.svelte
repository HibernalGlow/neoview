<script lang="ts">
/**
 * 标签栏卡片
 * 显示文件夹标签页
 */
import FolderTabBar from '$lib/components/panels/folderPanel/components/FolderTabBar.svelte';
import { activeTabId, allTabs } from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';
import { get } from 'svelte/store';

let currentActiveTabId = $state(get(activeTabId));
let currentAllTabs = $state(get(allTabs));

$effect(() => {
	const unsub1 = activeTabId.subscribe(v => { currentActiveTabId = v; });
	const unsub2 = allTabs.subscribe(v => { currentAllTabs = v; });
	return () => { unsub1(); unsub2(); };
});
</script>

<div class="min-w-0">
	<FolderTabBar />
</div>
