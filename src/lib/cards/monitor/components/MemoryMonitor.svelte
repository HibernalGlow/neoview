<script lang="ts">
	/**
	 * 内存监控组件
	 * 显示内存使用情况
	 */
	import { MemoryStick } from '@lucide/svelte';
	import ProgressBar from './ProgressBar.svelte';

	interface Props {
		memoryTotal: number;
		memoryUsed: number;
		memoryFree: number;
		memoryCached: number;
	}

	let { memoryTotal, memoryUsed, memoryFree, memoryCached }: Props = $props();

	// 计算百分比
	const memoryPercentage = $derived((memoryUsed / memoryTotal) * 100);

	// 格式化内存大小
	function formatMemorySize(bytes: number): string {
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		let size = bytes;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}

		return `${size.toFixed(1)} ${units[unitIndex]}`;
	}

	// 格式化百分比
	function formatPercentage(value: number): string {
		return `${Math.round(value)}%`;
	}
</script>

<div class="bg-muted/50 rounded p-3">
	<!-- 头部 -->
	<div class="mb-3 flex items-center justify-between">
		<div class="flex items-center gap-2">
			<MemoryStick class="text-primary h-4 w-4" />
			<span class="text-sm font-semibold">内存</span>
		</div>
		<span class="text-primary font-mono text-sm font-bold">
			{formatPercentage(memoryPercentage)}
		</span>
	</div>

	<!-- 内存进度条 -->
	<div class="mb-3">
		<ProgressBar label="内存使用" value={memoryPercentage} labelWidth="4rem" valueWidth="2.5rem" />
	</div>

	<!-- 内存详细信息 -->
	<div class="grid grid-cols-2 gap-2 text-xs">
		<div class="flex justify-between">
			<span class="text-muted-foreground">总计:</span>
			<span class="font-mono">{formatMemorySize(memoryTotal)}</span>
		</div>
		<div class="flex justify-between">
			<span class="text-muted-foreground">已用:</span>
			<span class="font-mono">{formatMemorySize(memoryUsed)}</span>
		</div>
		<div class="flex justify-between">
			<span class="text-muted-foreground">空闲:</span>
			<span class="font-mono">{formatMemorySize(memoryFree)}</span>
		</div>
		<div class="flex justify-between">
			<span class="text-muted-foreground">缓存:</span>
			<span class="font-mono">{formatMemorySize(memoryCached)}</span>
		</div>
	</div>
</div>
