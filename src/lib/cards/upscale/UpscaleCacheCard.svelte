<script lang="ts">
/**
 * 超分缓存管理卡片
 */
import { Trash2, FolderOpen, RefreshCw, Loader2 } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { cacheStats, formatFileSize } from '$lib/stores/upscale/upscalePanelStore.svelte';
import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';
import { FileSystemAPI } from '$lib/api';
import { confirm } from '$lib/stores/confirmDialog.svelte';

let isRefreshing = $state(false);
let isClearing = $state(false);

async function refreshCacheStats() {
	isRefreshing = true;
	try {
		const stats = await pyo3UpscaleManager.getCacheStats();
		if (stats) {
			cacheStats.value = {
				totalFiles: stats.totalFiles,
				totalSize: stats.totalSize,
				cacheDir: stats.cacheDir
			};
		}
	} catch (err) {
		console.error('刷新缓存统计失败:', err);
	} finally {
		isRefreshing = false;
	}
}

async function clearCache() {
	const confirmed = await confirm({
		title: '确认清除',
		description: '确定要清除所有超分缓存吗？此操作不可撤销。',
		confirmText: '清除',
		cancelText: '取消',
		variant: 'destructive'
	});
	if (!confirmed) return;
	
	isClearing = true;
	try {
		await pyo3UpscaleManager.cleanupCache();
		await refreshCacheStats();
	} catch (err) {
		console.error('清除缓存失败:', err);
	} finally {
		isClearing = false;
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
		
		<Button
			variant="outline"
			size="sm"
			class="h-7 text-xs text-destructive hover:text-destructive"
			onclick={clearCache}
			disabled={isClearing || cacheStats.value.totalFiles === 0}
		>
			{#if isClearing}
				<Loader2 class="h-3 w-3 animate-spin" />
			{:else}
				<Trash2 class="h-3 w-3" />
			{/if}
		</Button>
	</div>
</div>
