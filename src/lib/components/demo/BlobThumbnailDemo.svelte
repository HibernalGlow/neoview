<script lang="ts">
  /**
   * Blob 缩略图演示组件
   * 展示如何使用新的 blob 缩略图系统
   */
  import { onMount } from 'svelte';
  import { thumbnailStore, setupThumbnailEventListener, loadArchiveThumbnail } from '$lib/thumbnailManager';
  
  // 示例压缩包路径
  let archivePath = $state('D:\\path\\to\\archive.zip');
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  
  // 订阅 thumbnailStore
  const thumbnail = $derived(thumbnailStore.get(archivePath));
  
  onMount(async () => {
    // 设置事件监听
    const cleanup = setupThumbnailEventListener();
    
    return cleanup;
  });
  
  async function handleLoadThumbnail() {
    isLoading = true;
    error = null;
    
    try {
      await loadArchiveThumbnail(archivePath);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="p-4 border rounded-lg">
  <h2 class="text-xl font-bold mb-4">Blob 缩略图演示</h2>
  
  <div class="space-y-4">
    <div>
      <label class="block text-sm font-medium mb-1">压缩包路径：</label>
      <input 
        type="text" 
        bind:value={archivePath} 
        class="w-full px-3 py-2 border rounded"
        placeholder="输入压缩包路径..."
      />
    </div>
    
    <button 
      on:click={handleLoadThumbnail}
      disabled={isLoading}
      class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
    >
      {isLoading ? '加载中...' : '加载缩略图'}
    </button>
    
    {#if error}
      <div class="text-red-500">
        错误：{error}
      </div>
    {/if}
    
    {#if thumbnail}
      <div class="space-y-2">
        <h3 class="font-medium">缩略图：</h3>
        <div class="border rounded p-2">
          <img 
            src={thumbnail.url} 
            alt="缩略图" 
            class="max-w-full h-auto"
            style="max-height: 300px;"
          />
        </div>
        <div class="text-sm text-gray-600 space-x-4">
          <span>类型: {thumbnail.isBlob ? 'Blob' : 'File'}</span>
          <span>加载中: {thumbnail.isLoading ? '是' : '否'}</span>
          {#if thumbnail.blobKey}
            <span>Blob Key: {thumbnail.blobKey}</span>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* 组件样式 */
</style>