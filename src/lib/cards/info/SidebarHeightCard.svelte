<script lang="ts">
	/**
	 * 侧边栏高度卡片
	 * 控制左右侧边栏的高度和垂直对齐（Y轴位置），以及悬停触发区域
	 */
	import { Button } from '$lib/components/ui/button';
	import {
		sidebarConfigStore,
		leftSidebarHeight,
		leftSidebarCustomHeight,
		leftSidebarVerticalAlign,
		rightSidebarHeight,
		rightSidebarCustomHeight,
		rightSidebarVerticalAlign,
		type SidebarHeightPreset,
		type SidebarVerticalAlign,
		getSidebarHeightPercent
	} from '$lib/stores/sidebarConfig.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import {
		PanelLeft,
		PanelRight,
		MousePointer2,
		MoveVertical,
		Maximize2
	} from '@lucide/svelte';

	let settings = $state(settingsManager.getSettings());
	let hoverAreas = $derived(settings.panels?.hoverAreas || {
		topTriggerHeight: 4,
		bottomTriggerHeight: 4,
		leftTriggerWidth: 32,
		rightTriggerWidth: 32
	});

	$effect(() => {
		const unsubscribe = settingsManager.addListener((s) => {
			settings = s;
		});
		return unsubscribe;
	});

	function updateHoverAreas(partial: any) {
		settingsManager.updateNestedSettings('panels', {
			hoverAreas: { ...hoverAreas, ...partial }
		});
	}

	// 调试日志
	$effect(() => {
		console.log('[SidebarHeightCard] Left:', { 
			preset: $leftSidebarHeight, 
			custom: $leftSidebarCustomHeight, 
			align: $leftSidebarVerticalAlign 
		});
		console.log('[SidebarHeightCard] Right:', { 
			preset: $rightSidebarHeight, 
			custom: $rightSidebarCustomHeight, 
			align: $rightSidebarVerticalAlign 
		});
	});

	function handleHeightChange(side: 'left' | 'right', value: number) {
		if (value >= 100) {
			if (side === 'left') {
				sidebarConfigStore.setLeftSidebarHeight('full');
				sidebarConfigStore.setLeftSidebarCustomHeight(100);
			} else {
				sidebarConfigStore.setRightSidebarHeight('full');
				sidebarConfigStore.setRightSidebarCustomHeight(100);
			}
		} else {
			if (side === 'left') {
				sidebarConfigStore.setLeftSidebarHeight('custom');
				sidebarConfigStore.setLeftSidebarCustomHeight(value);
			} else {
				sidebarConfigStore.setRightSidebarHeight('custom');
				sidebarConfigStore.setRightSidebarCustomHeight(value);
			}
		}
	}

	function handleAlignChange(side: 'left' | 'right', value: number) {
		if (side === 'left') {
			sidebarConfigStore.setLeftSidebarVerticalAlign(value);
		} else {
			sidebarConfigStore.setRightSidebarVerticalAlign(value);
		}
	}

	const leftCurrentHeight = $derived(getSidebarHeightPercent($leftSidebarHeight, $leftSidebarCustomHeight));
	const rightCurrentHeight = $derived(getSidebarHeightPercent($rightSidebarHeight, $rightSidebarCustomHeight));
</script>

