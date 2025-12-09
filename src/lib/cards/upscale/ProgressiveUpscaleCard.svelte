<script lang="ts">
/**
 * 递进超分卡片
 * 根据停留时间自动向后超分
 */
import { onMount, onDestroy } from 'svelte';
import { Switch } from '$lib/components/ui/switch';
import { Label } from '$lib/components/ui/label';
import { Progress } from '$lib/components/ui/progress';
import {
	progressiveUpscaleEnabled,
	progressiveDwellTime,
	progressiveMaxPages,
	autoUpscaleEnabled,
	saveSettings
} from '$lib/stores/upscale/upscalePanelStore.svelte';
import { upscaleStore } from '$lib/stackview/stores/upscaleStore.svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { imagePool } from '$lib/stackview/stores/imagePool.svelte';

// 递进超分状态
let dwellTimer: ReturnType<typeof setTimeout> | null = null;
let currentTargetPage = $state(0);
let isProgressiveRunning = $state(false);
let progressedPages = $state(0);

// 响应式依赖
const upscaleEnabled = $derived(upscaleStore.enabled);
const totalPages = $derived(bookStore.totalPages);
const currentPageIndex = $derived(bookStore.currentPageIndex);
const imagePoolVersion = $derived(imagePool.version);

// 计算已超分页数
const upscaledCount = $derived(() => {
	void imagePoolVersion;
	let count = 0;
	for (let i = 0; i < totalPages; i++) {
		if (imagePool.hasUpscaled(i)) {
			count++;
		}
	}
	return count;
});

function handleEnabledChange(checked: boolean) {
	progressiveUpscaleEnabled.value = checked;
	saveSettings();
	
	if (checked && autoUpscaleEnabled.value) {
		startDwellTimer();
	} else {
		stopDwellTimer();
	}
}

function handleDwellTimeChange(value: number) {
	progressiveDwellTime.value = value;
	saveSettings();
	// 重启计时器
	if (progressiveUpscaleEnabled.value && autoUpscaleEnabled.value) {
		startDwellTimer();
	}
}

function handleMaxPagesChange(value: number) {
	progressiveMaxPages.value = value;
	saveSettings();
}

function startDwellTimer() {
	stopDwellTimer();
	
	if (!progressiveUpscaleEnabled.value || !autoUpscaleEnabled.value) return;
	
	dwellTimer = setTimeout(() => {
		triggerProgressiveUpscale();
	}, progressiveDwellTime.value * 1000);
}

function stopDwellTimer() {
	if (dwellTimer) {
		clearTimeout(dwellTimer);
		dwellTimer = null;
	}
}

async function triggerProgressiveUpscale() {
	if (!upscaleEnabled || !progressiveUpscaleEnabled.value) return;
	
	const startPage = currentPageIndex + 1;
	const endPage = Math.min(startPage + progressiveMaxPages.value, totalPages);
	
	if (startPage >= totalPages) return;
	
	isProgressiveRunning = true;
	currentTargetPage = startPage;
	progressedPages = 0;
	
	console.log(`📈 递进超分: 从第 ${startPage + 1} 页到第 ${endPage} 页`);
	
	// 触发超分请求
	await upscaleStore.triggerCurrentPageUpscale();
	
	isProgressiveRunning = false;
}

// 监听页面变化，重置计时器
$effect(() => {
	void currentPageIndex;
	if (progressiveUpscaleEnabled.value && autoUpscaleEnabled.value) {
		startDwellTimer();
	}
});

onMount(() => {
	if (progressiveUpscaleEnabled.value && autoUpscaleEnabled.value) {
		startDwellTimer();
	}
});

onDestroy(() => {
	stopDwellTimer();
});
</script>

<div class="space-y-3 text-xs">
	<!-- 递进超分开关 -->
	<div class="flex items-center justify-between">
		<Label class="text-xs font-medium">递进超分</Label>
		<Switch
			checked={progressiveUpscaleEnabled.value}
			onCheckedChange={handleEnabledChange}
			class="scale-90"
		/>
	</div>
	<p class="text-[10px] text-muted-foreground -mt-1">
		停留 {progressiveDwellTime.value} 秒后自动向后超分
	</p>

	{#if progressiveUpscaleEnabled.value}
		<!-- 停留时间配置 -->
		<div class="flex items-center justify-between">
			<span class="text-xs text-muted-foreground">停留时间</span>
			<select
				class="h-6 px-2 text-xs bg-muted rounded border-0"
				value={progressiveDwellTime.value}
				onchange={(e) => handleDwellTimeChange(parseInt(e.currentTarget.value))}
			>
				{#each [1, 2, 3, 5, 10, 15, 30] as n}
					<option value={n}>{n} 秒</option>
				{/each}
			</select>
		</div>

		<!-- 最大页数配置 -->
		<div class="flex items-center justify-between">
			<span class="text-xs text-muted-foreground">最大页数</span>
			<select
				class="h-6 px-2 text-xs bg-muted rounded border-0"
				value={progressiveMaxPages.value}
				onchange={(e) => handleMaxPagesChange(parseInt(e.currentTarget.value))}
			>
				{#each [5, 10, 20, 50, 100, 999] as n}
					<option value={n}>{n === 999 ? '全部' : `${n} 页`}</option>
				{/each}
			</select>
		</div>

		<!-- 状态显示 -->
		<div class="pt-2 border-t space-y-2">
			<div class="flex items-center justify-between">
				<span class="text-xs text-muted-foreground">已超分</span>
				<span class="text-xs font-mono">{upscaledCount()} / {totalPages}</span>
			</div>
			
			{#if totalPages > 0}
				<Progress value={(upscaledCount() / totalPages) * 100} class="h-1.5" />
			{/if}

			{#if isProgressiveRunning}
				<div class="flex items-center gap-2">
					<div class="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></div>
					<span class="text-[10px] text-cyan-500">递进超分中...</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- 提示 -->
	{#if !autoUpscaleEnabled.value && progressiveUpscaleEnabled.value}
		<div class="text-[10px] text-amber-500 bg-amber-500/10 rounded p-2">
			⚠️ 需要先启用「自动超分」才能生效
		</div>
	{/if}
</div>
