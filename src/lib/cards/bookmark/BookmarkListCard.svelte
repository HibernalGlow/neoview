<script lang="ts">
/**
 * BookmarkListCard - 书签面板
 * 与 FolderMainCard、HistoryListCard 平级的一等公民
 * 使用共享的 FileListPanel 组件
 */
import { FileListPanel } from '$lib/cards/shared';
import { VIRTUAL_PATHS } from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';
</script>

<!-- 使用共享的文件列表面板 -->
<FileListPanel initialPath={VIRTUAL_PATHS.BOOKMARK} mode="bookmark" />
