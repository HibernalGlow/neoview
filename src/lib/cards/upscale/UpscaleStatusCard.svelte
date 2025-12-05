<script lang="ts">
/**
 * 超分状态信息卡片
 * 实时显示当前图片的超分状态
 */
import { Loader2, Check, X, SkipForward, ImageOff } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { upscaleStore, type UpscaleStatus } from '$lib/stackview/stores/upscaleStore.svelte';
import { imagePool } from '$lib/stackview/stores/imagePool.svelte';
import { selectedModel, scale } from '$lib/stores/upscale/upscalePanelStore.svelte';

// 当前页面索引
let currentPageIndex = $derived(upscaleStore.currentPageIndex);

// 当前页面状态
let pageStatus = $derived(upscaleStore.getPageStatus(currentPageIndex));

// 是否有超分图
let hasUpscaled = $derived(upscaleStore.isPageUpscaled(currentPageIndex));

// 是否使用超分图（对比模式）
let useUpscaled = $state(true);

// 是否显示预览图
let showPreview = $state(false);

// 是否显示放大对比面板
let showZoomCompare = $state(false);

// 浮窗尺寸和位置
let floatWindow = $state({
	width: 400,
	height: 450,
	x: 0, // 由 CSS right 控制，这里不用
	y: 0,
});

// 拖拽调整大小逻辑
let resizing = $state<string | null>(null);
let startPos = { x: 0, y: 0, width: 0, height: 0 };

function startResize(e: MouseEvent, direction: string) {
	e.preventDefault();
	resizing = direction;
	startPos = {
		x: e.clientX,
		y: e.clientY,
		width: floatWindow.width,
		height: floatWindow.height,
	};
	window.addEventListener('mousemove', onResize);
	window.addEventListener('mouseup', stopResize);
}

function onResize(e: MouseEvent) {
	if (!resizing) return;
	
	const dx = e.clientX - startPos.x;
	const dy = e.clientY - startPos.y;
	
	let newWidth = startPos.width;
	let newHeight = startPos.height;
	
	// 根据方向调整
	if (resizing.includes('e')) newWidth = Math.max(200, startPos.width + dx);
	if (resizing.includes('w')) newWidth = Math.max(200, startPos.width - dx);
	if (resizing.includes('s')) newHeight = Math.max(200, startPos.height + dy);
	if (resizing.includes('n')) newHeight = Math.max(200, startPos.height - dy);
	
	floatWindow.width = newWidth;
	floatWindow.height = newHeight;
}

function stopResize() {
	resizing = null;
	window.removeEventListener('mousemove', onResize);
	window.removeEventListener('mouseup', stopResize);
}

// 超分版本（触发响应式更新）
let upscaleVersion = $derived(imagePool.version);

// 原图 URL
let originalUrl = $derived.by(() => {
	const img = imagePool.getSync(currentPageIndex);
	return img?.url ?? null;
});

// 超分图 URL
let upscaledUrl = $derived(imagePool.getUpscaledUrl(currentPageIndex));

// 当前显示的 URL
let displayUrl = $derived(useUpscaled && upscaledUrl ? upscaledUrl : originalUrl);

// 当前图片尺寸（从 imagePool 获取）
let originalDimensions = $derived.by(() => {
	const img = imagePool.getSync(currentPageIndex);
	return img ? { width: img.width || 0, height: img.height || 0 } : null;
});

// 状态显示信息
interface StatusInfo {
	label: string;
	color: string;
	icon: typeof Check;
	description: string;
}

function getStatusInfo(status: UpscaleStatus | null): StatusInfo {
	switch (status) {
		case 'pending':
			return { label: '等待中', color: 'text-muted-foreground', icon: Loader2, description: '排队等待超分' };
		case 'processing':
			return { label: '超分中', color: 'text-blue-500', icon: Loader2, description: '正在进行超分处理' };
		case 'completed':
			return { label: '已完成', color: 'text-green-500', icon: Check, description: '超分完成' };
		case 'skipped':
			return { label: '已跳过', color: 'text-yellow-500', icon: SkipForward, description: '不符合条件，已跳过' };
		case 'failed':
			return { label: '失败', color: 'text-red-500', icon: X, description: '超分处理失败' };
		case 'cancelled':
			return { label: '已取消', color: 'text-muted-foreground', icon: X, description: '任务已取消' };
		default:
			return { label: '未超分', color: 'text-muted-foreground', icon: ImageOff, description: '尚未进行超分' };
	}
}

let statusInfo = $derived(getStatusInfo(pageStatus));

