<script lang="ts">
/**
 * 预加载状态卡片
 * 显示递进预加载状态，参考递进超分卡片的设计
 * 
 * 功能：
 * - 显示预加载配置（高/普通/低优先级范围）
 * - 显示当前预加载窗口
 * - 显示预解码缓存统计
 * - 支持动态调整预加载参数
 * - 递进加载：停留时间后自动向后扩展加载
 */
import { onMount, onDestroy } from 'svelte';
import { Switch } from '$lib/components/ui/switch';
import { Label } from '$lib/components/ui/label';
import { Progress } from '$lib/components/ui/progress';
import { bookStore } from '$lib/stores/book.svelte';
import { preDecodeCache } from '$lib/stackview/stores/preDecodeCache.svelte';
import { imagePool } from '$lib/stackview/stores/imagePool.svelte';
import { 
	renderQueue, 
	type PreloadConfig, 
	type ProgressiveLoadConfig,
	type ProgressiveLoadState 
} from '$lib/stackview/stores/renderQueue';
import { settingsManager } from '$lib/settings/settingsManager';

// 响应式依赖
const totalPages = $derived(bookStore.totalPages);
const currentPageIndex = $derived(bookStore.currentPageIndex);
const preDecodeVersion = $derived(preDecodeCache.version);
const imagePoolVersion = $derived(imagePool.version);

// 预加载配置状态
let config = $state<PreloadConfig>(renderQueue.getConfig());
let adaptiveEnabled = $state(true);

// 递进加载配置和状态
let progressiveConfig = $state<ProgressiveLoadConfig>(renderQueue.getProgressiveConfig());
let progressiveState = $state<ProgressiveLoadState>(renderQueue.getProgressiveState());

// 计算已预解码页数
const preDecodedCount = $derived.by(() => {
	void preDecodeVersion;
	return preDecodeCache.getStats().size;
});

// 计算已预加载页数（Blob 缓存）
const preloadedCount = $derived.by(() => {
	void imagePoolVersion;
	let count = 0;
	for (let i = 0; i < totalPages; i++) {
		if (imagePool.has(i)) {
			count++;
		}
	}
	return count;
});

// 计算队列状态
const queueStatus = $derived.by(() => {
	void preDecodeVersion;
	return renderQueue.getStatus();
});

// 预解码缓存统计
const cacheStats = $derived.by(() => {
	void preDecodeVersion;
	return preDecodeCache.getStats();
});

// 预解码缓存最大值
let preDecodeCacheMaxSize = $state(preDecodeCache.getStats().maxSize);

// 更新配置
function updateConfig(partial: Partial<PreloadConfig>) {
	renderQueue.setConfig(partial);
	config = renderQueue.getConfig();
}

// 应用自适应配置
async function applyAdaptive() {
	await renderQueue.applyAdaptiveConfig();
	config = renderQueue.getConfig();
}

// 保存到设置
function saveToSettings() {
	settingsManager.updateSettings({
		performance: {
			...settingsManager.getSettings().performance,
			preLoadSize: config.lowRange
		}
	});
}

// 处理自适应开关
async function handleAdaptiveChange(checked: boolean) {
	adaptiveEnabled = checked;
	if (checked) {
		await applyAdaptive();
	}
}

// 处理范围变更
function handleRangeChange(type: 'high' | 'normal' | 'low', value: number) {
	const partial: Partial<PreloadConfig> = {};
	if (type === 'high') partial.highRange = value;
	if (type === 'normal') partial.normalRange = value;
	if (type === 'low') partial.lowRange = value;
	updateConfig(partial);
	saveToSettings();
}

// 处理延迟变更
function handleDelayChange(type: 'high' | 'normal' | 'low', value: number) {
	const partial: Partial<PreloadConfig> = {};
	if (type === 'high') partial.highDelay = value;
	if (type === 'normal') partial.normalDelay = value;
	if (type === 'low') partial.lowDelay = value;
	updateConfig(partial);
}

// 递进加载配置处理
function handleProgressiveEnabledChange(checked: boolean) {
	renderQueue.setProgressiveConfig({ enabled: checked });
	progressiveConfig = renderQueue.getProgressiveConfig();
}

