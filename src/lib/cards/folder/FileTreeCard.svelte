<script lang="ts">
/**
 * 文件树卡片
 * 显示文件夹树结构
 */
import FolderTree from '$lib/components/panels/folderPanel/components/FolderTree.svelte';
import { tabFolderTreeConfig } from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';
import { get } from 'svelte/store';

let config = $state(get(tabFolderTreeConfig));

$effect(() => {
	const unsub = tabFolderTreeConfig.subscribe(v => { config = v; });
	return unsub;
});
</script>

<div class="flex-1 min-h-0 overflow-auto">
	<FolderTree />
</div>
