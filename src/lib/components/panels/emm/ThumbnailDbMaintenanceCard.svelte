<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { Database, Trash2, RefreshCcw, BarChart3 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	let stats = $state<{ total: number; withEmm: number; invalid: number } | null>(null);
	let isLoading = $state(false);
	let message = $state<string | null>(null);

	async function loadStats() {
		try {
			const [total, withEmm, invalid] = await invoke<[number, number, number]>('get_thumbnail_maintenance_stats');
			stats = { total, withEmm, invalid };
		} catch (e) {
			console.error('获取统计失败:', e);
		}
	}

	async function handleNormalize() {
		isLoading = true;
		message = null;
		try {
			const [total, fixed] = await invoke<[number, number]>('normalize_thumbnail_keys');
			message = `规范化完成：处理 ${total} 条，修复 ${fixed} 条`;
			await loadStats();
		} catch (e) {
			message = `规范化失败: ${e}`;
		} finally {
			isLoading = false;
		}
	}

	async function handleCleanup() {
		isLoading = true;
		message = null;
		try {
			const deleted = await invoke<number>('cleanup_invalid_thumbnails');
			message = `清理完成：删除 ${deleted} 条无效记录`;
			await loadStats();
		} catch (e) {
			message = `清理失败: ${e}`;
		} finally {
			isLoading = false;
		}
	}

	// 初始加载统计
	$effect(() => {
		loadStats();
	});
</script>

<div class="space-y-3">
	<div class="flex items-center gap-2 font-semibold text-sm">
		<Database class="h-4 w-4" />
		<span>缩略图数据库维护</span>
	</div>

	<!-- 统计信息 -->
	{#if stats}
		<div class="grid grid-cols-3 gap-2 text-xs">
			<div class="bg-muted/50 rounded p-2 text-center">
				<div class="text-muted-foreground">总条目</div>
				<div class="font-semibold">{stats.total.toLocaleString()}</div>
			</div>
			<div class="bg-muted/50 rounded p-2 text-center">
				<div class="text-muted-foreground">含 EMM</div>
				<div class="font-semibold text-green-600">{stats.withEmm.toLocaleString()}</div>
			</div>
			<div class="bg-muted/50 rounded p-2 text-center">
				<div class="text-muted-foreground">无效</div>
				<div class="font-semibold text-red-500">{stats.invalid}</div>
			</div>
		</div>
	{/if}

	<!-- 消息 -->
	{#if message}
		<div class="text-xs text-muted-foreground bg-muted/50 rounded p-2">
			{message}
		</div>
	{/if}

	<!-- 操作按钮 -->
	<div class="flex flex-wrap gap-2">
		<Button
			variant="outline"
			size="sm"
			class="gap-1"
			onclick={loadStats}
			disabled={isLoading}
		>
			<BarChart3 class="h-3.5 w-3.5" />
			刷新
		</Button>
		<Button
			variant="outline"
			size="sm"
			class="gap-1"
			onclick={handleNormalize}
			disabled={isLoading}
		>
			<RefreshCcw class="h-3.5 w-3.5" />
			{isLoading ? '处理中...' : '规范路径'}
		</Button>
		<Button
			variant="outline"
			size="sm"
			class="gap-1"
			onclick={handleCleanup}
			disabled={isLoading}
		>
			<Trash2 class="h-3.5 w-3.5" />
			清理无效
		</Button>
	</div>

	<p class="text-[10px] text-muted-foreground">
		<strong>规范路径</strong>：统一路径格式，修复盘符后缺失斜杠<br/>
		<strong>清理无效</strong>：删除无缩略图数据的空条目
	</p>
</div>
