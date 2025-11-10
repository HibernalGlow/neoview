<script lang="ts">
  import { Folder, FileArchive } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import type { FsItem } from '$lib/types';
  import { FileSystemAPI } from '$lib/api';

  interface Props {
    item: FsItem;
    size?: number;
  }

  let { item, size = 48 }: Props = $props();

  let thumbnail = $state<string | null>(null);
  let loading = $state(false);
  let error = $state(false);

  // 本地缓存
  const cache = new Map<string, string>();

  async function loadFolderThumbnail() {
    if (loading || thumbnail || error) return;

    loading = true;
    try {
      // 直接使用后端API生成文件夹缩略图
      const imageData = await FileSystemAPI.generateFolderThumbnail(item.path, size);
      thumbnail = imageData;
      cache.set(item.path, imageData);
    } catch (err) {
      console.debug('Failed to load folder thumbnail:', err);
      error = true;
    } finally {
      loading = false;
    }
  }

  async function loadArchiveThumbnail() {
    if (loading || thumbnail || error) return;

    loading = true;
    try {
      // 直接使用后端API生成压缩包缩略图
      const imageData = await FileSystemAPI.generateArchiveThumbnail(item.path, size);
      thumbnail = imageData;
      cache.set(item.path, imageData);
    } catch (err) {
      console.debug('Failed to load archive thumbnail:', err);
      error = true;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    // 检查缓存
    const cached = cache.get(item.path);
    if (cached) {
      thumbnail = cached;
      return;
    }

    // 尝试从预缓存的缩略图获取（通过后端API）
    loadPrecachedThumbnail();

    // 如果没有预缓存，则动态生成
    if (item.isDir) {
      loadFolderThumbnail();
    } else if (item.name.endsWith('.zip') || item.name.endsWith('.cbz') || item.name.endsWith('.rar') || item.name.endsWith('.cbr')) {
      loadArchiveThumbnail();
    }
  });

  async function loadPrecachedThumbnail() {
    try {
      // 尝试从后端获取预缓存的缩略图
      const cachedThumbnail = item.isDir
        ? await FileSystemAPI.generateFolderThumbnail(item.path, size)
        : await FileSystemAPI.generateArchiveThumbnail(item.path, size);

      thumbnail = cachedThumbnail;
      cache.set(item.path, cachedThumbnail);
    } catch (err) {
      // 预缓存不存在，继续使用动态生成
      console.debug('预缓存缩略图不存在:', err);
    }
  }
</script>

<div class="flex h-12 w-12 flex-shrink-0 items-center justify-center">
  {#if thumbnail}
    <img
      src={thumbnail}
      alt={item.name}
      class="h-full w-full rounded object-cover transition-opacity hover:opacity-80"
    />
  {:else if error}
    <!-- 回退到默认图标 -->
    {#if item.isDir}
      <Folder class="h-8 w-8 text-blue-500 transition-colors group-hover:text-blue-600" />
    {:else}
      <FileArchive class="h-8 w-8 text-purple-500 transition-colors group-hover:text-purple-600" />
    {/if}
  {:else}
    <!-- 加载中显示默认图标 -->
    {#if item.isDir}
      <Folder class="h-8 w-8 text-blue-500 transition-colors group-hover:text-blue-600 opacity-50" />
    {:else}
      <FileArchive class="h-8 w-8 text-purple-500 transition-colors group-hover:text-purple-600 opacity-50" />
    {/if}
  {/if}
</div>