<script lang="ts">
	/**
	 * 设置覆盖层 - 在主窗口内显示设置面板
	 * 使用最高 z-index 覆盖所有内容
	 */
	import { settingsOverlayOpen, closeSettingsOverlay } from '$lib/stores/settingsOverlay.svelte';
	import SettingsContent from '$lib/components/SettingsContent.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	// 设置界面的模糊和透明度设置
	let settings = $state(settingsManager.getSettings());
	let settingsOpacity = $derived(settings.panels?.settingsOpacity ?? 85);
	let settingsBlur = $derived(settings.panels?.settingsBlur ?? 12);
	
	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			closeSettingsOverlay();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeSettingsOverlay();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $settingsOverlayOpen}
	<!-- 背景遮罩 -->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_interactive_supports_focus -->
	<div
		class="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		onclick={handleBackdropClick}
		role="dialog"
		aria-modal="true"
	>
		<!-- 设置窗口（居中 80%，半透明背景以显示模糊效果） -->
		<div 
			class="relative flex h-[80vh] w-[80vw] max-w-5xl flex-col overflow-hidden rounded-xl border text-foreground shadow-2xl"
		>
			<!-- 标题栏（与顶栏风格一致） -->
			<div 
				class="flex h-10 shrink-0 items-center justify-between border-b px-4"
				style="background-color: color-mix(in oklch, var(--sidebar) {settingsOpacity}%, transparent); backdrop-filter: blur({settingsBlur}px); color: var(--sidebar-foreground);"
			>
				<span class="text-sm font-medium">设置</span>
				<Button
					variant="ghost"
					size="icon"
					class="h-6 w-6"
					onclick={closeSettingsOverlay}
				>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<!-- 设置内容 -->
			<div class="flex-1 overflow-hidden">
				<SettingsContent />
			</div>
		</div>
	</div>
{/if}
