<script lang="ts">
	/**
	 * 预超分管理卡片
	 * 包含预超分开关、预加载配置、递进超分等功能
	 */
	import { onMount, onDestroy } from 'svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import { Progress } from '$lib/components/ui/progress';
	import {
		preUpscaleEnabled,
		preloadPages,
		backgroundConcurrency,
		progressiveUpscaleEnabled,
		progressiveDwellTime,
		progressiveMaxPages,
		autoUpscaleEnabled,
		saveSettings
	} from '$lib/stores/upscale/upscalePanelStore.svelte';
	import { upscaleStore } from '$lib/stackview/stores/upscaleStore.svelte';
	import { bookStore } from '$lib/stores/book.svelte';

	// 递进超分状态
	let dwellTimer: ReturnType<typeof setTimeout> | null = null;
	let countdownTimer: ReturnType<typeof setInterval> | null = null;
	let isProgressiveRunning = $state(false);
	let countdown = $state(0); // 倒计时秒数
	let isTimerActive = $state(false); // 计时器是否激活

	// 响应式依赖
	const upscaleEnabled = $derived(upscaleStore.enabled);
	const isAutoUpscaleEnabled = $derived(autoUpscaleEnabled.value);
	const totalPages = $derived(bookStore.totalPages);
	const currentPageIndex = $derived(bookStore.currentPageIndex);
	const upscaleStoreVersion = $derived(upscaleStore.version);

	// 计算已超分页数
	const upscaledCount = $derived(() => {
		void upscaleStoreVersion;
		let count = 0;
		for (let i = 0; i < totalPages; i++) {
			if (upscaleStore.isPageUpscaled(i)) {
				count++;
			}
		}
		return count;
	});

	// 计算队列中的页数
	const pendingCount = $derived(() => {
		void upscaleStoreVersion;
		return upscaleStore.stats.pendingTasks + upscaleStore.stats.processingTasks;
	});

	function handlePreUpscaleChange(checked: boolean) {
		preUpscaleEnabled.value = checked;
		saveSettings();
	}

	function handleProgressiveChange(checked: boolean) {
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

		// 设置倒计时
		countdown = progressiveDwellTime.value;
		isTimerActive = true;

		// 每秒更新倒计时
		countdownTimer = setInterval(() => {
			countdown = Math.max(0, countdown - 1);
		}, 1000);

		dwellTimer = setTimeout(() => {
			triggerProgressiveUpscale();
		}, progressiveDwellTime.value * 1000);
	}

	function stopDwellTimer() {
		if (dwellTimer) {
			clearTimeout(dwellTimer);
			dwellTimer = null;
		}
		if (countdownTimer) {
			clearInterval(countdownTimer);
			countdownTimer = null;
		}
		isTimerActive = false;
		countdown = 0;
	}

	async function triggerProgressiveUpscale() {
		if (!upscaleEnabled || !progressiveUpscaleEnabled.value) return;

		// 停止倒计时
		if (countdownTimer) {
			clearInterval(countdownTimer);
			countdownTimer = null;
		}

		isProgressiveRunning = true;
		countdown = 0;

		// 递进超分：向后扩展超分范围
		const maxPages = progressiveMaxPages.value === 999 ? totalPages : progressiveMaxPages.value;
		console.log(`📈 递进超分触发: 当前页 ${currentPageIndex + 1}, 最大页数 ${maxPages}`);

		// 调用递进超分方法
		await upscaleStore.triggerProgressiveUpscale(currentPageIndex, maxPages);

		isProgressiveRunning = false;
		isTimerActive = false;

		// 不再自动重启计时器，等待页面切换时再重新启动
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

	// 计算递进超分状态文本
	const progressiveStatusText = $derived(() => {
		if (!progressiveUpscaleEnabled.value || !isAutoUpscaleEnabled) return null;
		if (isProgressiveRunning) return '触发中...';
		if (isTimerActive && countdown > 0) return `${countdown}秒后触发`;
		if (isTimerActive) return '即将触发';
		return '待机';
	});
</script>

<div class="space-y-3 text-xs">
	<!-- 预超分开关 -->
	<div class="flex items-center justify-between">
		<Label class="text-xs font-medium">预超分</Label>
		<Switch
			checked={preUpscaleEnabled.value}
			onCheckedChange={handlePreUpscaleChange}
			class="scale-90"
			disabled={!isAutoUpscaleEnabled}
		/>
	</div>
	<p class="text-muted-foreground -mt-1 text-[10px]">预加载相邻页面并后台超分</p>

	{#if !isAutoUpscaleEnabled}
		<div class="rounded bg-amber-500/10 p-2 text-[10px] text-amber-500">
			⚠️ 需要先启用「自动超分」才能生效
		</div>
	{/if}

	{#if preUpscaleEnabled.value && isAutoUpscaleEnabled}
		<!-- 预加载页数 -->
		<div class="flex items-center justify-between">
			<span class="text-muted-foreground text-xs">预加载页数</span>
			<select
				class="bg-muted h-6 rounded border-0 px-2 text-xs"
				value={preloadPages.value}
				onchange={(e) => {
					preloadPages.value = parseInt(e.currentTarget.value);
					saveSettings();
				}}
			>
				{#each [1, 2, 3, 5, 10, 20] as n}
					<option value={n}>{n} 页</option>
				{/each}
			</select>
		</div>

		<!-- 后台并发数 -->
		<div class="flex items-center justify-between">
			<span class="text-muted-foreground text-xs">后台并发数</span>
			<select
				class="bg-muted h-6 rounded border-0 px-2 text-xs"
				value={backgroundConcurrency.value}
				onchange={(e) => {
					backgroundConcurrency.value = parseInt(e.currentTarget.value);
					saveSettings();
				}}
			>
				{#each [1, 2, 3, 4] as n}
					<option value={n}>{n}</option>
				{/each}
			</select>
		</div>
	{/if}

	<!-- 分隔线 -->
	<div class="border-t pt-3">
		<!-- 递进超分开关 -->
		<div class="flex items-center justify-between">
			<Label class="text-xs font-medium">递进超分</Label>
			<Switch
				checked={progressiveUpscaleEnabled.value}
				onCheckedChange={handleProgressiveChange}
				class="scale-90"
			/>
		</div>
		<p class="text-muted-foreground mt-1 text-[10px]">
			停留 {progressiveDwellTime.value} 秒后自动向后超分
		</p>
	</div>

	{#if progressiveUpscaleEnabled.value && isAutoUpscaleEnabled}
		<!-- 停留时间 -->
		<div class="flex items-center justify-between">
			<span class="text-muted-foreground text-xs">停留时间</span>
			<select
				class="bg-muted h-6 rounded border-0 px-2 text-xs"
				value={progressiveDwellTime.value}
				onchange={(e) => handleDwellTimeChange(parseInt(e.currentTarget.value))}
			>
				{#each [1, 2, 3, 5, 10, 15, 30] as n}
					<option value={n}>{n} 秒</option>
				{/each}
			</select>
		</div>

		<!-- 最大页数 -->
		<div class="flex items-center justify-between">
			<span class="text-muted-foreground text-xs">最大页数</span>
			<select
				class="bg-muted h-6 rounded border-0 px-2 text-xs"
				value={progressiveMaxPages.value}
				onchange={(e) => handleMaxPagesChange(parseInt(e.currentTarget.value))}
			>
				{#each [5, 10, 20, 50, 100, 999] as n}
					<option value={n}>{n === 999 ? '全部' : `${n} 页`}</option>
				{/each}
			</select>
		</div>
	{/if}

	<!-- 状态统计 -->
	<div class="space-y-2 border-t pt-2">
		<div class="flex items-center justify-between">
			<span class="text-muted-foreground text-xs">已超分</span>
			<span class="font-mono text-xs text-green-500">{upscaledCount()} / {totalPages}</span>
		</div>

		{#if pendingCount() > 0}
			<div class="flex items-center justify-between">
				<span class="text-muted-foreground text-xs">队列中</span>
				<span class="font-mono text-xs text-cyan-500">{pendingCount()}</span>
			</div>
		{/if}

		{#if totalPages > 0}
			<Progress value={(upscaledCount() / totalPages) * 100} class="h-1.5" />
		{/if}

		<!-- 递进超分状态 -->
		{#if progressiveUpscaleEnabled.value && isAutoUpscaleEnabled}
			<div class="flex items-center justify-between">
				<span class="text-muted-foreground text-xs">递进状态</span>
				<div class="flex items-center gap-1.5">
					{#if isProgressiveRunning}
						<div class="h-2 w-2 animate-pulse rounded-full bg-cyan-500"></div>
						<span class="font-mono text-xs text-cyan-500">触发中</span>
					{:else if isTimerActive && countdown > 0}
						<div class="h-2 w-2 animate-pulse rounded-full bg-amber-500"></div>
						<span class="font-mono text-xs text-amber-500">{countdown}s</span>
					{:else if isTimerActive}
						<div class="h-2 w-2 rounded-full bg-green-500"></div>
						<span class="font-mono text-xs text-green-500">即将触发</span>
					{:else}
						<div class="h-2 w-2 rounded-full bg-gray-400"></div>
						<span class="text-muted-foreground font-mono text-xs">待机</span>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
