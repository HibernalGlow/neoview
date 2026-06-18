<script lang="ts">
	/**
	 * 翻页动画设置卡片
	 * 提供翻页动画类型、时长、缓动函数的控制界面
	 */
	import { onMount } from 'svelte';
	import {
		pageTransitionStore,
		transitionTypeNames,
		easingNames,
		type PageTransitionSettings,
		type PageTransitionType,
		type EasingType
	} from '$lib/stores/pageTransitionStore.svelte';
	import { RotateCcw } from '@lucide/svelte';

	let settings = $state<PageTransitionSettings | null>(null);

	// 动画类型列表
	const transitionTypes: PageTransitionType[] = [
		'none',
		'fade',
		'slide',
		'slideUp',
		'zoom',
		'flip'
	];

	// 缓动函数列表
	const easingTypes: EasingType[] = [
		'linear',
		'ease',
		'easeIn',
		'easeOut',
		'easeInOut',
		'easeOutQuad',
		'easeOutCubic'
	];

	onMount(() => {
		const unsubscribe = pageTransitionStore.subscribe((s) => {
			settings = s;
		});
		return unsubscribe;
	});

	// 切换启用
	function toggleEnabled() {
		if (settings) {
			pageTransitionStore.setEnabled(!settings.enabled);
		}
	}

	// 重置设置
	function resetSettings() {
		pageTransitionStore.reset();
	}
</script>

{#if settings}
	<div class="space-y-3 text-sm">
		<!-- 启用开关 -->
		<div class="flex items-center justify-between">
			<label class="flex cursor-pointer items-center gap-2">
				<input
					type="checkbox"
					checked={settings.enabled}
					onchange={toggleEnabled}
					class="border-border h-4 w-4 rounded"
				/>
				<span>启用翻页动画</span>
			</label>
			<button
				type="button"
				onclick={resetSettings}
				class="hover:bg-accent rounded p-1"
				title="重置设置"
			>
				<RotateCcw class="h-4 w-4" />
			</button>
		</div>

		{#if settings.enabled}
			<!-- 动画类型 -->
			<div class="space-y-1">
				<span class="text-muted-foreground text-xs">动画类型</span>
				<select
					value={settings.type}
					onchange={(e) => pageTransitionStore.setType(e.currentTarget.value as PageTransitionType)}
					class="bg-background border-border w-full rounded border px-2 py-1 text-xs"
				>
					{#each transitionTypes as type}
						<option value={type}>{transitionTypeNames[type]}</option>
					{/each}
				</select>
			</div>

			<!-- 动画时长 -->
			<div class="space-y-1">
				<div class="flex justify-between text-xs">
					<span class="text-muted-foreground">动画时长</span>
					<span>{settings.duration}ms</span>
				</div>
				<input
					type="range"
					min="0"
					max="500"
					step="10"
					value={settings.duration}
					oninput={(e) => pageTransitionStore.setDuration(Number(e.currentTarget.value))}
					class="accent-primary h-1 w-full"
				/>
				<div class="text-muted-foreground flex justify-between text-[10px]">
					<span>0ms</span>
					<span>500ms</span>
				</div>
			</div>

			<!-- 缓动函数 -->
			<div class="space-y-1">
				<span class="text-muted-foreground text-xs">缓动函数</span>
				<select
					value={settings.easing}
					onchange={(e) => pageTransitionStore.setEasing(e.currentTarget.value as EasingType)}
					class="bg-background border-border w-full rounded border px-2 py-1 text-xs"
				>
					{#each easingTypes as easing}
						<option value={easing}>{easingNames[easing]}</option>
					{/each}
				</select>
			</div>

			<!-- 预览区域 -->
			<div class="border-border border-t pt-2">
				<span class="text-muted-foreground text-xs">预览</span>
				<div class="bg-muted/30 relative mt-2 h-16 overflow-hidden rounded">
					<div
						class="bg-primary/20 text-muted-foreground preview-box absolute inset-2 flex items-center justify-center rounded text-xs transition-all"
						style="transition: all {settings.duration}ms {settings.easing === 'easeOutQuad'
							? 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
							: settings.easing === 'easeOutCubic'
								? 'cubic-bezier(0.215, 0.61, 0.355, 1)'
								: settings.easing};"
					>
						{transitionTypeNames[settings.type]}
					</div>
				</div>
			</div>
		{/if}
	</div>
{:else}
	<div class="text-muted-foreground py-2 text-center text-sm">加载中...</div>
{/if}

<style>
	.preview-box:hover {
		transform: scale(0.95);
		opacity: 0.7;
	}
</style>