<div class="text-muted-foreground space-y-5 text-xs">
	<p class="text-muted-foreground/70 text-[10px] leading-relaxed">
		精确调整侧边栏的尺寸与位置。设置为 100% 时自动切换为全高模式。
	</p>

	<div class="grid grid-cols-2 gap-x-8 gap-y-6">
		<!-- 左侧边栏控制 -->
		<div class="space-y-4">
			<div class="flex items-center gap-1.5 border-b border-blue-500/20 pb-1.5 mb-3">
				<PanelLeft class="h-3.5 w-3.5 text-blue-500" />
				<span class="font-bold text-[11px] text-foreground">左侧边栏</span>
			</div>
			
			<!-- 高度控制 -->
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1 text-[10px]">
						<Maximize2 class="h-2.5 w-2.5" />
						<span>高度</span>
					</div>
					<span class="font-mono text-[10px] tabular-nums text-blue-400">{Math.round(leftCurrentHeight)}%</span>
				</div>
				<input
					type="range"
					min="10"
					max="100"
					step="1"
					value={leftCurrentHeight}
					oninput={(e) => handleHeightChange('left', Number(e.currentTarget.value))}
					class="h-1.5 w-full bg-muted accent-blue-500 rounded-lg appearance-none cursor-pointer"
				/>
			</div>

			<!-- 位置控制 -->
			<div class="space-y-2" class:opacity-30={$leftSidebarHeight === 'full'} class:pointer-events-none={$leftSidebarHeight === 'full'}>
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1 text-[10px]">
						<MoveVertical class="h-2.5 w-2.5" />
						<span>Y轴位置</span>
					</div>
					<span class="font-mono text-[10px] tabular-nums text-blue-400">{$leftSidebarVerticalAlign}%</span>
				</div>
				<input
					type="range"
					min="0"
					max="100"
					step="1"
					value={$leftSidebarVerticalAlign}
					oninput={(e) => handleAlignChange('left', Number(e.currentTarget.value))}
					class="h-1.5 w-full bg-muted accent-blue-500 rounded-lg appearance-none cursor-pointer"
				/>
				<div class="flex justify-between text-[9px] text-muted-foreground/50 px-0.5">
					<span>顶</span>
					<span>中</span>
					<span>底</span>
				</div>
			</div>
		</div>
		
		<!-- 右侧边栏控制 -->
		<div class="space-y-4">
			<div class="flex items-center gap-1.5 border-b border-green-500/20 pb-1.5 mb-3">
				<PanelRight class="h-3.5 w-3.5 text-green-500" />
				<span class="font-bold text-[11px] text-foreground">右侧边栏</span>
			</div>
			
			<!-- 高度控制 -->
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1 text-[10px]">
						<Maximize2 class="h-2.5 w-2.5" />
						<span>高度</span>
					</div>
					<span class="font-mono text-[10px] tabular-nums text-green-400">{Math.round(rightCurrentHeight)}%</span>
				</div>
				<input
					type="range"
					min="10"
					max="100"
					step="1"
					value={rightCurrentHeight}
					oninput={(e) => handleHeightChange('right', Number(e.currentTarget.value))}
					class="h-1.5 w-full bg-muted accent-green-500 rounded-lg appearance-none cursor-pointer"
				/>
			</div>

			<!-- 位置控制 -->
			<div class="space-y-2" class:opacity-30={$rightSidebarHeight === 'full'} class:pointer-events-none={$rightSidebarHeight === 'full'}>
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1 text-[10px]">
						<MoveVertical class="h-2.5 w-2.5" />
						<span>Y轴位置</span>
					</div>
					<span class="font-mono text-[10px] tabular-nums text-green-400">{$rightSidebarVerticalAlign}%</span>
				</div>
				<input
					type="range"
					min="0"
					max="100"
					step="1"
					value={$rightSidebarVerticalAlign}
					oninput={(e) => handleAlignChange('right', Number(e.currentTarget.value))}
					class="h-1.5 w-full bg-muted accent-green-500 rounded-lg appearance-none cursor-pointer"
				/>
				<div class="flex justify-between text-[9px] text-muted-foreground/50 px-0.5">
					<span>顶</span>
					<span>中</span>
					<span>底</span>
				</div>
			</div>
		</div>
	</div>

	<hr class="opacity-10 border-foreground" />

	<!-- 触发区域配置 -->
	<div class="space-y-4 bg-accent/20 p-3 rounded-lg border border-border/50">
		<div class="flex items-center gap-1.5 mb-1">
			<MousePointer2 class="h-3.5 w-3.5 text-primary" />
			<span class="font-bold text-[11px] text-foreground">触控触发区域 (Pixel)</span>
		</div>
		
		<div class="grid grid-cols-2 gap-x-6 gap-y-4">
			<!-- 宽度组 -->
			<div class="space-y-3">
				<div class="space-y-1.5">
					<div class="flex justify-between text-[10px]">
						<span class="text-muted-foreground/80">左边缘触发宽</span>
						<span class="font-mono text-primary">{hoverAreas.leftTriggerWidth}px</span>
					</div>
					<input
						type="range"
						min="4"
						max="64"
						step="1"
						value={hoverAreas.leftTriggerWidth}
						oninput={(e) => updateHoverAreas({ leftTriggerWidth: Number(e.currentTarget.value) })}
						class="h-1 w-full bg-muted accent-primary cursor-pointer"
					/>
				</div>
				<div class="space-y-1.5">
					<div class="flex justify-between text-[10px]">
						<span class="text-muted-foreground/80">右边缘触发宽</span>
						<span class="font-mono text-primary">{hoverAreas.rightTriggerWidth}px</span>
					</div>
					<input
						type="range"
						min="4"
						max="64"
						step="1"
						value={hoverAreas.rightTriggerWidth}
						oninput={(e) => updateHoverAreas({ rightTriggerWidth: Number(e.currentTarget.value) })}
						class="h-1 w-full bg-muted accent-primary cursor-pointer"
					/>
				</div>
			</div>

			<!-- 高度组 -->
			<div class="space-y-3">
				<div class="space-y-1.5">
					<div class="flex justify-between text-[10px]">
						<span class="text-muted-foreground/80">顶边缘触发高</span>
						<span class="font-mono text-primary">{hoverAreas.topTriggerHeight}px</span>
					</div>
					<input
						type="range"
						min="2"
						max="48"
						step="1"
						value={hoverAreas.topTriggerHeight}
						oninput={(e) => updateHoverAreas({ topTriggerHeight: Number(e.currentTarget.value) })}
						class="h-1 w-full bg-muted accent-primary cursor-pointer"
					/>
				</div>
				<div class="space-y-1.5">
					<div class="flex justify-between text-[10px]">
						<span class="text-muted-foreground/80">底边缘触发高</span>
						<span class="font-mono text-primary">{hoverAreas.bottomTriggerHeight}px</span>
					</div>
					<input
						type="range"
						min="2"
						max="48"
						step="1"
						value={hoverAreas.bottomTriggerHeight}
						oninput={(e) => updateHoverAreas({ bottomTriggerHeight: Number(e.currentTarget.value) })}
						class="h-1 w-full bg-muted accent-primary cursor-pointer"
					/>
				</div>
			</div>
		</div>
	</div>
</div>
