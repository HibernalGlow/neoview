<script lang="ts">
	/**
	 * 侧边栏高度卡片
	 * 控制左右侧边栏的高度和垂直对齐，以及悬停触发区域
	 */
	import { Button } from '$lib/components/ui/button';
	import {
		sidebarConfigStore,
		leftSidebarHeight,
		leftSidebarVerticalAlign,
		rightSidebarHeight,
		rightSidebarVerticalAlign,
		type SidebarHeightPreset,
		type SidebarVerticalAlign,
		getSidebarHeightPercent
	} from '$lib/stores/sidebarConfig.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import {
		PanelLeft,
		PanelRight,
		AlignVerticalJustifyStart,
		AlignVerticalJustifyCenter,
		AlignVerticalJustifyEnd,
		MousePointer2
	} from '@lucide/svelte';

	// 高度预设选项
	const heightPresets: { value: SidebarHeightPreset; label: string }[] = [
		{ value: 'full', label: '全高' },
		{ value: '2/3', label: '2/3' },
		{ value: 'half', label: '半高' },
		{ value: '1/3', label: '1/3' }
	];

	// 对齐选项
	const alignOptions: { value: SidebarVerticalAlign; label: string; icon: typeof AlignVerticalJustifyStart }[] = [
		{ value: 'top', label: '顶部', icon: AlignVerticalJustifyStart },
		{ value: 'center', label: '居中', icon: AlignVerticalJustifyCenter },
		{ value: 'bottom', label: '底部', icon: AlignVerticalJustifyEnd }
	];

	let settings = $state(settingsManager.getSettings());
	let hoverAreas = $derived(settings.panels?.hoverAreas || {
		topTriggerHeight: 4,
		bottomTriggerHeight: 4,
		leftTriggerWidth: 32,
		rightTriggerWidth: 32
	});

	$effect(() => {
		settingsManager.addListener((s) => {
			settings = s;
		});
	});

	function updateHoverAreas(partial: any) {
		settingsManager.updateNestedSettings('panels', {
			hoverAreas: { ...hoverAreas, ...partial }
		});
	}

	// 调试日志
	$effect(() => {
		console.log('[SidebarHeightCard] Left Height:', $leftSidebarHeight, getSidebarHeightPercent($leftSidebarHeight, 100));
		console.log('[SidebarHeightCard] Left Align:', $leftSidebarVerticalAlign);
		console.log('[SidebarHeightCard] Right Height:', $rightSidebarHeight, getSidebarHeightPercent($rightSidebarHeight, 100));
		console.log('[SidebarHeightCard] Right Align:', $rightSidebarVerticalAlign);
	});
</script>

