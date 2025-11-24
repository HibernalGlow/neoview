<script lang="ts">
	/**
	 * 悬停触发区域预览覆盖层
	 * 高亮显示顶部/底部/左右边栏的悬停触发区域，辅助调节设置
	 */
	import { settingsManager, type NeoViewSettings } from '$lib/settings/settingsManager';

	interface Props {
		show?: boolean;
	}

	let { show = $bindable(false) }: Props = $props();

	let settings = $state<NeoViewSettings>(settingsManager.getSettings());
	let hoverAreas = $derived(settings.panels?.hoverAreas);

	$effect(() => {
		const listener = (next: NeoViewSettings) => {
			settings = next;
		};
		settingsManager.addListener(listener);
		return () => {
			settingsManager.removeListener(listener);
		};
	});
</script>

{#if show}
	<div class="pointer-events-none fixed inset-0 z-[56]">
		<!-- 半透明背景 -->
		<div class="absolute inset-0 bg-black/20"></div>

		<!-- 顶部悬停区域 -->
		<div
			class="absolute left-0 right-0 top-0 flex justify-center"
			style={`height: ${hoverAreas.topTriggerHeight || 4}px;`}
		>
			<div class="h-full w-full border-b border-white/70 bg-white/15"></div>
		</div>

		<!-- 底部悬停区域 -->
		<div
			class="absolute bottom-0 left-0 right-0 flex justify-center"
			style={`height: ${hoverAreas.bottomTriggerHeight || 4}px;`}
		>
			<div class="h-full w-full border-t border-white/70 bg-white/15"></div>
		</div>

		<!-- 左侧悬停区域 -->
		<div
			class="absolute bottom-0 left-0 top-0 flex items-center"
			style={`width: ${hoverAreas.leftTriggerWidth || 12}px;`}
		>
			<div class="h-full w-full border-r border-white/70 bg-white/15"></div>
		</div>

		<!-- 右侧悬停区域 -->
		<div
			class="absolute bottom-0 right-0 top-0 flex items-center justify-end"
			style={`width: ${hoverAreas.rightTriggerWidth || 12}px;`}
		>
			<div class="h-full w-full border-l border-white/70 bg-white/15"></div>
		</div>

		<!-- 说明文本 -->
		<div
			class="absolute bottom-4 left-4 max-w-xs rounded-lg bg-black/70 px-3 py-2 text-xs text-white"
		>
			<div class="space-y-1">
				<div>
					白色高亮区域表示鼠标悬停时会触发顶部工具栏、底部缩略图栏和左右边栏显示的敏感区域。
				</div>
				<div>可在「设置 → 边栏管理」中调整这些区域的宽度/高度。</div>
			</div>
		</div>
	</div>
{/if}
