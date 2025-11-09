<script lang="ts">
  import { Folder, File, Image, Trash2, RefreshCw, FileArchive, FolderOpen } from '@lucide/svelte';
  import { FileSystemAPI } from '$lib/api';
  import type { FsItem } from '$lib/types';
  import { openBook } from '$lib/stores/book.svelte';
  import { navigateToImage } from '$lib/api';
  import PathBar from '../ui/PathBar.svelte';
  import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';

  // 使用全局状态
  let currentPath = $state('');
  let items = $state<FsItem[]>([]);
  let loading = $state(false);
  let error = $state('');
  let thumbnails = $state<Map<string, string>>(new Map());
  let isArchiveView = $state(false);
  let currentArchivePath = $state('');
  let selectedIndex = $state(-1);
  let fileListContainer: HTMLDivElement | undefined;

  // 订阅全局状态
  $effect(() => {
    const unsubscribe = fileBrowserStore.subscribe(state => {
      currentPath = state.currentPath;
      items = state.items;
      loading = state.loading;
      error = state.error;
      isArchiveView = state.isArchiveView;
      currentArchivePath = state.currentArchivePath;
      selectedIndex = state.selectedIndex;
      thumbnails = state.thumbnails;
    });

    return unsubscribe;
  });

  /**
   * 选择文件夹
   */
  async function selectFolder() {
    try {
      const path = await FileSystemAPI.selectFolder();
      if (path) {
        await loadDirectory(path);
      }
    } catch (err) {
      fileBrowserStore.setError(String(err));
    }
  }

  /**
   * 加载目录内容
   */
  async function loadDirectory(path: string) {
    console.log('📂 loadDirectory called with path:', path);
    
    fileBrowserStore.setLoading(true);
    fileBrowserStore.setError('');
    fileBrowserStore.clearThumbnails();
    fileBrowserStore.setArchiveView(false);
    fileBrowserStore.setSelectedIndex(-1);
    fileBrowserStore.setCurrentPath(path);

    try {
      console.log('🔄 Calling FileSystemAPI.browseDirectory...');
      const loadedItems = await FileSystemAPI.browseDirectory(path);
      console.log('✅ Loaded', loadedItems.length, 'items:', loadedItems.map(i => i.name));
      
      fileBrowserStore.setItems(loadedItems);
      
      // 异步加载缩略图
      for (const item of loadedItems) {
        if (item.isImage) {
          loadThumbnail(item.path);
        }
      }
    } catch (err) {
      console.error('❌ Error loading directory:', err);
      fileBrowserStore.setError(String(err));
      fileBrowserStore.setItems([]);
    } finally {
      fileBrowserStore.setLoading(false);
    }
  }

  /**
   * 加载压缩包内容
   */
  async function loadArchive(path: string) {
    console.log('📦 loadArchive called with path:', path);
    
    fileBrowserStore.setLoading(true);
    fileBrowserStore.setError('');
    fileBrowserStore.clearThumbnails();
    fileBrowserStore.setArchiveView(true, path);
    fileBrowserStore.setSelectedIndex(-1);

    try {
      const loadedItems = await FileSystemAPI.listArchiveContents(path);
      console.log('✅ Loaded', loadedItems.length, 'archive items');
      
      fileBrowserStore.setItems(loadedItems);
      
      // 异步加载压缩包内图片的缩略图
      for (const item of loadedItems) {
        if (item.isImage) {
          loadArchiveThumbnail(item.path);
        }
      }
    } catch (err) {
      console.error('❌ Error loading archive:', err);
      fileBrowserStore.setError(String(err));
      fileBrowserStore.setItems([]);
    } finally {
      fileBrowserStore.setLoading(false);
    }
  }

  /**
   * 加载压缩包内图片的缩略图
   */
  async function loadArchiveThumbnail(filePath: string) {
    try {
      const thumbnail = await FileSystemAPI.generateArchiveThumbnail(
        currentArchivePath,
        filePath,
        256
      );
      fileBrowserStore.addThumbnail(filePath, thumbnail);
    } catch (err) {
      console.error('Failed to load archive thumbnail:', err);
    }
  }

  /**
   * 检查并打开文件
   */
  async function openFile(item: FsItem) {
    console.log('=== openFile called ===');
    console.log('Item:', {
      name: item.name,
      isDir: item.isDir,
      isImage: item.isImage,
      path: item.path,
      size: item.size
    });
    
    try {
      if (item.isDir) {
        // 📁 文件夹：只能浏览,不能作为 book 打开
        console.log('📁 Opening directory:', item.path);
        await navigateToDirectory(item.path);
        console.log('✅ Directory navigation completed');
      } else {
        // 检查是否为压缩包
        const isArchive = await FileSystemAPI.isSupportedArchive(item.path);
        console.log('Is archive:', isArchive);
        
        if (isArchive) {
          // 📦 压缩包：只能浏览内容,暂时不能作为 book 打开
          console.log('📦 Loading archive contents (browse only):', item.path);
          await loadArchive(item.path);
          console.log('✅ Archive loaded for browsing');
        } else if (item.isImage) {
          // 🖼️ 图片：暂时注释掉作为 book 打开
          console.log('🖼️ Image clicked, but book opening is temporarily disabled:', item.path);
          console.log('⚠️ To enable: uncomment openImage() and openImageFromArchive()');
          
          // TODO: 等文件夹导航修复后再启用
          // if (isArchiveView) {
          //   await openImageFromArchive(item.path);
          // } else {
          //   await openImage(item.path);
          // }
        } else {
          console.log('⚠️ Unknown file type, ignoring');
        }
      }
    } catch (err) {
      console.error('❌ Error in openFile:', err);
      fileBrowserStore.setError(String(err));
    }
  }

  /**
   * 从压缩包打开图片
   */
  async function openImageFromArchive(filePath: string) {
    try {
      await openBook(currentArchivePath);
      // 跳转到指定图片
      await navigateToImage(filePath);
    } catch (err) {
      fileBrowserStore.setError(String(err));
    }
  }

  /**
   * 返回上一级
   */
  async function goBack() {
    if (isArchiveView) {
      // 从压缩包视图返回到文件系统
      isArchiveView = false;
      const lastBackslash = currentArchivePath.lastIndexOf('\\');
      const lastSlash = currentArchivePath.lastIndexOf('/');
      const lastSeparator = Math.max(lastBackslash, lastSlash);
      const parentDir = lastSeparator > 0 ? currentArchivePath.substring(0, lastSeparator) : currentPath;
      await loadDirectory(parentDir);
    } else if (currentPath) {
      // 文件系统中返回上一级
      const lastBackslash = currentPath.lastIndexOf('\\');
      const lastSlash = currentPath.lastIndexOf('/');
      const lastSeparator = Math.max(lastBackslash, lastSlash);
      
      if (lastSeparator > 0) {
        const parentDir = currentPath.substring(0, lastSeparator);
        // 确保不是驱动器根目录后面的路径
        if (parentDir && !parentDir.endsWith(':')) {
          await loadDirectory(parentDir);
        }
      }
    }
  }

  /**
   * 加载单个缩略图
   */
  async function loadThumbnail(path: string) {
    try {
      const thumbnail = await FileSystemAPI.generateFileThumbnail(path);
      fileBrowserStore.addThumbnail(path, thumbnail);
    } catch (err) {
      console.error('Failed to load thumbnail:', err);
    }
  }

  /**
   * 导航到目录
   */
  async function navigateToDirectory(path: string) {
    console.log('🚀 navigateToDirectory called with path:', path);
    if (!path) {
      console.warn('⚠️ Empty path provided to navigateToDirectory');
      return;
    }
    await loadDirectory(path);
  }

  /**
   * 打开图片文件
   */
  async function openImage(path: string) {
    try {
      // 获取图片所在的目录
      const lastBackslash = path.lastIndexOf('\\');
      const lastSlash = path.lastIndexOf('/');
      const lastSeparator = Math.max(lastBackslash, lastSlash);
      const parentDir = lastSeparator > 0 ? path.substring(0, lastSeparator) : path;
      
      await openBook(parentDir);
      // 跳转到指定图片
      await navigateToImage(path);
    } catch (err) {
      fileBrowserStore.setError(String(err));
    }
  }

  /**
   * 删除文件
   */
  async function deleteItem(path: string) {
    if (!confirm('确定要删除此项吗？')) return;

    try {
      await FileSystemAPI.moveToTrash(path);
      await loadDirectory(currentPath);
    } catch (err) {
      fileBrowserStore.setError(String(err));
    }
  }

  /**
   * 刷新
   */
  async function refresh() {
    if (currentPath) {
      await loadDirectory(currentPath);
    }
  }

  /**
   * 格式化文件大小
   */
  function formatSize(bytes: number, isDir: boolean): string {
    if (isDir) {
      // 对于目录，显示子项数量
      return bytes === 0 ? '空文件夹' : `${bytes} 项`;
    }
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  /**
   * 格式化日期
   */
  function formatDate(timestamp?: number): string {
    if (!timestamp) return '-';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  }

  /**
   * 键盘导航处理
   */
  function handleKeydown(e: KeyboardEvent) {
    if (items.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        fileBrowserStore.setSelectedIndex(Math.min(selectedIndex + 1, items.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        fileBrowserStore.setSelectedIndex(Math.max(selectedIndex - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          openFile(items[selectedIndex]);
        }
        break;
      case 'Home':
        e.preventDefault();
        fileBrowserStore.setSelectedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        fileBrowserStore.setSelectedIndex(items.length - 1);
        break;
      case 'Backspace':
        e.preventDefault();
        goBack();
        break;
      case 'F5':
        e.preventDefault();
        refresh();
        break;
    }
  }

  /**
   * 处理路径栏导航
   */
  async function handlePathNavigate(path: string) {
    if (path) {
      await navigateToDirectory(path);
    } else {
      // 返回根目录/主页
      currentPath = '';
      items = [];
      isArchiveView = false;
    }
  }
</script>

<div class="flex h-full flex-col">
  <!-- 路径面包屑导航 -->
  <PathBar 
    bind:currentPath={currentPath} 
    isArchive={isArchiveView}
    onNavigate={handlePathNavigate}
  />

  <!-- 工具栏 -->
  <div class="flex items-center gap-2 border-b p-2 bg-white">
    <button
      onclick={selectFolder}
      class="flex items-center gap-2 rounded bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600 transition-colors"
    >
      <FolderOpen class="h-4 w-4" />
      选择文件夹
    </button>

    {#if currentPath || isArchiveView}
      <button
        onclick={goBack}
        class="rounded p-1.5 hover:bg-gray-100 transition-colors"
        title="返回上一级 (Backspace)"
      >
        ←
      </button>

      <button
        onclick={refresh}
        class="rounded p-1.5 hover:bg-gray-100 transition-colors"
        title="刷新 (F5)"
      >
        <RefreshCw class="h-4 w-4" />
      </button>

      <div class="flex-1"></div>

      {#if isArchiveView}
        <div class="flex items-center gap-2 text-sm text-gray-600">
          <FileArchive class="h-4 w-4 text-purple-500" />
          <span>压缩包模式</span>
        </div>
      {/if}
    {/if}
  </div>

  <!-- 错误提示 -->
  {#if error}
    <div class="m-2 rounded bg-red-50 p-3 text-sm text-red-600">
      {error}
    </div>
  {/if}

  <!-- 加载状态 -->
  {#if loading}
    <div class="flex flex-1 items-center justify-center">
      <div class="flex flex-col items-center gap-3">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <div class="text-sm text-gray-500">加载中...</div>
      </div>
    </div>
  {:else if items.length === 0 && currentPath}
    <div class="flex flex-1 items-center justify-center">
      <div class="text-center text-gray-400">
        <Folder class="mx-auto mb-2 h-16 w-16 opacity-50" />
        <p class="text-sm">此目录为空</p>
      </div>
    </div>
  {:else if items.length === 0}
    <div class="flex flex-1 items-center justify-center">
      <div class="text-center">
        <FolderOpen class="mx-auto mb-4 h-20 w-20 text-gray-300" />
        <p class="text-lg font-medium text-gray-600 mb-2">选择文件夹开始浏览</p>
        <p class="text-sm text-gray-400 mb-6">点击上方的"选择文件夹"按钮</p>
        <button
          onclick={selectFolder}
          class="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
        >
          选择文件夹
        </button>
      </div>
    </div>
  {:else}
    <!-- 文件列表 -->
    <div 
      bind:this={fileListContainer}
      class="flex-1 overflow-y-auto p-2 focus:outline-none" 
      tabindex="0" 
      onkeydown={handleKeydown}
      onclick={() => fileListContainer?.focus()}
    >
      <div class="grid grid-cols-1 gap-2">
        {#each items as item, index (item.path)}
          <div
            class="flex items-center gap-3 rounded border p-2 cursor-pointer transition-colors {selectedIndex === index ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50 border-gray-200'}"
            onclick={() => {
              fileBrowserStore.setSelectedIndex(index);
              openFile(item);
            }}
          >
            <!-- 图标/缩略图 -->
            <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center">
              {#if item.isDir}
                <Folder class="h-8 w-8 text-blue-500 transition-colors group-hover:text-blue-600" />
              {:else if item.name.endsWith('.zip') || item.name.endsWith('.cbz')}
                <FileArchive class="h-8 w-8 text-purple-500 transition-colors group-hover:text-purple-600" />
              {:else if item.isImage && thumbnails.has(item.path)}
                <img
                  src={thumbnails.get(item.path)}
                  alt={item.name}
                  class="h-12 w-12 rounded object-cover transition-opacity hover:opacity-80"
                />
              {:else if item.isImage}
                <Image class="h-8 w-8 text-green-500 transition-colors group-hover:text-green-600" />
              {:else}
                <File class="h-8 w-8 text-gray-400 transition-colors group-hover:text-gray-500" />
              {/if}
            </div>

            <!-- 信息 -->
            <div class="min-w-0 flex-1">
              <div class="truncate font-medium">{item.name}</div>
              <div class="text-xs text-gray-500">
                {formatSize(item.size, item.isDir)} · {formatDate(item.modified)}
              </div>
            </div>

            <!-- 操作按钮 -->
            {#if !isArchiveView}
              <div class="flex gap-1">
                <button
                  onclick={(e) => {
                    e.stopPropagation();
                    deleteItem(item.path);
                  }}
                  class="rounded p-1 hover:bg-red-50"
                  title="删除"
                >
                  <Trash2 class="h-4 w-4 text-red-500" />
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
