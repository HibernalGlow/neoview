<script module lang="ts">
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

	const viewWidth = 24 * 14 + 40;
	const viewHeight = 7 * 20 + 20;

	let tooltip = $state({ visible: false, text: '', x: 0, y: 0 });

	function getOpacity(count: number) {
		if (count === 0 || maxCount === 0) return 0.18;
		const ratio = count / maxCount;
		return 0.25 + ratio * 0.75;
	}

	function showTooltip(event: PointerEvent, cell: HeatmapCell) {
		tooltip = {
			visible: true,
			text: `${cell.weekdayLabel} ${cell.hourLabel} · ${cell.count} 次`,
			x: event.clientX,
			y: event.clientY
		};
	}

	function hideTooltip() {
		tooltip = { ...tooltip, visible: false };
	}
</script>

<ChartContainer
	config={{
		count: {
			label: '阅读次数',
			color: 'hsl(var(--primary))'
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
						role="img"
						fill={cell.count === 0 ? 'hsl(var(--muted))' : 'hsl(var(--primary))'}
						fill-opacity={getOpacity(cell.count)}
						class="transition-[fill-opacity] duration-200"
						onpointerenter={(event) => showTooltip(event, cell)}
						onpointermove={(event) => showTooltip(event, cell)}
						onpointerleave={hideTooltip}
					/>
				</g>
			{/each}
		</g>

		{#each dayLabels as label, index}
			<text x="0" y={index * 20 + 20} class="fill-muted-foreground text-[10px]">{label}</text>
		{/each}

		{#each hourLabels as label, hIndex}
			{@const x = 32 + hIndex * 3 * 14}
			<text x={x} y={viewHeight - 2} class="fill-muted-foreground text-[10px]">{label}</text>
		{/each}
	</svg>
</ChartContainer>

{#if tooltip.visible}
	<div
		class="pointer-events-none fixed z-50 rounded-md border bg-popover/80 backdrop-blur-md px-2 py-1 text-xs text-popover-foreground shadow-md"
		style={`left: ${tooltip.x + 12}px; top: ${tooltip.y + 12}px;`}
	>
		{tooltip.text}
	</div>
{/if}
