<script lang="ts">
/**
 * 实时延迟监控卡片
 * 监控 PageManager 加载流水线各环节延迟
 */
import { pipelineLatencyStore } from '$lib/stores/pipelineLatency.svelte';
import { Activity, RefreshCw } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';

// 从 store 获取数据
let records = $derived(pipelineLatencyStore.records);
let stats = $derived(pipelineLatencyStore.getStats());
let isMonitoring = $derived(pipelineLatencyStore.enabled);

function toggleMonitoring() {
	pipelineLatencyStore.setEnabled(!pipelineLatencyStore.enabled);
}

function clearRecords() {
	pipelineLatencyStore.clear();
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatMs(ms: number): string {
	if (ms < 1) return '<1ms';
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(2)}s`;
}
</script>

<div class="space-y-3">
	<!-- 控制按钮 -->
	<div class="flex gap-2">
		<Button 
			variant={isMonitoring ? 'destructive' : 'default'} 
			size="sm"
			onclick={toggleMonitoring}
		>
			<Activity class="w-4 h-4 mr-1" />
			{isMonitoring ? '停止监控' : '开始监控'}
		</Button>
		<Button variant="outline" size="sm" onclick={clearRecords}>
			<RefreshCw class="w-4 h-4 mr-1" />
			清空
		</Button>
	</div>
	
	<!-- 统计摘要 -->
	{#if stats.count > 0}
		<div class="grid grid-cols-3 gap-2 text-sm">
			<div class="bg-muted/50 rounded p-2 text-center">
				<div class="text-muted-foreground text-xs">平均后端</div>
				<div class="font-mono font-bold">{formatMs(stats.avgBackendMs)}</div>
			</div>
			<div class="bg-muted/50 rounded p-2 text-center">
				<div class="text-muted-foreground text-xs">平均总耗时</div>
				<div class="font-mono font-bold">{formatMs(stats.avgTotalMs)}</div>
			</div>
			<div class="bg-muted/50 rounded p-2 text-center">
				<div class="text-muted-foreground text-xs">采样数</div>
				<div class="font-mono font-bold">{stats.count}</div>
			</div>
		</div>
	{/if}
	
	<!-- 延迟记录列表 -->
	<div class="max-h-64 overflow-auto">
		{#if records.length === 0}
			<div class="text-center text-muted-foreground py-4">
				{isMonitoring ? '翻页后显示延迟数据' : '点击"开始监控"后翻页'}
			</div>
		{:else}
			<!-- 表头 -->
			<div class="flex items-center gap-2 text-[10px] text-muted-foreground px-2 py-1 border-b mb-1">
				<span class="w-6">页</span>
				<span class="flex-1">IPC + Blob = 总</span>
				<span>大小</span>
			</div>
			<div class="space-y-1">
				{#each records.toReversed() as record (record.timestamp)}
					<div class="flex items-center gap-2 text-xs bg-muted/30 rounded px-2 py-1">
						<span class="text-muted-foreground w-6">P{record.pageIndex}</span>
						<span class="font-mono flex-1 text-[11px]">
							<!-- IPC 时间 -->
							<span class:text-green-500={record.ipcTransferMs < 50} 
								  class:text-yellow-500={record.ipcTransferMs >= 50 && record.ipcTransferMs < 200}
								  class:text-red-500={record.ipcTransferMs >= 200}
								  title="IPC传输">
								{formatMs(record.ipcTransferMs)}
							</span>
							<span class="text-muted-foreground mx-0.5">+</span>
							<!-- Blob 创建时间 -->
							<span class:text-green-500={record.blobCreateMs < 5} 
								  class:text-yellow-500={record.blobCreateMs >= 5}
								  title="Blob创建">
								{formatMs(record.blobCreateMs)}
							</span>
							<span class="text-muted-foreground mx-0.5">=</span>
							<!-- 总时间 -->
							<span title="总耗时">{formatMs(record.totalMs)}</span>
						</span>
						<span class="text-muted-foreground text-[10px]">{formatSize(record.dataSize)}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
