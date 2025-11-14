<!-- file-browser-context-menu.svelte - 右键菜单 -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { flyAndScale } from 'svelte/transition';
  import FileOpen from 'lucide-svelte/icons/file-open';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  import Copy from 'lucide-svelte/icons/copy';
  import Scissors from 'lucide-svelte/icons/scissors';
  import FolderPlus from 'lucide-svelte/icons/folder-plus';
  import Edit3 from 'lucide-svelte/icons/edit-3';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Archive from 'lucide-svelte/icons/archive';
  import Star from 'lucide-svelte/icons/star';
  import Info from 'lucide-svelte/icons/info';
  
  interface Props {
    visible?: boolean;
    position?: { x: number; y: number };
    targetItem?: any;
  }
  
  let {
    visible = false,
    position = { x: 0, y: 0 },
    targetItem = null
  }: Props = $props();
  
  const dispatch = createEventDispatcher();
  
  function handleAction(type: string, data?: any) {
    dispatch('action', { type, data });
    visible = false;
  }
  
  // 点击外部关闭菜单
  function handleClickOutside() {
    visible = false;
  }
  
  // 阻止右键菜单冒泡
  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }
</script>

{#if visible}
  <div 
    class="context-menu-overlay"
    on:click={handleClickOutside}
    on:contextmenu={handleContextMenu}
  >
    <div 
      class="context-menu"
      style="left: {position.x}px; top: {position.y}px;"
      transition:flyAndScale
    >
      <!-- 打开操作 -->
      <div class="menu-section">
        <button 
          class="menu-item"
          on:click={() => handleAction('open')}
        >
          <FileOpen />
          <span>打开</span>
          <kbd>Enter</kbd>
        </button>
        
        <button 
          class="menu-item"
          on:click={() => handleAction('openExternal')}
        >
          <ExternalLink />
          <span>系统打开</span>
        </button>
        
        {#if targetItem?.is_dir}
          <button 
            class="menu-item"
            on:click={() => handleAction('openNewTab')}
          >
            <FileOpen />
            <span>新标签页打开</span>
            <kbd>Ctrl+Enter</kbd>
          </button>
        {/if}
      </div>
      
      <!-- 编辑操作 -->
      <div class="menu-section">
        <button 
          class="menu-item"
          on:click={() => handleAction('rename')}
        >
          <Edit3 />
          <span>重命名</span>
          <kbd>F2</kbd>
        </button>
        
        <button 
          class="menu-item"
          on:click={() => handleAction('copy')}
        >
          <Copy />
          <span>复制</span>
          <kbd>Ctrl+C</kbd>
        </button>
        
        <button 
          class="menu-item"
          on:click={() => handleAction('cut')}
        >
          <Scissors />
          <span>剪切</span>
          <kbd>Ctrl+X</kbd>
        </button>
        
        <button 
          class="menu-item"
          on:click={() => handleAction('paste')}
        >
          <Copy />
          <span>粘贴</span>
          <kbd>Ctrl+V</kbd>
        </button>
      </div>
      
      <!-- 文件夹操作 -->
      {#if targetItem?.is_dir}
        <div class="menu-section">
          <button 
            class="menu-item"
            on:click={() => handleAction('createFolder')}
          >
            <FolderPlus />
            <span>新建文件夹</span>
          </button>
        </div>
      {/if}
      
      <!-- 压缩包操作 -->
      {#if targetItem?.name?.match(/\.(zip|cbz|cbr|cb7|rar|7z)$/i)}
        <div class="menu-section">
          <button 
            class="menu-item"
            on:click={() => handleAction('extract')}
          >
            <Archive />
            <span>解压缩</span>
          </button>
        </div>
      {/if}
      
      <!-- 书签操作 -->
      <div class="menu-section">
        <button 
          class="menu-item"
          on:click={() => handleAction('addBookmark')}
        >
          <Star />
          <span>添加书签</span>
        </button>
      </div>
      
      <!-- 属性 -->
      <div class="menu-section">
        <button 
          class="menu-item"
          on:click={() => handleAction('properties')}
        >
          <Info />
          <span>属性</span>
        </button>
      </div>
      
      <!-- 危险操作 -->
      <div class="menu-section danger">
        <button 
          class="menu-item danger"
          on:click={() => handleAction('delete')}
        >
          <Trash2 />
          <span>删除</span>
          <kbd>Delete</kbd>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .context-menu-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    background: transparent;
  }
  
  .context-menu {
    position: fixed;
    min-width: 200px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
    padding: 4px;
    z-index: 1001;
    max-height: 80vh;
    overflow-y: auto;
  }
  
  .menu-section {
    padding: 4px 0;
  }
  
  .menu-section:not(:last-child) {
    border-bottom: 1px solid var(--border);
  }
  
  .menu-section.danger {
    border-top: 1px solid var(--border);
  }
  
  .menu-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    color: var(--foreground);
    transition: all 0.2s;
  }
  
  .menu-item:hover {
    background: var(--surface-hover);
  }
  
  .menu-item:active {
    background: var(--surface-active);
  }
  
  .menu-item.danger {
    color: var(--destructive);
  }
  
  .menu-item.danger:hover {
    background: var(--destructive-selected);
  }
  
  .menu-item :global(svg) {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  
  .menu-item span {
    flex: 1;
    text-align: left;
  }
  
  .menu-item kbd {
    padding: 2px 6px;
    font-size: 11px;
    font-family: monospace;
    background: var(--muted);
    color: var(--muted-foreground);
    border-radius: 4px;
    border: 1px solid var(--border);
  }
  
  /* 动画 */
  .context-menu {
    transform-origin: top left;
  }
</style>