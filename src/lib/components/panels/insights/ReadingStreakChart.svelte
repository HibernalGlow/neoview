<script lang="ts">
	import { ChartContainer } from '$lib/components/ui/chart';

	export type StreakPoint = {
		date: string;
		label: string;
		value: number;
	};

	let { points = [], maxValue = 0 } = $props<{
		points?: StreakPoint[];
		maxValue?: number;
	}>();

	const paddingX = 26;
	const paddingY = 18;
	const baseHeight = 140;
	const gapX = 24;

	const viewWidth = $derived(() => paddingX * 2 + Math.max(points.length - 1, 1) * gapX);
	const viewHeight = baseHeight;

	function getX(index: number) {
		if (points.length <= 1) return paddingX;
		const usableWidth = viewWidth - paddingX * 2;
		return paddingX + (index / (points.length - 1)) * usableWidth;
	}

	function getY(value: number) {
		if (maxValue <= 0) return viewHeight - paddingY;
		const usableHeight = viewHeight - paddingY * 2;
		return viewHeight - paddingY - (value / maxValue) * usableHeight;
	}

	const pathData = $derived(() => {
		if (!points.length) return '';
		return points
			.map((point, index) => `${index === 0 ? 'M' : 'L'} ${getX(index)} ${getY(point.value)}`)
			.join(' ');
	});

	const areaPath = $derived(() => {
		if (!points.length || !pathData) return '';
		const baselineY = viewHeight - paddingY;
		return `${pathData} L ${getX(points.length - 1)} ${baselineY} L ${getX(0)} ${baselineY} Z`;
	});

	const lastPoint = $derived(() => (points.length ? points[points.length - 1] : null));
	const peakPoint = $derived(() =>
		points.reduce<StreakPoint | null>((best, point) => {
			if (!best || point.value >= best.value) return point;
			return best;
		}, null)
	);
</script>

{#if !points.length}
	<p class="py-4 text-center text-xs text-muted-foreground">暂无连续阅读记录</p>
{:else}
	<ChartContainer
		config={{
			streak: { label: 'Streak', color: 'hsl(215 90% 55%)' }
		}}
		class="h-40 w-full"
	>
		<svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} class="h-full w-full">
			<defs>
				<linearGradient id="streak-fill" x1="0%" x2="0%" y1="0%" y2="100%">
					<stop offset="0%" stop-color="hsl(215 90% 55%)" stop-opacity="0.25" />
					<stop offset="100%" stop-color="hsl(215 80% 50%)" stop-opacity="0" />
				</linearGradient>
			</defs>

			<line
				x1="0"
				y1={viewHeight - paddingY}
				x2={viewWidth}
				y2={viewHeight - paddingY}
				stroke="hsl(220 14% 25%)"
				stroke-width="1"
			/>

			{#if areaPath}
				<path d={areaPath} fill="url(#streak-fill)" class="transition-all duration-300" />
			{/if}

			{#if pathData}
				<path
					d={pathData}
					fill="none"
					stroke="hsl(215 90% 60%)"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			{/if}

			{#each points as point, index}
				{@const isLast = lastPoint && lastPoint.date === point.date}
				{@const isPeak = peakPoint && peakPoint.date === point.date}
				<circle
					cx={getX(index)}
					cy={getY(point.value)}
					r={isPeak ? 4 : 3}
					fill={isLast ? 'hsl(215 95% 65%)' : 'hsl(215 60% 70%)'}
					stroke="hsl(222 50% 20%)"
					stroke-width="1"
				>
					<title>{`${point.date} · 连续 ${point.value} 天`}</title>
				</circle>
			{/each}

			{#if points.length}
				<text x={getX(0)} y={viewHeight - paddingY + 14} class="fill-muted-foreground text-[10px]">
					{points[0].label}
				</text>
				{#if points.length > 2}
					<text
						x={getX(Math.floor((points.length - 1) / 2))}
						y={viewHeight - paddingY + 14}
						class="fill-muted-foreground text-[10px]"
						text-anchor="middle"
					>
						{points[Math.floor((points.length - 1) / 2)].label}
					</text>
				{/if}
				<text
					x={getX(points.length - 1)}
					y={viewHeight - paddingY + 14}
					class="fill-muted-foreground text-[10px]"
					text-anchor="end"
				>
					{points[points.length - 1].label}
				</text>
			{/if}

			{#if maxValue > 0}
				<text x="0" y={getY(maxValue) + 4} class="fill-muted-foreground text-[10px]">{maxValue} 天</text>
				<text x="0" y={getY(Math.max(1, Math.ceil(maxValue / 2))) + 4} class="fill-muted-foreground text-[10px]">
					{Math.max(1, Math.ceil(maxValue / 2))} 天
				</text>
			{/if}
		</svg>
	</ChartContainer>
{/if}
