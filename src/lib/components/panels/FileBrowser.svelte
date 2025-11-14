<!-- FileBrowser.svelte - 重定向到新的模块化组件 -->
<script lang="ts">
  import FileBrowserPanel from './file/FileBrowserPanel.svelte';
  
  // 导出所有 props 以保持兼容性
  export let initialPath = '';
  export let showBookmarks = true;
  export let showHistory = true;
  export let allowMultiSelect = true;
</script>

<FileBrowserPanel {initialPath} {showBookmarks} {showHistory} {allowMultiSelect} />

<!-- 
  这个文件现在是新模块化 FileBrowserPanel 的简单包装器。
  所有的实际功能已经迁移到 file/ 目录下的模块化组件中。
  
  迁移包括：
  - FileBrowserPanel.svelte: 主容器组件
  - hooks/useFileBrowser.ts: 业务逻辑 hook
  - hooks/useThumbnailQueue.ts: 缩略图队列管理
  - services/fileBrowserService.ts: API 服务层
  - services/thumbnailQueueService.ts: 缩略图队列服务
  - file-browser-toolbar.svelte: 顶部工具栏
  - file-browser-list.svelte: 文件列表
  - file-card.svelte: 文件卡片
  - file-browser-sidebar.svelte: 侧边栏
  - file-browser-context-menu.svelte: 右键菜单
-->