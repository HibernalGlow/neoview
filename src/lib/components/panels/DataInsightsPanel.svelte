<script lang="ts">
	import {
		BarChart3,
		ChevronDown,
		ChevronUp,
		RefreshCw,
		ArrowUp,
		ArrowDown
	} from '@lucide/svelte';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Progress } from '$lib/components/ui/progress';
	import { historyStore, type HistoryEntry } from '$lib/stores/history.svelte';
	import { bookmarkStore } from '$lib/stores/bookmark.svelte';
	import { emmMetadataStore } from '$lib/stores/emmMetadata.svelte';
	import { insightsPanelStore, type InsightsCardId } from '$lib/stores/insightsPanel.svelte';
	import type { EMMCollectTag } from '$lib/api/emm';
	import ReadingHeatmapChart, { type HeatmapCell } from './insights/ReadingHeatmapChart.svelte';
	import ReadingStreakChart, { type StreakPoint } from './insights/ReadingStreakChart.svelte';

	const CARD_META: Record<InsightsCardId, { title: string; description: string }> = {
		'daily-trend': {
			title: '最近 7 日阅读趋势',
			description: '基于历史记录的活跃度'
		},
		'reading-streak': {
			title: '连续阅读 Streak',
			description: '记录连续阅读天数，避免断档'
		},
		'reading-heatmap': {
			title: '阅读时段热力图',
			description: '一周 24 小时活跃度热力分布'
		},
		'bookmark-overview': {
			title: '书签概览',
			description: '收藏偏好与增长'
		},
		'source-breakdown': {
			title: '来源拆分',
			description: '不同来源内容的占比'
		},
		'emm-tags': {
			title: 'EMM 标签热度',
			description: '收藏标签与分类统计'
		}
	};

	let cardOrder = $state<InsightsCardId[]>([]);
	let collapsed = $state<Record<InsightsCardId, boolean>>({});
	let historyEntries = $state<HistoryEntry[]>([]);
	let bookmarks = $state<ReturnType<typeof bookmarkStore.getAll>>([]);
	let collectTags = $state<EMMCollectTag[]>([]);

	$effect(() => {
		const unsubscribe = insightsPanelStore.subscribe((value) => {
			cardOrder = value.order;
			collapsed = value.collapsed;
		});
		return unsubscribe;
	});

	$effect(() => {
		const unsubscribe = historyStore.subscribe((value) => {
			historyEntries = value ?? [];
		});
		return unsubscribe;
	});

	$effect(() => {
		const unsubscribe = bookmarkStore.subscribe((value) => {
			bookmarks = value ?? [];
		});
		return unsubscribe;
	});

	$effect(() => {
		const unsubscribe = emmMetadataStore.subscribe((value) => {
			collectTags = value.collectTags ?? [];
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
			trend.push({
				label: `${day.getMonth() + 1}/${day.getDate()}`,
				count: bucketMap.get(key) ?? 0,
				key
			});
		}

		const currentWeek = trend.reduce((sum, item) => sum + item.count, 0);
		const previousWeekStart = today.getTime() - 7 * DAY;
		const previousWeekEnd = previousWeekStart - 6 * DAY;
		let previousWeek = 0;
		for (const entry of historyEntries) {
			if (entry.timestamp >= previousWeekEnd && entry.timestamp < previousWeekStart) {
				previousWeek += 1;
			}
		}

		const delta = previousWeek === 0
			? currentWeek > 0
				? 100
				: 0
			: Math.round(((currentWeek - previousWeek) / previousWeek) * 100);

		const maxCount = Math.max(...trend.map((item) => item.count), 1);

		return { trend, currentWeek, previousWeek, delta, maxCount };
	}

	function buildBookmarkStats() {
		const total = bookmarks.length;
		const cutoff = Date.now() - 7 * DAY;
		let recent = 0;
		let folders = 0;

		for (const bookmark of bookmarks) {
			const createdAt = new Date(bookmark.createdAt).getTime();
			if (createdAt >= cutoff) {
				recent += 1;
			}
			if (bookmark.type === 'folder') {
				folders += 1;
			}
		}

		const files = total - folders;
		const folderRatio = total === 0 ? 0 : Math.round((folders / total) * 100);

		return { total, recent, folders, files, folderRatio };
	}

	const archiveExt = ['zip', 'rar', '7z', 'cbz', 'cbr', 'tar'];
	const docExt = ['pdf', 'epub'];
	const videoExt = ['mp4', 'mkv', 'nov', 'webm'];
	const imageExt = ['jpg', 'jpeg', 'jxl', 'png', 'gif', 'webp', 'avif'];

	function detectSourceType(path?: string) {
		if (!path) return '其他';
		const lower = path.toLowerCase();
		if (lower.startsWith('http')) return '远程';
		const ext = lower.split('.').pop() ?? '';
		if (archiveExt.includes(ext)) return '压缩包';
		if (docExt.includes(ext)) return '文档';
		if (videoExt.includes(ext)) return '视频';
		if (imageExt.includes(ext)) return '图像';
		return '本地目录';
	}

	function buildSourceBreakdown() {
		const counts = new Map<string, number>();
		for (const entry of historyEntries) {
			const type = detectSourceType(entry.path);
			counts.set(type, (counts.get(type) ?? 0) + 1);
		}

		const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
		const sorted = Array.from(counts.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 4)
			.map(([label, count]) => ({
				label,
				count,
				percent: total === 0 ? 0 : Math.round((count / total) * 100)
			}));

		return { segments: sorted, total };
	}

	function buildTagSummary() {
		const total = collectTags.length;
		const byLetter = new Map<string, number>();
		for (const tag of collectTags) {
			byLetter.set(tag.letter, (byLetter.get(tag.letter) ?? 0) + 1);
		}

		const topLetters = Array.from(byLetter.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 3)
			.map(([letter, count]) => ({ letter, count }));

		const previewTags = collectTags.slice(0, 6);
		return { total, topLetters, previewTags };
	}

	const weekdayLabelMap = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

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

	const readingHeatmap = $derived(buildReadingHeatmapData());
	const readingStreak = $derived(buildReadingStreakData());

	function toggleCollapsed(cardId: InsightsCardId) {
		insightsPanelStore.toggleCollapsed(cardId);
	}

	function moveCard(cardId: InsightsCardId, direction: 'up' | 'down') {
		const currentIndex = cardOrder.indexOf(cardId);
		if (currentIndex === -1) return;

		const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
		if (targetIndex < 0 || targetIndex >= cardOrder.length) return;

		const nextOrder = [...cardOrder];
		const [removed] = nextOrder.splice(currentIndex, 1);
		nextOrder.splice(targetIndex, 0, removed);
		insightsPanelStore.reorder(nextOrder);
	}
</script>

<div class="flex h-full flex-col bg-background">
	<header class="flex items-center justify-between border-b px-4 py-3">
		<div class="flex items-center gap-2">
			<BarChart3 class="h-5 w-5" />
			<div>
				<p class="text-sm font-semibold">数据洞察</p>
				<p class="text-xs text-muted-foreground">历史 · 书签 · 标签</p>
			</div>
		</div>
		<Button variant="ghost" size="sm" class="gap-1 text-xs" onclick={() => insightsPanelStore.reset()}>
			<RefreshCw class="h-3.5 w-3.5" /> 重置布局
		</Button>
	</header>

	<div class="flex-1 overflow-y-auto px-3 py-4">
		<div class="space-y-3">
				{#each cardOrder as cardId (cardId)}
					{@const meta = CARD_META[cardId]}
					{@const isCollapsed = collapsed[cardId]}
					<Card.Root class="group relative rounded-lg border bg-muted/10 transition-all">
						<Card.Header class="flex flex-row items-center justify-between space-y-0 px-3 py-2">
						<div class="flex items-center gap-3">
							<div class="flex items-center gap-1">
								<Button
									variant="ghost"
									size="icon"
									class="h-6 w-6"
									onclick={() => moveCard(cardId, 'up')}
									disabled={cardOrder.indexOf(cardId) === 0}
								>
									<ArrowUp class="h-3.5 w-3.5" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									class="h-6 w-6"
									onclick={() => moveCard(cardId, 'down')}
									disabled={cardOrder.indexOf(cardId) === cardOrder.length - 1}
								>
									<ArrowDown class="h-3.5 w-3.5" />
								</Button>
							</div>
							<div>
								<Card.Title class="text-sm">{meta.title}</Card.Title>
								<Card.Description class="text-xs">{meta.description}</Card.Description>
							</div>
						</div>
						<Button variant="ghost" size="icon" class="h-6 w-6" onclick={() => toggleCollapsed(cardId)}>
							{#if isCollapsed}
								<ChevronDown class="h-4 w-4" />
							{:else}
								<ChevronUp class="h-4 w-4" />
							{/if}
						</Button>
					</Card.Header>
					<Card.Content class={`p-3 ${isCollapsed ? 'hidden' : ''}`}>
						{#if cardId === 'daily-trend'}
							{@const data = buildHistoryTrend()}
							<div class="flex items-center justify-between text-xs text-muted-foreground">
								<span>本周共 {data.currentWeek} 次访问</span>
								<span class={data.delta >= 0 ? 'text-emerald-500' : 'text-red-500'}>
									{data.delta >= 0 ? '+' : ''}{data.delta}% 对比上周
								</span>
							</div>
							<div class="mt-3 flex items-end gap-2">
								{#each data.trend as day}
									<div class="flex flex-1 flex-col items-center gap-2 text-[11px] text-muted-foreground">
										<div class="flex h-16 w-full items-end rounded bg-muted/50">
											<div
												class={`w-full rounded-t ${day.count === data.maxCount ? 'bg-primary' : 'bg-primary/70'}`}
												style={`height: ${(day.count / data.maxCount) * 100 || 4}%`}
											></div>
										</div>
										<span>{day.label}</span>
									</div>
								{/each}
							</div>
						{:else if cardId === 'reading-streak'}
							{@const streak = readingStreak}
							<div class="grid grid-cols-3 gap-3 text-center">
								<div>
									<p class="text-xs text-muted-foreground">当前连续</p>
									<p class="text-lg font-semibold">{streak.currentStreak} 天</p>
								</div>
								<div>
									<p class="text-xs text-muted-foreground">历史最长</p>
									<p class="text-lg font-semibold">{streak.longestStreak} 天</p>
								</div>
								<div>
									<p class="text-xs text-muted-foreground">最近活跃</p>
									<p class="text-lg font-semibold">{streak.lastActiveDate ?? '—'}</p>
								</div>
							</div>
							<ReadingStreakChart points={streak.points} maxValue={Math.max(streak.maxValue, 1)} />
						{:else if cardId === 'reading-heatmap'}
							{@const heatmap = readingHeatmap}
							<div class="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
								{#if heatmap.topSlot}
									<span>
										高峰：{heatmap.topSlot.weekdayLabel} {heatmap.topSlot.hourLabel}
										<b class="text-foreground">{heatmap.topSlot.count}</b> 次
									</span>
								{:else}
									<span>暂无活跃记录</span>
								{/if}
								<span>覆盖：{historyEntries.length} 条历史记录</span>
							</div>
							<ReadingHeatmapChart cells={heatmap.cells} maxCount={Math.max(heatmap.maxCount, 1)} />
						{:else if cardId === 'bookmark-overview'}
							{@const stats = buildBookmarkStats()}
							<div class="grid grid-cols-3 gap-3 text-center">
								<div>
									<p class="text-xs text-muted-foreground">书签总数</p>
									<p class="text-lg font-semibold">{stats.total}</p>
								</div>
								<div>
									<p class="text-xs text-muted-foreground">近 7 天新增</p>
									<p class="text-lg font-semibold">{stats.recent}</p>
								</div>
								<div>
									<p class="text-xs text-muted-foreground">文件夹占比</p>
									<p class="text-lg font-semibold">{stats.folderRatio}%</p>
								</div>
							</div>
							<div class="mt-2 space-y-2 text-xs">
								<div class="flex items-center justify-between">
									<span>文件夹 {stats.folders}</span>
									<span>{100 - stats.folderRatio}% 文件</span>
								</div>
								<Progress value={stats.folderRatio} max={100} />
							</div>
						{:else if cardId === 'source-breakdown'}
							{@const source = buildSourceBreakdown()}
							{#if source.total === 0}
								<p class="text-center text-xs text-muted-foreground">暂无历史数据</p>
							{:else}
							<div class="space-y-2 text-xs">
								{#each source.segments as segment}
									<div>
										<div class="flex justify-between text-[11px]">
											<span class="text-primary">{segment.label}</span>
											<span class="text-muted-foreground">{segment.count} · {segment.percent}%</span>
										</div>
										<div class="h-1.5 rounded bg-muted">
											<div
												class="h-full rounded bg-primary"
												style={`width: ${segment.percent}%`}
											></div>
										</div>
									</div>
								{/each}
							</div>
						{/if}
						{:else if cardId === 'emm-tags'}
							{@const tags = buildTagSummary()}
							{#if tags.total === 0}
								<p class="text-center text-xs text-muted-foreground">未检测到 EMM 标签，请在设置中连接数据库。</p>
							{:else}
								<div class="text-xs">
									<span class="text-muted-foreground">共</span>
									<span class="text-primary font-semibold"> {tags.total} </span>
									<span class="text-muted-foreground">个收藏标签</span>
								</div>
								<div class="mt-2 flex flex-wrap gap-2">
									{#each tags.previewTags as tag}
										<Badge class="gap-1" style={`border-color: ${tag.color}; color: ${tag.color}`}>{tag.display}</Badge>
									{/each}
								</div>
								<div class="mt-3 space-y-2 text-xs">
									{#each tags.topLetters as letter}
										<div class="flex items-center justify-between">
											<span>分类 {letter.letter}</span>
											<span><span class="text-primary">{letter.count}</span> <span class="text-muted-foreground">个标签</span></span>
										</div>
									{/each}
								</div>
							{/if}
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	</div>
</div>
