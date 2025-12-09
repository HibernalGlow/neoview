<script lang="ts">
/**
 * HistoryListCard - 历史记录面板
 * 与 FolderMainCard、BookmarkListCard 平级的一等公民
 * 使用共享的 FileListPanel 组件
 */
import { FileListPanel } from '$lib/cards/shared';
import { VIRTUAL_PATHS } from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';
</script>

<!-- 使用共享的文件列表面板 -->
<FileListPanel initialPath={VIRTUAL_PATHS.HISTORY} mode="history" />
