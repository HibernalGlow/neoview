<script lang="ts">
/**
 * FolderMainCard - 文件夹面板
 * 与 BookmarkListCard、HistoryListCard 平级的一等公民
 * 使用共享的 FileListPanel 组件
 */
import { FileListPanel } from '$lib/cards/shared';

// ==================== Props ====================
interface Props {
	initialPath?: string;
}
let { initialPath }: Props = $props();
</script>

<!-- 使用共享的文件列表面板 -->
<FileListPanel {initialPath} mode="folder" />