// 计算超分后尺寸（假设按 scale 放大）
let upscaledDimensions = $derived.by(() => {
	if (!originalDimensions || !hasUpscaled) return null;
	const s = scale.value || 2;
	return {
		width: originalDimensions.width * s,
		height: originalDimensions.height * s,
	};
});
</script>

<div class="space-y-3 text-xs">
	<!-- 页面信息 -->
	<div class="flex items-center justify-between">
		<span class="text-muted-foreground">当前页面</span>
		<span class="font-mono">{currentPageIndex + 1}</span>
	</div>

	<!-- 超分状态 -->
	<div class="p-2 rounded-lg bg-muted/50 space-y-2">
		<div class="flex items-center justify-between">
			<span class="text-muted-foreground">状态</span>
			<span class="flex items-center gap-1.5 {statusInfo.color}">
				{#if pageStatus === 'processing'}
					<Loader2 class="h-3.5 w-3.5 animate-spin" />
				{:else}
					{@const Icon = statusInfo.icon}
					<Icon class="h-3.5 w-3.5" />
				{/if}
				<span class="font-medium">{statusInfo.label}</span>
			</span>
		</div>
		<p class="text-[10px] text-muted-foreground">{statusInfo.description}</p>
	</div>

	<!-- 模型信息 -->
	{#if upscaleStore.enabled}
		<div class="flex items-center justify-between">
			<span class="text-muted-foreground">模型</span>
			<span class="font-mono text-[10px] truncate max-w-[120px]" title={selectedModel.value}>
				{selectedModel.value}
			</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-muted-foreground">放大倍率</span>
			<span class="font-mono">{scale.value}x</span>
		</div>
	{/if}

	<!-- 尺寸信息 -->
	{#if originalDimensions && originalDimensions.width > 0}
		<div class="space-y-1">
			<div class="flex items-center justify-between">
				<span class="text-muted-foreground">原图尺寸</span>
				<span class="font-mono">{originalDimensions.width}×{originalDimensions.height}</span>
			</div>
			{#if hasUpscaled && upscaledDimensions}
				<div class="flex items-center justify-between text-green-500">
					<span>超分尺寸</span>
					<span class="font-mono">{upscaledDimensions.width}×{upscaledDimensions.height}</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- 预览开关 -->
	<div class="flex items-center justify-between">
		<span class="text-muted-foreground">显示预览</span>
		<button
			class="relative w-8 h-4 rounded-full transition-colors {showPreview ? 'bg-primary' : 'bg-muted'}"
			onclick={() => showPreview = !showPreview}
			aria-label="切换预览显示"
		>
			<span class="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform {showPreview ? 'translate-x-4' : ''}"></span>
		</button>
	</div>

	<!-- 预览图和对比切换 -->
	{#if showPreview && displayUrl}
		<div class="space-y-2">
			<!-- 点击切换原图/超分图 -->
			<button
				class="w-full rounded-lg overflow-hidden border border-border/50 hover:border-primary/50 transition-colors"
				onclick={() => { if (hasUpscaled) useUpscaled = !useUpscaled; }}
				disabled={!hasUpscaled}
				aria-label="切换原图/超分图对比"
			>
				<img
					src={displayUrl}
					alt={useUpscaled && hasUpscaled ? '超分图' : '原图'}
					class="w-full h-auto max-h-[200px] object-contain bg-muted/30"
				/>
			</button>
			<!-- 当前显示状态 -->
			<div class="flex items-center justify-center gap-2 text-[10px]">
				{#if hasUpscaled}
					<span class="{useUpscaled ? 'text-green-500 font-medium' : 'text-muted-foreground'}">
						{useUpscaled ? '🔍 超分图' : '📷 原图'}
					</span>
					<span class="text-muted-foreground">（点击图片切换）</span>
				{:else}
					<span class="text-muted-foreground">📷 原图</span>
				{/if}
			</div>
		</div>
	{:else if showPreview && !displayUrl}
		<div class="p-4 text-center text-muted-foreground bg-muted/30 rounded-lg">
			暂无图片
		</div>
	{/if}

	<!-- 放大对比开关（仅在有超分图时显示） -->
	{#if hasUpscaled}
		<div class="flex items-center justify-between">
			<span class="text-muted-foreground">放大对比</span>
			<button
				class="relative w-8 h-4 rounded-full transition-colors {showZoomCompare ? 'bg-primary' : 'bg-muted'}"
				onclick={() => showZoomCompare = !showZoomCompare}
				aria-label="切换放大对比面板"
			>
				<span class="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform {showZoomCompare ? 'translate-x-4' : ''}"></span>
			</button>
		</div>
	{/if}

	<!-- 处理状态提示 -->
	{#if pageStatus === 'processing'}
		<div class="flex items-center justify-center gap-2 py-2 text-blue-500">
			<Loader2 class="h-4 w-4 animate-spin" />
			<span>正在超分处理...</span>
		</div>
	{:else if !upscaleStore.enabled}
		<p class="text-center text-muted-foreground py-2">
			超分功能未启用
		</p>
	{/if}

	<!-- 服务统计 -->
	{#if upscaleStore.enabled}
		<div class="pt-2 border-t border-border/50 space-y-1 text-[10px] text-muted-foreground">
			<div class="flex justify-between">
				<span>队列</span>
				<span>{upscaleStore.stats.pendingTasks} 等待 / {upscaleStore.stats.processingTasks} 处理中</span>
			</div>
			<div class="flex justify-between">
				<span>统计</span>
				<span class="space-x-2">
					<span class="text-green-500">{upscaleStore.stats.completedCount} 完成</span>
					<span class="text-yellow-500">{upscaleStore.stats.skippedCount} 跳过</span>
					{#if upscaleStore.stats.failedCount > 0}
						<span class="text-red-500">{upscaleStore.stats.failedCount} 失败</span>
					{/if}
				</span>
			</div>
		</div>
	{/if}
</div>

<!-- 可调整大小的浮窗对比 -->
{#if showZoomCompare && hasUpscaled && originalUrl && upscaledUrl}
	<div 
		class="fixed z-50 bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-2xl overflow-hidden"
		style="right: 16px; top: 50%; transform: translateY(-50%); width: {floatWindow.width}px; height: {floatWindow.height}px;"
	>
		<!-- 调整大小手柄 -->
		<!-- 四边 -->
		<div class="absolute top-0 left-2 right-2 h-1 cursor-n-resize hover:bg-primary/30" onmousedown={(e) => startResize(e, 'n')}></div>
		<div class="absolute bottom-0 left-2 right-2 h-1 cursor-s-resize hover:bg-primary/30" onmousedown={(e) => startResize(e, 's')}></div>
		<div class="absolute left-0 top-2 bottom-2 w-1 cursor-w-resize hover:bg-primary/30" onmousedown={(e) => startResize(e, 'w')}></div>
		<div class="absolute right-0 top-2 bottom-2 w-1 cursor-e-resize hover:bg-primary/30" onmousedown={(e) => startResize(e, 'e')}></div>
		<!-- 四角 -->
		<div class="absolute top-0 left-0 w-3 h-3 cursor-nw-resize hover:bg-primary/30" onmousedown={(e) => startResize(e, 'nw')}></div>
		<div class="absolute top-0 right-0 w-3 h-3 cursor-ne-resize hover:bg-primary/30" onmousedown={(e) => startResize(e, 'ne')}></div>
		<div class="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize hover:bg-primary/30" onmousedown={(e) => startResize(e, 'sw')}></div>
		<div class="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize hover:bg-primary/30" onmousedown={(e) => startResize(e, 'se')}></div>

		<!-- 标题栏 -->
		<div class="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/30">
			<span class="text-xs font-medium flex items-center gap-1.5">
				{#if useUpscaled}
					<span class="text-green-500">🔍 超分图</span>
				{:else}
					<span>📷 原图</span>
				{/if}
			</span>
			<button
				class="w-5 h-5 flex items-center justify-center rounded hover:bg-muted"
				onclick={() => showZoomCompare = false}
				aria-label="关闭对比浮窗"
			>
				<X class="h-3.5 w-3.5" />
			</button>
		</div>
		
		<!-- 可点击切换的图片 -->
		<button 
			class="w-full h-[calc(100%-60px)] flex items-center justify-center bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
			onclick={() => useUpscaled = !useUpscaled}
			aria-label="点击切换原图/超分图"
		>
			<img
				src={useUpscaled ? upscaledUrl : originalUrl}
				alt={useUpscaled ? '超分图' : '原图'}
				class="max-w-full max-h-full object-contain"
			/>
		</button>
		
		<!-- 底部信息 -->
		<div class="absolute bottom-0 left-0 right-0 px-3 py-1.5 bg-background/80 border-t border-border/50 text-[10px] flex justify-between items-center">
			<span class="text-muted-foreground">
				{useUpscaled && upscaledDimensions 
					? `${upscaledDimensions.width}×${upscaledDimensions.height}` 
					: originalDimensions 
						? `${originalDimensions.width}×${originalDimensions.height}` 
						: ''}
			</span>
			<span class="text-muted-foreground">点击切换 | 拖拽边缘调整</span>
		</div>
	</div>
{/if}
