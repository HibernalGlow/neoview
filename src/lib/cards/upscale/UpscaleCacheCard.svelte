<script lang="ts">
/**
 * 超分缓存管理卡片
 * 管理超分文件夹缓存
 */
import { onMount } from 'svelte';
import { Trash2, FolderOpen, RefreshCw, Loader2, HardDrive } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { cacheStats, formatFileSize } from '$lib/stores/upscale/upscalePanelStore.svelte';
import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';
import { FileSystemAPI } from '$lib/api';
import { confirm } from '$lib/stores/confirmDialog.svelte';
import { invoke } from '@tauri-apps/api/core';

let isRefreshing = $state(false);
let isClearing = $state(false);
let isClearingAll = $state(false);
let cleanupDays = $state(30);

async function refreshCacheStats() {
	isRefreshing = true;
	try {
		// 直接调用 Tauri 命令获取缓存统计
		const stats = await invoke<{ total_files: number; total_size: number; cache_dir: string }>('get_pyo3_cache_stats');
		if (stats) {
			cacheStats.value = {
				totalFiles: stats.total_files,
				totalSize: stats.total_size,
				cacheDir: stats.cache_dir
			};
		}
	} catch (err) {
		console.error('刷新缓存统计失败:', err);
		// 尝试使用 pyo3UpscaleManager 作为备选
		try {
			const stats = await pyo3UpscaleManager.getCacheStats();
			if (stats) {
				cacheStats.value = {
					totalFiles: stats.totalFiles,
					totalSize: stats.totalSize,
					cacheDir: stats.cacheDir
				};
			}
		} catch (e) {
			console.error('备选方案也失败:', e);
		}
	} finally {
		isRefreshing = false;
	}
}

async function clearOldCache() {
	const confirmed = await confirm({
		title: '清理过期缓存',
		description: `确定要清除 ${cleanupDays} 天前的超分缓存吗？`,
		confirmText: '清理',
		cancelText: '取消',
		variant: 'default'
	});
	if (!confirmed) return;
	
	isClearing = true;
	try {
		const removed = await pyo3UpscaleManager.cleanupCache(cleanupDays);
		console.log(`已清理 ${removed} 个过期缓存文件`);
		await refreshCacheStats();
	} catch (err) {
		console.error('清除缓存失败:', err);
	} finally {
		isClearing = false;
	}
}

async function clearAllCache() {
	const confirmed = await confirm({
		title: '清除全部缓存',
		description: '确定要清除所有超分缓存吗？此操作不可撤销。',
		confirmText: '全部清除',
		cancelText: '取消',
		variant: 'destructive'
	});
	if (!confirmed) return;
	
	isClearingAll = true;
	try {
		// 清除所有缓存（设置 maxAgeDays 为 0）
		await invoke('clear_all_pyo3_cache');
		await refreshCacheStats();
	} catch (err) {
		console.error('清除全部缓存失败:', err);
		// 回退方案：使用 cleanupCache(0)
		try {
			await pyo3UpscaleManager.cleanupCache(0);
			await refreshCacheStats();
		} catch (e) {
			console.error('回退清除也失败:', e);
		}
	} finally {
		isClearingAll = false;
	}
}

async function openCacheDir() {
	if (!cacheStats.value.cacheDir) return;
	try {
		await FileSystemAPI.showInFileManager(cacheStats.value.cacheDir);
	} catch (err) {
		console.error('打开缓存目录失败:', err);
	}
}

// 组件挂载时刷新统计
onMount(() => {
	refreshCacheStats();
});
</script>

<div class="space-y-3 text-xs">
	<!-- 缓存统计 -->
	<div class="space-y-2">
		<div class="flex items-center justify-between">
			<span class="text-muted-foreground">缓存文件</span>
			<span>{cacheStats.value.totalFiles} 个</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-muted-foreground">占用空间</span>
			<span>{formatFileSize(cacheStats.value.totalSize)}</span>
		</div>
		{#if cacheStats.value.cacheDir}
			<p class="text-[10px] text-muted-foreground truncate" title={cacheStats.value.cacheDir}>
				{cacheStats.value.cacheDir}
			</p>
		{/if}
	</div>

	<!-- 过期清理配置 -->
	<div class="flex items-center justify-between">
		<span class="text-muted-foreground">清理天数</span>
		<select
			class="h-6 px-2 text-xs bg-muted rounded border-0"
			bind:value={cleanupDays}
		>
			{#each [7, 14, 30, 60, 90] as days}
				<option value={days}>{days} 天</option>
			{/each}
		</select>
	</div>

	<!-- 操作按钮 -->
	<div class="flex gap-2">
		<Button
			variant="outline"
			size="sm"
			class="flex-1 h-7 text-xs"
			onclick={refreshCacheStats}
			disabled={isRefreshing}
		>
			{#if isRefreshing}
				<Loader2 class="h-3 w-3 mr-1 animate-spin" />
			{:else}
				<RefreshCw class="h-3 w-3 mr-1" />
			{/if}
			刷新
		</Button>
		
		<Button
			variant="outline"
			size="sm"
			class="flex-1 h-7 text-xs"
			onclick={openCacheDir}
			disabled={!cacheStats.value.cacheDir}
		>
			<FolderOpen class="h-3 w-3 mr-1" />
			打开
		</Button>
	</div>

	<div class="flex gap-2">
		<Button
			variant="outline"
			size="sm"
			class="flex-1 h-7 text-xs"
			onclick={clearOldCache}
			disabled={isClearing || cacheStats.value.totalFiles === 0}
		>
			{#if isClearing}
				<Loader2 class="h-3 w-3 mr-1 animate-spin" />
			{:else}
				<Trash2 class="h-3 w-3 mr-1" />
			{/if}
			清理过期
		</Button>
		
		<Button
			variant="outline"
			size="sm"
			class="flex-1 h-7 text-xs text-destructive hover:text-destructive"
			onclick={clearAllCache}
			disabled={isClearingAll || cacheStats.value.totalFiles === 0}
		>
			{#if isClearingAll}
				<Loader2 class="h-3 w-3 mr-1 animate-spin" />
			{:else}
				<Trash2 class="h-3 w-3 mr-1" />
			{/if}
			全部清除
		</Button>
	</div>
</div>
