<script lang="ts">
/**
 * 最近 7 日阅读趋势卡片
 */
import { historyStore, type HistoryEntry } from '$lib/stores/history.svelte';

let historyEntries = $state<HistoryEntry[]>([]);

$effect(() => {
	const unsubscribe = historyStore.subscribe((value) => {
		historyEntries = value ?? [];
	});
	return unsubscribe;
});

const DAY = 24 * 60 * 60 * 1000;

function buildHistoryTrend() {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const bucketMap = new Map<string, number>();

	for (const entry of historyEntries) {
		const date = new Date(entry.timestamp);
		const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
		bucketMap.set(key, (bucketMap.get(key) ?? 0) + 1);
	}

	const trend: { label: string; count: number; key: string }[] = [];
	for (let i = 6; i >= 0; i--) {
		const day = new Date(today.getTime() - i * DAY);
		const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
		const weekday = ['日', '一', '二', '三', '四', '五', '六'][day.getDay()];
		trend.push({ label: weekday, count: bucketMap.get(key) ?? 0, key });
	}

	let lastWeekTotal = 0;
	for (let i = 7; i < 14; i++) {
		const day = new Date(today.getTime() - i * DAY);
		const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
		lastWeekTotal += bucketMap.get(key) ?? 0;
	}

	const currentWeek = trend.reduce((acc, d) => acc + d.count, 0);
	const delta = lastWeekTotal > 0 ? Math.round(((currentWeek - lastWeekTotal) / lastWeekTotal) * 100) : currentWeek > 0 ? 100 : 0;
	const maxCount = Math.max(...trend.map(d => d.count), 1);

	return { trend, currentWeek, delta, maxCount };
}

const data = $derived(buildHistoryTrend());
</script>

<div class="space-y-3 text-xs">
	<div class="flex items-center justify-between text-muted-foreground">
		<span>本周共 {data.currentWeek} 次访问</span>
		<span class={data.delta >= 0 ? 'text-emerald-500' : 'text-red-500'}>
			{data.delta >= 0 ? '+' : ''}{data.delta}% 对比上周
		</span>
	</div>
	<div class="flex items-end gap-2">
		{#each data.trend as day}
			<div class="flex flex-1 flex-col items-center gap-2 text-[11px] text-muted-foreground">
				<div class="flex h-16 w-full items-end rounded bg-muted/50">
					<div
						class="w-full rounded-t {day.count === data.maxCount ? 'bg-primary' : 'bg-primary/70'}"
						style="height: {(day.count / data.maxCount) * 100 || 4}%"
					></div>
				</div>
				<span>{day.label}</span>
			</div>
		{/each}
	</div>
</div>