function handleProgressiveDwellTimeChange(value: number) {
	renderQueue.setProgressiveConfig({ dwellTime: value });
	progressiveConfig = renderQueue.getProgressiveConfig();
}

function handleProgressiveBatchSizeChange(value: number) {
	renderQueue.setProgressiveConfig({ batchSize: value });
	progressiveConfig = renderQueue.getProgressiveConfig();
}

function handleProgressiveMaxPagesChange(value: number) {
	renderQueue.setProgressiveConfig({ maxPages: value });
	progressiveConfig = renderQueue.getProgressiveConfig();
}

// 预解码缓存设置
function handlePreDecodeCacheMaxSizeChange(value: number) {
	preDecodeCache.setMaxSize(value);
	preDecodeCacheMaxSize = value;
}

function clearPreDecodeCache() {
	preDecodeCache.clear();
}

// 状态变更回调
function onStateChange() {
	progressiveState = renderQueue.getProgressiveState();
}

onMount(() => {
	renderQueue.setOnStateChange(onStateChange);
});

onDestroy(() => {
	renderQueue.setOnStateChange(null);
});
</script>

<div class="space-y-3 text-xs">
	<!-- 自适应开关 -->
	<div class="flex items-center justify-between">
		<Label class="text-xs font-medium">自适应预加载</Label>
		<Switch
			checked={adaptiveEnabled}
			onCheckedChange={handleAdaptiveChange}
			class="scale-90"
		/>
	</div>
	<p class="text-[10px] text-muted-foreground -mt-1">
		根据系统性能自动调整预加载参数
	</p>

	<!-- 预加载范围配置 -->
	<div class="pt-2 border-t space-y-2">
		<div class="text-xs font-medium text-muted-foreground">预加载范围</div>
		
		<div class="flex items-center justify-between">
			<span class="text-xs text-muted-foreground">高优先级 (±N页)</span>
			<select
				class="h-6 px-2 text-xs bg-muted rounded border-0"
				value={config.highRange}
				onchange={(e) => handleRangeChange('high', parseInt(e.currentTarget.value))}
				disabled={adaptiveEnabled}
			>
				{#each [1, 2, 3] as n}
					<option value={n}>{n}</option>
				{/each}
			</select>
		</div>

		<div class="flex items-center justify-between">
			<span class="text-xs text-muted-foreground">普通优先级 (±N页)</span>
			<select
				class="h-6 px-2 text-xs bg-muted rounded border-0"
				value={config.normalRange}
				onchange={(e) => handleRangeChange('normal', parseInt(e.currentTarget.value))}
				disabled={adaptiveEnabled}
			>
				{#each [2, 3, 4, 5] as n}
					<option value={n}>{n}</option>
				{/each}
			</select>
		</div>

		<div class="flex items-center justify-between">
			<span class="text-xs text-muted-foreground">低优先级 (±N页)</span>
			<select
				class="h-6 px-2 text-xs bg-muted rounded border-0"
				value={config.lowRange}
				onchange={(e) => handleRangeChange('low', parseInt(e.currentTarget.value))}
				disabled={adaptiveEnabled}
			>
				{#each [3, 5, 7, 10, 15, 20] as n}
					<option value={n}>{n}</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- 递进加载 -->
	<div class="pt-2 border-t space-y-2">
		<div class="flex items-center justify-between">
			<Label class="text-xs font-medium">递进加载</Label>
			<Switch
				checked={progressiveConfig.enabled}
				onCheckedChange={handleProgressiveEnabledChange}
				class="scale-90"
			/>
		</div>
		<p class="text-[10px] text-muted-foreground -mt-1">
			停留 {progressiveConfig.dwellTime} 秒后自动向后预加载
		</p>

		{#if progressiveConfig.enabled}
			<div class="flex items-center justify-between">
				<span class="text-xs text-muted-foreground">停留时间</span>
				<select
					class="h-6 px-2 text-xs bg-muted rounded border-0"
					value={progressiveConfig.dwellTime}
					onchange={(e) => handleProgressiveDwellTimeChange(parseInt(e.currentTarget.value))}
				>
					{#each [1, 2, 3, 5, 10, 15, 30] as n}
						<option value={n}>{n} 秒</option>
					{/each}
				</select>
			</div>

			<div class="flex items-center justify-between">
				<span class="text-xs text-muted-foreground">每次加载</span>
				<select
					class="h-6 px-2 text-xs bg-muted rounded border-0"
					value={progressiveConfig.batchSize}
					onchange={(e) => handleProgressiveBatchSizeChange(parseInt(e.currentTarget.value))}
				>
					{#each [3, 5, 10, 20, 50] as n}
						<option value={n}>{n} 页</option>
					{/each}
				</select>
			</div>

			<div class="flex items-center justify-between">
				<span class="text-xs text-muted-foreground">最大页数</span>
				<select
					class="h-6 px-2 text-xs bg-muted rounded border-0"
					value={progressiveConfig.maxPages}
					onchange={(e) => handleProgressiveMaxPagesChange(parseInt(e.currentTarget.value))}
				>
					{#each [10, 20, 50, 100, 999] as n}
						<option value={n}>{n === 999 ? '全部' : `${n} 页`}</option>
					{/each}
				</select>
			</div>

			<!-- 递进加载状态 -->
			<div class="flex items-center justify-between">
				<span class="text-xs text-muted-foreground">递进状态</span>
				<div class="flex items-center gap-1.5">
					{#if progressiveState.isRunning}
						<div class="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></div>
						<span class="text-xs font-mono text-cyan-500">加载中</span>
					{:else if progressiveState.isTimerActive && progressiveState.countdown > 0}
						<div class="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
						<span class="text-xs font-mono text-amber-500">{progressiveState.countdown}s</span>
					{:else if progressiveState.isTimerActive}
						<div class="w-2 h-2 bg-green-500 rounded-full"></div>
						<span class="text-xs font-mono text-green-500">即将触发</span>
					{:else}
						<div class="w-2 h-2 bg-gray-400 rounded-full"></div>
						<span class="text-xs font-mono text-muted-foreground">待机</span>
					{/if}
				</div>
			</div>

			{#if progressiveState.furthestLoadedIndex >= 0}
				<div class="flex items-center justify-between">
					<span class="text-xs text-muted-foreground">最远加载</span>
					<span class="text-xs font-mono text-green-500">第 {progressiveState.furthestLoadedIndex + 1} 页</span>
				</div>
			{/if}
		{/if}
	</div>

	<!-- 状态统计 -->
	<div class="pt-2 border-t space-y-2">
		<div class="text-xs font-medium text-muted-foreground">预解码缓存</div>
		
		<!-- 缓存大小设置 -->
		<div class="flex items-center justify-between">
			<span class="text-xs text-muted-foreground">缓存容量</span>
			<select
				class="h-6 px-2 text-xs bg-muted rounded border-0"
				value={preDecodeCacheMaxSize}
				onchange={(e) => handlePreDecodeCacheMaxSizeChange(parseInt(e.currentTarget.value))}
			>
				{#each [10, 15, 20, 30, 50, 100] as n}
					<option value={n}>{n} 页</option>
				{/each}
			</select>
		</div>
		
		<!-- 预解码数 -->
		<div class="flex items-center justify-between">
			<span class="text-xs text-muted-foreground">已预解码</span>
			<div class="flex items-center gap-1.5">
				<div class="w-2 h-2 bg-green-500 rounded-full"></div>
				<span class="text-xs font-mono text-green-500">{preDecodedCount} / {cacheStats.maxSize}</span>
			</div>
		</div>
		
		<!-- 已预加载数 -->
		<div class="flex items-center justify-between">
			<span class="text-xs text-muted-foreground">已预加载</span>
			<div class="flex items-center gap-1.5">
				<div class="w-2 h-2 bg-blue-500 rounded-full"></div>
				<span class="text-xs font-mono text-blue-500">{preloadedCount} / {totalPages}</span>
			</div>
		</div>

		<!-- 缓存命中率 -->
		<div class="flex items-center justify-between">
			<span class="text-xs text-muted-foreground">命中率</span>
			<span class="text-xs font-mono text-cyan-500">{(cacheStats.hitRate * 100).toFixed(1)}%</span>
		</div>

		<!-- 命中/未命中统计 -->
		<div class="flex items-center justify-between">
			<span class="text-xs text-muted-foreground">命中/未命中</span>
			<span class="text-xs font-mono">
				<span class="text-green-500">{cacheStats.hits}</span>
				<span class="text-muted-foreground"> / </span>
				<span class="text-red-400">{cacheStats.misses}</span>
			</span>
		</div>

		{#if queueStatus.pendingCount > 0}
			<div class="flex items-center justify-between">
				<span class="text-xs text-muted-foreground">队列中</span>
				<div class="flex items-center gap-1.5">
					<div class="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
					<span class="text-xs font-mono text-amber-500">{queueStatus.pendingCount}</span>
				</div>
			</div>
		{/if}

		{#if totalPages > 0}
			<div class="space-y-1">
				<div class="flex justify-between text-[10px] text-muted-foreground">
					<span>预解码进度</span>
					<span>{((preDecodedCount / Math.min(totalPages, cacheStats.maxSize)) * 100).toFixed(0)}%</span>
				</div>
				<Progress value={(preDecodedCount / Math.min(totalPages, cacheStats.maxSize)) * 100} class="h-1.5" />
			</div>
		{/if}

		<!-- 清空缓存按钮 -->
		<button
			class="w-full h-7 text-xs bg-muted hover:bg-muted/80 rounded transition-colors"
			onclick={clearPreDecodeCache}
		>
			清空预解码缓存
		</button>
	</div>

	<!-- 预加载窗口可视化 -->
	<div class="pt-2 border-t space-y-2">
		<div class="text-xs font-medium text-muted-foreground">预加载窗口</div>
		
		<div class="flex items-center gap-1 text-[10px]">
			<span class="text-muted-foreground">当前页:</span>
			<span class="font-mono text-primary">{currentPageIndex + 1}</span>
			<span class="text-muted-foreground mx-1">|</span>
			<span class="text-muted-foreground">窗口:</span>
			<span class="font-mono text-cyan-500">
				{Math.max(0, currentPageIndex - config.lowRange) + 1} - {Math.min(totalPages, currentPageIndex + config.lowRange + 1)}
			</span>
		</div>

		{#if totalPages > 0}
			<div class="relative h-3 bg-muted rounded overflow-hidden">
				<!-- 低优先级范围 -->
				<div 
					class="absolute h-full bg-gray-400/30"
					style="left: {(Math.max(0, currentPageIndex - config.lowRange) / totalPages) * 100}%; width: {((config.lowRange * 2 + 1) / totalPages) * 100}%"
				></div>
				<!-- 普通优先级范围 -->
				<div 
					class="absolute h-full bg-blue-400/40"
					style="left: {(Math.max(0, currentPageIndex - config.normalRange) / totalPages) * 100}%; width: {((config.normalRange * 2 + 1) / totalPages) * 100}%"
				></div>
				<!-- 高优先级范围 -->
				<div 
					class="absolute h-full bg-green-400/50"
					style="left: {(Math.max(0, currentPageIndex - config.highRange) / totalPages) * 100}%; width: {((config.highRange * 2 + 1) / totalPages) * 100}%"
				></div>
				<!-- 递进加载范围 -->
				{#if progressiveState.furthestLoadedIndex >= 0}
					<div 
						class="absolute h-full bg-cyan-400/40"
						style="left: {((currentPageIndex + config.lowRange + 1) / totalPages) * 100}%; width: {((progressiveState.furthestLoadedIndex - currentPageIndex - config.lowRange) / totalPages) * 100}%"
					></div>
				{/if}
				<!-- 当前页指示器 -->
				<div 
					class="absolute h-full w-0.5 bg-primary"
					style="left: {(currentPageIndex / totalPages) * 100}%"
				></div>
			</div>
			<div class="flex justify-between text-[9px] text-muted-foreground">
				<span>1</span>
				<div class="flex gap-2">
					<span class="text-green-500">■ 高</span>
					<span class="text-blue-500">■ 普通</span>
					<span class="text-gray-400">■ 低</span>
					{#if progressiveConfig.enabled}
						<span class="text-cyan-500">■ 递进</span>
					{/if}
				</div>
				<span>{totalPages}</span>
			</div>
		{/if}
	</div>
</div>
