<script lang="ts">
	/**
	 * CPU 监控组件
	 * 显示每个 CPU 核心的使用率
	 */
	import { Cpu } from '@lucide/svelte';
	import ProgressBar from './ProgressBar.svelte';

	interface Props {
		cpuUsage: number[];
	}

	let { cpuUsage }: Props = $props();

	// 计算平均使用率
	const averageUsage = $derived(cpuUsage.reduce((sum, usage) => sum + usage, 0) / cpuUsage.length);

	// 格式化百分比
	function formatPercentage(value: number): string {
		return `${Math.round(value)}%`;
	}
</script>

<div class="bg-muted/50 rounded p-3">
	<!-- 头部 -->
	<div class="mb-3 flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Cpu class="text-primary h-4 w-4" />
			<span class="text-sm font-semibold">CPU</span>
		</div>
		<span class="text-primary font-mono text-sm font-bold">
			{formatPercentage(averageUsage)}
		</span>
	</div>

	<!-- CPU 核心列表 -->
	<div class="grid grid-cols-2 gap-x-4 gap-y-2">
		{#each cpuUsage as usage, index}
			<ProgressBar label={`Core ${index}`} value={usage} labelWidth="3rem" valueWidth="2.5rem" />
		{/each}
	</div>
</div>
