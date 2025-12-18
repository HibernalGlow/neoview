<script lang="ts">
/**
 * AI 翻译缓存管理卡片
 */
import { Button } from '$lib/components/ui/button';
import { aiTranslationStore } from '$lib/stores/ai/translationStore.svelte';
import { Database, Trash2, Download, Upload, RefreshCcw, HardDrive } from '@lucide/svelte';
import { invoke } from '$lib/api/adapter';
import { onMount } from 'svelte';
import { confirm } from '$lib/stores/confirmDialog.svelte';
import { showSuccessToast, showErrorToast } from '$lib/utils/toast';

let stats = $state(aiTranslationStore.getCacheStats());
let dbCacheCount = $state<number | null>(null);

// 加载数据库缓存统计
async function loadDbCacheStats() {
	try {
		const count = await invoke<number>('get_ai_translation_count');
		dbCacheCount = count;
	} catch {
		dbCacheCount = null;
	}
}

onMount(() => {
	loadDbCacheStats();
});

// 订阅 store 更新
$effect(() => {
	const unsubscribe = aiTranslationStore.subscribe((state) => {
		stats = {
			size: state.cache.size,
			...state.stats,
		};
	});
	return unsubscribe;
});

async function handleClearCache() {
	const confirmed = await confirm({
		title: '确认清空',
		description: '确定要清空所有翻译缓存吗？',
		confirmText: '清空',
		cancelText: '取消',
		variant: 'destructive'
	});
	if (confirmed) {
		aiTranslationStore.clearCache();
	}
}

function handleExportCache() {
	const entries = aiTranslationStore.exportCache();
	const json = JSON.stringify(entries, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);

	const a = document.createElement('a');
	a.href = url;
	a.download = `neoview-ai-translation-cache-${Date.now()}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

function handleImportCache() {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = 'application/json,.json';
	input.onchange = async (e) => {
		const file = (e.target as HTMLInputElement)?.files?.[0];
		if (!file) return;

		try {
			const text = await file.text();
			const entries = JSON.parse(text);
			if (Array.isArray(entries)) {
				aiTranslationStore.importCache(entries);
				showSuccessToast('导入成功', `成功导入 ${entries.length} 条翻译缓存`);
			}
		} catch (err) {
			showErrorToast('导入失败', '请检查文件格式');
		}
	};
	input.click();
}

function formatNumber(n: number): string {
	return n.toLocaleString();
}

function formatCacheHitRate(): string {
	const total = stats.cacheHits + stats.apiCalls;
	if (total === 0) return '0%';
	return ((stats.cacheHits / total) * 100).toFixed(1) + '%';
}
</script>

<div class="space-y-4">
	<!-- 缓存统计 -->
	<div class="grid grid-cols-2 gap-2">
		<div class="rounded-md border bg-muted/20 p-3 text-center">
			<div class="text-2xl font-bold text-primary">{formatNumber(stats.size)}</div>
			<div class="text-xs text-muted-foreground">缓存条目</div>
		</div>
		<div class="rounded-md border bg-muted/20 p-3 text-center">
			<div class="text-2xl font-bold text-primary">{formatCacheHitRate()}</div>
			<div class="text-xs text-muted-foreground">缓存命中率</div>
		</div>
	</div>

	<div class="space-y-1 text-sm">
		<div class="flex justify-between">
			<span class="text-muted-foreground">总翻译数:</span>
			<span>{formatNumber(stats.totalTranslations)}</span>
		</div>
		<div class="flex justify-between">
			<span class="text-muted-foreground">缓存命中:</span>
			<span>{formatNumber(stats.cacheHits)}</span>
		</div>
		<div class="flex justify-between">
			<span class="text-muted-foreground">API 调用:</span>
			<span>{formatNumber(stats.apiCalls)}</span>
		</div>
		<div class="flex justify-between items-center">
			<span class="text-muted-foreground flex items-center gap-1">
				<HardDrive class="h-3 w-3" />
				数据库缓存:
			</span>
			<span class="flex items-center gap-1">
				{dbCacheCount !== null ? formatNumber(dbCacheCount) : '加载中...'}
				<button
					class="p-0.5 rounded hover:bg-muted"
					onclick={() => loadDbCacheStats()}
					title="刷新数据库缓存数量"
				>
					<RefreshCcw class="h-3 w-3 text-muted-foreground" />
				</button>
			</span>
		</div>
	</div>

	<!-- 操作按钮 -->
	<div class="flex flex-wrap gap-2">
		<Button variant="outline" size="sm" onclick={handleExportCache} class="flex-1">
			<Download class="mr-1 h-3 w-3" />
			导出
		</Button>
		<Button variant="outline" size="sm" onclick={handleImportCache} class="flex-1">
			<Upload class="mr-1 h-3 w-3" />
			导入
		</Button>
		<Button variant="outline" size="sm" onclick={handleClearCache} class="flex-1 text-destructive hover:text-destructive">
			<Trash2 class="mr-1 h-3 w-3" />
			清空
		</Button>
	</div>
</div>
