<script lang="ts">
/**
 * 书签卡片
 * 直接复用 FolderMainCard，共享所有工具栏和浏览功能
 */
import FolderMainCard from '$lib/cards/folder/FolderMainCard.svelte';
import { VIRTUAL_PATHS } from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';
</script>

<FolderMainCard initialPath={VIRTUAL_PATHS.BOOKMARK} />
