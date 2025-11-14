<!-- icon-test.svelte - 图标测试组件 -->
<script lang="ts">
  import { File, Folder, Archive, Check, X, Trash2, Home, ArrowLeft, ArrowRight, RefreshCw, Grid3x3, List, Search, FolderOpen, Bookmark, Clock, Star, ExternalLink, Copy, Scissors, FolderPlus, Edit3, Info } from '@lucide/svelte';
  
  const icons = [
    { name: 'File', component: File },
    { name: 'Folder', component: Folder },
    { name: 'Archive', component: Archive },
    { name: 'Check', component: Check },
    { name: 'X', component: X },
    { name: 'Trash2', component: Trash2 },
    { name: 'Home', component: Home },
    { name: 'ArrowLeft', component: ArrowLeft },
    { name: 'ArrowRight', component: ArrowRight },
    { name: 'RefreshCw', component: RefreshCw },
    { name: 'Grid3x3', component: Grid3x3 },
    { name: 'List', component: List },
    { name: 'Search', component: Search },
    { name: 'FolderOpen', component: FolderOpen },
    { name: 'Bookmark', component: Bookmark },
    { name: 'Clock', component: Clock },
    { name: 'Star', component: Star },
    { name: 'ExternalLink', component: ExternalLink },
    { name: 'Copy', component: Copy },
    { name: 'Scissors', component: Scissors },
    { name: 'FolderPlus', component: FolderPlus },
    { name: 'Edit3', component: Edit3 },
    { name: 'Info', component: Info }
  ];
</script>

<div class="icon-test">
  <h2>Lucide Icons Test</h2>
  <div class="icon-grid">
    {#each icons as icon (icon.name)}
      <div class="icon-item">
        <svelte:component this={icon.component} />
        <span>{icon.name}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .icon-test {
    padding: 20px;
  }
  
  .icon-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 16px;
  }
  
  .icon-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  
  .icon-item :global(svg) {
    width: 24px;
    height: 24px;
  }
  
  .icon-item span {
    font-size: 12px;
    text-align: center;
  }
</style>