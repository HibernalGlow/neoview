<script lang="ts">
	import { bookStore } from '$lib/stores/book.svelte';
	import { upscaleState } from '$lib/stores/upscale/upscaleState.svelte';

	let {
		showProgressBar = true,
		totalPages = 0,
		currentPageIndex = 0,
		preUpscaleProgress = 0,
		totalPreUpscalePages = 0
	} = $props();

	// 内部状态，不再从外部传入
	let progressColor = $state('#FDFBF7');
	let progressBlinking = $state(false);

	// 计算预超分覆盖范围
	const furthestPreUpscaledIndex = $derived(bookStore.getFurthestPreUpscaledIndex());
	const preUpscaleExtent = $derived(furthestPreUpscaledIndex >= 0 ? ((furthestPreUpscaledIndex + 1) / totalPages) * 100 : 0);

	// 根据当前页面状态和全局状态计算进度条状态
	const currentPageStatus = $derived(totalPages > 0 ? bookStore.getPageUpscaleStatus(currentPageIndex) : 'none');
	const isCurrentPageUpscaling = $derived(upscaleState.isUpscaling && upscaleState.currentImageHash !== null);
	
	// 更新进度条状态
	$effect(() => {
		if (isCurrentPageUpscaling) {
			progressColor = '#FFFFFF'; // 白色
			progressBlinking = true;
		} else if (currentPageStatus === 'done') {
			progressColor = '#22c55e'; // 绿色
			progressBlinking = false;
		} else if (currentPageStatus === 'failed') {
			progressColor = '#ef4444'; // 红色
			progressBlinking = false;
		} else {
			progressColor = '#FDFBF7'; // 奶白色
			progressBlinking = false;
		}
	});
</script>

{#if showProgressBar && totalPages > 0}
	<!-- 底部双层进度条 -->
	<div class="absolute bottom-0 left-0 right-0 h-1 pointer-events-none">
		<!-- 下层：预超分覆盖进度条（黄色） -->
		{#if preUpscaleExtent > 0}
			<div
				class="absolute bottom-0 left-0 h-full transition-all duration-500"
				style={`width: ${preUpscaleExtent}%; background-color: #FCD34D; opacity: 0.6;`}
			></div>
		{/if}
		
		<!-- 上层：阅读进度 + 当前页超分状态条 -->
		<div
			class={`absolute bottom-0 left-0 h-full transition-all duration-300 ${progressBlinking ? 'animate-pulse' : ''}`}
			style={`width: ${((currentPageIndex + 1) / totalPages) * 100}%; background-color: ${progressColor}; opacity: 0.8;`}
		></div>
	</div>
{/if}