<div class="text-muted-foreground space-y-4 text-xs">
	<p class="text-muted-foreground/70 text-[10px]">
		竖屏模式下，可以设置侧边栏不占满整个高度，以看到更多画面内容。
	</p>

	<div class="grid grid-cols-2 gap-4">
		<!-- 左侧边栏 -->
		<div class="space-y-2">
			<div class="flex items-center gap-1.5">
				<PanelLeft class="h-3 w-3 text-blue-500" />
				<span class="font-medium">左侧高度</span>
			</div>
			
			<div class="flex flex-wrap gap-1">
				{#each heightPresets as { value, label }}
					<Button
						variant={$leftSidebarHeight === value ? 'default' : 'ghost'}
						size="sm"
						class="h-6 px-1.5 text-[10px]"
						onclick={() => sidebarConfigStore.setLeftSidebarHeight(value)}
					>
						{label}
					</Button>
				{/each}
			</div>
			
			{#if $leftSidebarHeight !== 'full'}
				<div class="flex gap-0.5">
					{#each alignOptions as { value, label, icon: Icon }}
						<Button
							variant={$leftSidebarVerticalAlign === value ? 'default' : 'ghost'}
							size="sm"
							class="h-6 w-6 p-0"
							onclick={() => sidebarConfigStore.setLeftSidebarVerticalAlign(value)}
							title={label}
						>
							<Icon class="h-3 w-3" />
						</Button>
					{/each}
				</div>
			{/if}
		</div>
		
		<!-- 右侧边栏 -->
		<div class="space-y-2">
			<div class="flex items-center gap-1.5">
				<PanelRight class="h-3 w-3 text-green-500" />
				<span class="font-medium">右侧高度</span>
			</div>
			
			<div class="flex flex-wrap gap-1">
				{#each heightPresets as { value, label }}
					<Button
						variant={$rightSidebarHeight === value ? 'default' : 'ghost'}
						size="sm"
						class="h-6 px-1.5 text-[10px]"
						onclick={() => sidebarConfigStore.setRightSidebarHeight(value)}
					>
						{label}
					</Button>
				{/each}
			</div>
			
			{#if $rightSidebarHeight !== 'full'}
				<div class="flex gap-0.5">
					{#each alignOptions as { value, label, icon: Icon }}
						<Button
							variant={$rightSidebarVerticalAlign === value ? 'default' : 'ghost'}
							size="sm"
							class="h-6 w-6 p-0"
							onclick={() => sidebarConfigStore.setRightSidebarVerticalAlign(value)}
							title={label}
						>
							<Icon class="h-3 w-3" />
						</Button>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<hr class="opacity-20" />

	<!-- 触发区域设置 -->
	<div class="space-y-4">
		<div class="flex items-center gap-1.5">
			<MousePointer2 class="h-3 w-3" />
			<span class="font-medium">触发区域配置 (px)</span>
		</div>
		
		<div class="grid grid-cols-2 gap-x-4 gap-y-3">
			<!-- 宽度 -->
			<div class="space-y-1">
				<div class="flex justify-between text-[10px]">
					<span class="text-muted-foreground/70">左侧触发宽</span>
					<span class="font-mono">{hoverAreas.leftTriggerWidth}px</span>
				</div>
				<input
					type="range"
					min="4"
					max="64"
					step="1"
					value={hoverAreas.leftTriggerWidth}
					oninput={(e) => updateHoverAreas({ leftTriggerWidth: Number(e.currentTarget.value) })}
					class="h-1 w-full bg-muted accent-primary"
				/>
			</div>
			<div class="space-y-1">
				<div class="flex justify-between text-[10px]">
					<span class="text-muted-foreground/70">右侧触发宽</span>
					<span class="font-mono">{hoverAreas.rightTriggerWidth}px</span>
				</div>
				<input
					type="range"
					min="4"
					max="64"
					step="1"
					value={hoverAreas.rightTriggerWidth}
					oninput={(e) => updateHoverAreas({ rightTriggerWidth: Number(e.currentTarget.value) })}
					class="h-1 w-full bg-muted accent-primary"
				/>
			</div>

			<!-- 高度 -->
			<div class="space-y-1">
				<div class="flex justify-between text-[10px]">
					<span class="text-muted-foreground/70">顶部触发高</span>
					<span class="font-mono">{hoverAreas.topTriggerHeight}px</span>
				</div>
				<input
					type="range"
					min="2"
					max="48"
					step="1"
					value={hoverAreas.topTriggerHeight}
					oninput={(e) => updateHoverAreas({ topTriggerHeight: Number(e.currentTarget.value) })}
					class="h-1 w-full bg-muted accent-primary"
				/>
			</div>
			<div class="space-y-1">
				<div class="flex justify-between text-[10px]">
					<span class="text-muted-foreground/70">底部触发高</span>
					<span class="font-mono">{hoverAreas.bottomTriggerHeight}px</span>
				</div>
				<input
					type="range"
					min="2"
					max="48"
					step="1"
					value={hoverAreas.bottomTriggerHeight}
					oninput={(e) => updateHoverAreas({ bottomTriggerHeight: Number(e.currentTarget.value) })}
					class="h-1 w-full bg-muted accent-primary"
				/>
			</div>
		</div>
	</div>
</div>
