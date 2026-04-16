<script lang="ts">
	import * as Switch from '$lib/components/ui/switch';
	import { animatedVideoModeStore } from '$lib/stores/animatedVideoMode.svelte';

	const enabled = $derived(animatedVideoModeStore.enabled);
	const ffmpegAvailable = $derived(animatedVideoModeStore.ffmpegAvailable);
	const ffmpegChecked = $derived(animatedVideoModeStore.ffmpegChecked);
	const ffmpegChecking = $derived(animatedVideoModeStore.ffmpegChecking);
	const lastError = $derived(animatedVideoModeStore.lastError);
	const keywords = $derived(animatedVideoModeStore.keywords);
	let keywordText = $state('');

	$effect(() => {
		keywordText = keywords.join(', ');
	});

	function handleToggle(checked: boolean) {
		animatedVideoModeStore.setEnabled(checked);
	}

	async function handleRefreshFfmpeg() {
		await animatedVideoModeStore.refreshFfmpegAvailability();
	}

	function handleKeywordInput(value: string) {
		keywordText = value;
		animatedVideoModeStore.setKeywordsFromText(value);
	}
</script>

<div class="space-y-3 text-xs">
	<div class="flex items-center justify-between gap-2">
		<div class="space-y-0.5">
			<p class="font-medium text-foreground">动图按视频模式播放</p>
			<p class="text-muted-foreground text-[11px]">GIF/APNG 将走视频播放器，可使用倍速与循环。</p>
		</div>
		<Switch.Root
			checked={enabled}
			onCheckedChange={handleToggle}
			class="scale-75"
		/>
	</div>

	<div class="rounded-md border border-border/50 bg-muted/20 p-2">
		<p class="text-muted-foreground mb-1 text-[11px]">关键词直判（优先于 WebP 探测）</p>
		<textarea
			class="min-h-16 w-full rounded border border-border bg-background px-2 py-1 text-[11px]"
			value={keywordText}
			oninput={(e) => handleKeywordInput((e.currentTarget as HTMLTextAreaElement).value)}
			placeholder="例如: [#dyna], [#anim], __gif"
		></textarea>
		<p class="mt-1 text-[10px] text-muted-foreground">使用逗号或换行分隔。命中后直接按动图处理，跳过额外检测。</p>
	</div>

	<div class="rounded-md border border-border/50 bg-muted/20 p-2">
		<div class="flex items-center justify-between gap-2">
			<span class="text-muted-foreground">FFmpeg</span>
			<span
				class="rounded-full px-2 py-0.5 text-[10px] {ffmpegChecking
					? 'bg-amber-500/15 text-amber-600'
					: ffmpegAvailable
						? 'bg-emerald-500/15 text-emerald-600'
						: ffmpegChecked
							? 'bg-destructive/15 text-destructive'
							: 'bg-muted text-muted-foreground'}"
			>
				{#if ffmpegChecking}
					检测中
				{:else if ffmpegAvailable}
					可用
				{:else if ffmpegChecked}
					不可用
				{:else}
					未检测
				{/if}
			</span>
		</div>

		{#if !ffmpegAvailable && ffmpegChecked}
			<p class="mt-1 text-[10px] text-muted-foreground">未检测到 FFmpeg，将自动使用前端解码播放动图。</p>
		{/if}

		{#if lastError}
			<p class="mt-1 text-[10px] text-muted-foreground">错误: {lastError}</p>
		{/if}

		<div class="mt-2">
			<button
				type="button"
				onclick={handleRefreshFfmpeg}
				disabled={ffmpegChecking}
				class="rounded border border-border bg-background px-2 py-1 text-[10px] transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
			>
				{ffmpegChecking ? '检测中...' : '重新检测 FFmpeg'}
			</button>
		</div>
	</div>

	{#if enabled}
		<p class="text-[10px] text-muted-foreground">已启用后，当前页若是 GIF/APNG/动画 WebP（或命中关键词），会自动进入视频模式。</p>
	{/if}
</div>
