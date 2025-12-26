<script lang="ts">
	/**
	 * HoverScrollPanel - 悬停滚动设置面板
	 * 包含悬停滚动开关和速度设置
	 */
	import { Button } from '$lib/components/ui/button';
	import * as Separator from '$lib/components/ui/separator';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { bookStore } from '$lib/stores/book.svelte';

	// Props
	interface Props {
		expanded: boolean;
	}
	let { expanded }: Props = $props();

	// 设置状态
	let settings = $state(settingsManager.getSettings());
	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	// 派生状态
	let hoverScrollEnabled = $derived(settings.image.hoverScrollEnabled ?? true);
	let hoverScrollSpeed = $derived(settings.image.hoverScrollSpeed ?? 2.0);

	// 切换悬停滚动
	function toggleHoverScroll() {
		const next = !(settings.image.hoverScrollEnabled ?? true);
		settingsManager.updateNestedSettings('image', { hoverScrollEnabled: next });
	}

	// 处理速度变更
	function handleHoverScrollSpeedChange(value: number) {
		const clamped = Math.max(0.5, Math.min(value, 10));
		settingsManager.updateNestedSettings('image', { hoverScrollSpeed: clamped });
	}
</script>

{#if expanded && bookStore.currentBook}
	<div class="flex flex-wrap items-center justify-center gap-2 border-t border-border/50 pt-1">
		<span class="text-muted-foreground mr-2 text-xs">悬停滚动</span>
		
		<!-- 开关按钮 -->
		<Button
			variant={hoverScrollEnabled ? 'default' : 'outline'}
			size="sm"
			class="h-7 px-3"
			onclick={toggleHoverScroll}
		>
			{hoverScrollEnabled ? '已启用' : '已禁用'}
		</Button>

		<Separator.Root orientation="vertical" class="mx-2 h-5" />

		<!-- 滚动倍率 -->
		<span class="text-muted-foreground text-xs">倍率</span>
		<div class="flex items-center gap-1">
			<input
				type="range"
				min="0.5"
				max="10"
				step="0.5"
				value={hoverScrollSpeed}
				oninput={(e) => handleHoverScrollSpeedChange(parseFloat((e.target as HTMLInputElement).value))}
				class="h-1 w-20 cursor-pointer appearance-none rounded-full bg-muted"
			/>
			<span class="w-10 text-center text-xs">{hoverScrollSpeed.toFixed(1)}x</span>
		</div>
	</div>
{/if}
