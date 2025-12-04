<script lang="ts">
/**
 * 连续阅读 Streak 卡片
 */
import { historyStore, type HistoryEntry } from '$lib/stores/history.svelte';
import ReadingStreakChart, { type StreakPoint } from '$lib/components/panels/insights/ReadingStreakChart.svelte';

let historyEntries = $state<HistoryEntry[]>([]);
const DAY = 24 * 60 * 60 * 1000;

$effect(() => {
	const unsubscribe = historyStore.subscribe((value) => {
		historyEntries = value ?? [];
	});
	return unsubscribe;
});

function normalizeDateKey(timestamp: number) {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return null;
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function buildReadingStreakData() {
	const uniqueDays = new Set<string>();
	for (const entry of historyEntries) {
		const key = normalizeDateKey(entry.timestamp);
		if (key) uniqueDays.add(key);
	}

	const sortedDays = Array.from(uniqueDays)
		.map((key) => ({ key, time: new Date(key).getTime() }))
		.filter((item) => Number.isFinite(item.time))
		.sort((a, b) => a.time - b.time);

	let currentStreak = 0;
	let longestStreak = 0;
	let lastTime: number | null = null;
	const points: StreakPoint[] = [];

	for (const { key, time } of sortedDays) {
		if (lastTime !== null && time - lastTime <= DAY) {
			currentStreak += 1;
		} else {
			currentStreak = 1;
		}
		lastTime = time;
		if (currentStreak > longestStreak) longestStreak = currentStreak;

		const dateObj = new Date(time);
		points.push({
			date: key,
			label: `${dateObj.getMonth() + 1}/${dateObj.getDate()}`,
			value: currentStreak
		});
	}

	return {
		points,
		currentStreak,
		longestStreak,
		maxValue: longestStreak,
		lastActiveDate: sortedDays.length ? sortedDays[sortedDays.length - 1].key : null
	};
}

const streak = $derived(buildReadingStreakData());
</script>

<div class="space-y-3">
	<div class="grid grid-cols-3 gap-3 text-center">
		<div>
			<p class="text-xs text-muted-foreground">当前连续</p>
			<p class="text-lg font-semibold">{streak.currentStreak} 天</p>
		</div>
		<div>
			<p class="text-xs text-muted-foreground">最长连续</p>
			<p class="text-lg font-semibold">{streak.longestStreak} 天</p>
		</div>
		<div>
			<p class="text-xs text-muted-foreground">最近活跃</p>
			<p class="text-sm font-medium">{streak.lastActiveDate ?? '暂无'}</p>
		</div>
	</div>
	{#if streak.points.length > 0}
		<ReadingStreakChart points={streak.points} maxValue={streak.maxValue} />
	{/if}
</div>
