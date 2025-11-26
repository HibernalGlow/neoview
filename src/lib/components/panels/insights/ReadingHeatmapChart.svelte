<script lang="ts" context="module">
	export type HeatmapCell = {
		weekday: number;
		hour: number;
		count: number;
		weekdayLabel: string;
		hourLabel: string;
	};
</script>

<script lang="ts">
	import ChartContainer from '$lib/components/ui/chart/chart-container.svelte';

	let { cells = [], maxCount = 0 } = $props<{
		cells?: HeatmapCell[];
		maxCount?: number;
	}>();

	const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
	const hourLabels = ['0时', '3时', '6时', '9时', '12时', '15时', '18时', '21时'];

	const viewWidth: number = 24 * 14 + 40;
	const viewHeight: number = 7 * 20 + 20;

	function getFill(count: number) {
		if (count === 0 || maxCount === 0) return 'hsl(220 15% 18%)';
		const ratio = count / maxCount;
		const lightness = 30 + ratio * 40;
		return `hsl(215 90% ${lightness}%)`;
	}
</script>

<ChartContainer
	config={{
		count: {
			label: '阅读次数',
			color: 'hsl(215 90% 55%)'
		}
	}}
	class="h-48 w-full"
>
	<svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} class="h-full w-full">
		<g transform="translate(32,8)">
			{#each cells as cell}
				<g transform={`translate(${cell.hour * 14}, ${cell.weekday * 20})`}>
					<rect
						rx="3"
						width="12"
						height="16"
						fill={getFill(cell.count)}
						class="transition-colors duration-200"
					>
						<title>{`${cell.weekdayLabel} ${cell.hourLabel} · ${cell.count} 次`}</title>
					</rect>
				</g>
			{/each}
		</g>

		<!-- 左侧星期标签 -->
		{#each dayLabels as label, index}
			<text x="0" y={index * 20 + 20} class="fill-muted-foreground text-[10px]">{label}</text>
		{/each}

		<!-- 底部小时刻度 -->
		{#each hourLabels as label, hIndex}
			{@const x = 32 + hIndex * 3 * 14}
			<text x={x} y={viewHeight - 2} class="fill-muted-foreground text-[10px]">{label}</text>
		{/each}
	</svg>
</ChartContainer>
