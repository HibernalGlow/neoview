<script lang="ts">
/**
 * 阅读时段热力图卡片
 */
import { unifiedHistoryStore, type UnifiedHistoryEntry } from '$lib/stores/unifiedHistory.svelte';
import ReadingHeatmapChart, { type HeatmapCell } from '$lib/components/panels/insights/ReadingHeatmapChart.svelte';

let historyEntries = $state<UnifiedHistoryEntry[]>([]);
const weekdayLabelMap = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

$effect(() => {
	const unsubscribe = unifiedHistoryStore.subscribe((value) => {
		historyEntries = value ?? [];
	});
	return unsubscribe;
});

function buildReadingHeatmapData() {
	const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));

	for (const entry of historyEntries) {
		const date = new Date(entry.timestamp);
		if (Number.isNaN(date.getTime())) continue;
		const weekday = date.getDay();
		const hour = date.getHours();
		matrix[weekday][hour]++;
	}

	let maxCount = 0;
	const cells: HeatmapCell[] = [];
	let topSlot: HeatmapCell | null = null;

	for (let weekday = 0; weekday < 7; weekday++) {
		for (let hour = 0; hour < 24; hour++) {
			const count = matrix[weekday][hour];
			if (count > maxCount) maxCount = count;
			const cell: HeatmapCell = {
				weekday,
				hour,
				count,
				weekdayLabel: weekdayLabelMap[weekday],
				hourLabel: `${String(hour).padStart(2, '0')}:00`
			};
			cells.push(cell);
			if (!topSlot || cell.count > topSlot.count) topSlot = cell;
		}
	}

	return { cells, maxCount, topSlot };
}

const heatmap = $derived(buildReadingHeatmapData());
</script>

<div class="space-y-3 overflow-hidden">
	{#if heatmap.topSlot && heatmap.topSlot.count > 0}
		<p class="text-xs text-muted-foreground">
			高峰时段: <span class="font-medium text-foreground">{heatmap.topSlot.weekdayLabel} {heatmap.topSlot.hourLabel}</span>
		</p>
	{/if}
	<div class="overflow-hidden">
		<ReadingHeatmapChart cells={heatmap.cells} maxCount={heatmap.maxCount} />
	</div>
</div>
