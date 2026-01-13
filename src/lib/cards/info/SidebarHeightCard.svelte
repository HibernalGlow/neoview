<script lang="ts">
	/**
	 * 侧边栏高度卡片
	 * 控制左右侧边栏的高度、垂直位置（Y轴）、水平位置（X轴），以及悬停触发区域
	 */
	import {
		sidebarConfigStore,
		leftSidebarHeight,
		leftSidebarCustomHeight,
		leftSidebarVerticalAlign,
		leftSidebarHorizontalPos,
		rightSidebarHeight,
		rightSidebarCustomHeight,
		rightSidebarVerticalAlign,
		rightSidebarHorizontalPos,
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
		MoveHorizontal,
		Maximize2
	} from '@lucide/svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import { showDragHandle } from '$lib/stores/sidebarConfig.svelte';

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

	function handleYPosChange(side: 'left' | 'right', value: number) {
		if (side === 'left') {
			sidebarConfigStore.setLeftSidebarVerticalAlign(value);
		} else {
			sidebarConfigStore.setRightSidebarVerticalAlign(value);
		}
	}

	function handleXPosChange(side: 'left' | 'right', value: number) {
		if (side === 'left') {
			sidebarConfigStore.setLeftSidebarHorizontalPos(value);
		} else {
			sidebarConfigStore.setRightSidebarHorizontalPos(value);
		}
	}

	const leftCurrentHeight = $derived(getSidebarHeightPercent($leftSidebarHeight, $leftSidebarCustomHeight));
	const rightCurrentHeight = $derived(getSidebarHeightPercent($rightSidebarHeight, $rightSidebarCustomHeight));
	
	// 检查是否为全高模式（此时位置控制无意义）
	const leftIsFullSize = $derived($leftSidebarHeight === 'full');
	const rightIsFullSize = $derived($rightSidebarHeight === 'full');
</script>

<div class="text-muted-foreground space-y-5 text-xs">
	<div class="flex items-center justify-between pb-1">
		<p class="text-muted-foreground/70 text-[10px] leading-relaxed">
			自由调整侧边栏的尺寸与位置。高度 100% 时位置控制禁用。
		</p>
		<div class="flex items-center gap-2">
			<Label for="show-drag-handle" class="text-[10px] cursor-pointer">显示拖拽手柄</Label>
			<Switch 
				id="show-drag-handle" 
				checked={$showDragHandle} 
				onCheckedChange={(v) => sidebarConfigStore.setShowDragHandle(v)} 
			/>
		</div>
	</div>

	<div class="grid grid-cols-2 gap-x-6 gap-y-4">
		<!-- 左侧边栏控制 -->
		<div class="space-y-3">
			<div class="flex items-center gap-1.5 border-b border-blue-500/30 pb-1 mb-2">
				<PanelLeft class="h-3.5 w-3.5 text-blue-500" />
				<span class="font-bold text-[11px] text-foreground">左侧边栏</span>
			</div>
			
			<!-- 高度 -->
			<div class="space-y-1">
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
					class="h-1 w-full bg-muted accent-blue-500 rounded-lg appearance-none cursor-pointer"
				/>
			</div>

			<!-- Y轴 -->
			<div class="space-y-1" class:opacity-30={leftIsFullSize} class:pointer-events-none={leftIsFullSize}>
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1 text-[10px]">
						<MoveVertical class="h-2.5 w-2.5" />
						<span>Y轴</span>
					</div>
					<span class="font-mono text-[10px] tabular-nums text-blue-400">{$leftSidebarVerticalAlign}%</span>
				</div>
				<input
					type="range"
					min="0"
					max="100"
					step="1"
					value={$leftSidebarVerticalAlign}
					oninput={(e) => handleYPosChange('left', Number(e.currentTarget.value))}
					class="h-1 w-full bg-muted accent-blue-500 rounded-lg appearance-none cursor-pointer"
				/>
			</div>

			<!-- X轴 -->
			<div class="space-y-1">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1 text-[10px]">
						<MoveHorizontal class="h-2.5 w-2.5" />
						<span>X轴</span>
					</div>
					<span class="font-mono text-[10px] tabular-nums text-blue-400">{$leftSidebarHorizontalPos}%</span>
				</div>
				<input
					type="range"
					min="0"
					max="100"
					step="1"
					value={$leftSidebarHorizontalPos}
					oninput={(e) => handleXPosChange('left', Number(e.currentTarget.value))}
					class="h-1 w-full bg-muted accent-blue-500 rounded-lg appearance-none cursor-pointer"
				/>
				<div class="flex justify-between text-[8px] text-muted-foreground/40 px-0.5">
					<span>贴边</span>
					<span>居中</span>
				</div>
			</div>
		</div>
		
		<!-- 右侧边栏控制 -->
		<div class="space-y-3">
			<div class="flex items-center gap-1.5 border-b border-green-500/30 pb-1 mb-2">
				<PanelRight class="h-3.5 w-3.5 text-green-500" />
				<span class="font-bold text-[11px] text-foreground">右侧边栏</span>
			</div>
			
			<!-- 高度 -->
			<div class="space-y-1">
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
					class="h-1 w-full bg-muted accent-green-500 rounded-lg appearance-none cursor-pointer"
				/>
			</div>

			<!-- Y轴 -->
			<div class="space-y-1" class:opacity-30={rightIsFullSize} class:pointer-events-none={rightIsFullSize}>
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1 text-[10px]">
						<MoveVertical class="h-2.5 w-2.5" />
						<span>Y轴</span>
					</div>
					<span class="font-mono text-[10px] tabular-nums text-green-400">{$rightSidebarVerticalAlign}%</span>
				</div>
				<input
					type="range"
					min="0"
					max="100"
					step="1"
					value={$rightSidebarVerticalAlign}
					oninput={(e) => handleYPosChange('right', Number(e.currentTarget.value))}
					class="h-1 w-full bg-muted accent-green-500 rounded-lg appearance-none cursor-pointer"
				/>
			</div>

			<!-- X轴 -->
			<div class="space-y-1">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1 text-[10px]">
						<MoveHorizontal class="h-2.5 w-2.5" />
						<span>X轴</span>
					</div>
					<span class="font-mono text-[10px] tabular-nums text-green-400">{$rightSidebarHorizontalPos}%</span>
				</div>
				<input
					type="range"
					min="0"
					max="100"
					step="1"
					value={$rightSidebarHorizontalPos}
					oninput={(e) => handleXPosChange('right', Number(e.currentTarget.value))}
					class="h-1 w-full bg-muted accent-green-500 rounded-lg appearance-none cursor-pointer"
				/>
				<div class="flex justify-between text-[8px] text-muted-foreground/40 px-0.5">
					<span>贴边</span>
					<span>居中</span>
				</div>
			</div>
		</div>
	</div>

	<hr class="opacity-10 border-foreground" />

	<!-- 触发区域配置 -->
	<div class="space-y-3 bg-accent/10 p-2.5 rounded-lg border border-border/30">
		<div class="flex items-center gap-1.5">
			<MousePointer2 class="h-3 w-3 text-primary" />
			<span class="font-medium text-[10px] text-foreground">触控区域 (px)</span>
		</div>
		
		<div class="grid grid-cols-2 gap-x-4 gap-y-2">
			<div class="space-y-1">
				<div class="flex justify-between text-[9px]">
					<span class="text-muted-foreground/70">左边缘</span>
					<span class="font-mono text-primary">{hoverAreas.leftTriggerWidth}</span>
				</div>
				<input
					type="range"
					min="4"
					max="64"
					step="1"
					value={hoverAreas.leftTriggerWidth}
					oninput={(e) => updateHoverAreas({ leftTriggerWidth: Number(e.currentTarget.value) })}
					class="h-0.5 w-full bg-muted accent-primary cursor-pointer"
				/>
			</div>
			<div class="space-y-1">
				<div class="flex justify-between text-[9px]">
					<span class="text-muted-foreground/70">右边缘</span>
					<span class="font-mono text-primary">{hoverAreas.rightTriggerWidth}</span>
				</div>
				<input
					type="range"
					min="4"
					max="64"
					step="1"
					value={hoverAreas.rightTriggerWidth}
					oninput={(e) => updateHoverAreas({ rightTriggerWidth: Number(e.currentTarget.value) })}
					class="h-0.5 w-full bg-muted accent-primary cursor-pointer"
				/>
			</div>
			<div class="space-y-1">
				<div class="flex justify-between text-[9px]">
					<span class="text-muted-foreground/70">顶边缘</span>
					<span class="font-mono text-primary">{hoverAreas.topTriggerHeight}</span>
				</div>
				<input
					type="range"
					min="2"
					max="48"
					step="1"
					value={hoverAreas.topTriggerHeight}
					oninput={(e) => updateHoverAreas({ topTriggerHeight: Number(e.currentTarget.value) })}
					class="h-0.5 w-full bg-muted accent-primary cursor-pointer"
				/>
			</div>
			<div class="space-y-1">
				<div class="flex justify-between text-[9px]">
					<span class="text-muted-foreground/70">底边缘</span>
					<span class="font-mono text-primary">{hoverAreas.bottomTriggerHeight}</span>
				</div>
				<input
					type="range"
					min="2"
					max="48"
					step="1"
					value={hoverAreas.bottomTriggerHeight}
					oninput={(e) => updateHoverAreas({ bottomTriggerHeight: Number(e.currentTarget.value) })}
					class="h-0.5 w-full bg-muted accent-primary cursor-pointer"
				/>
			</div>
		</div>
	</div>
</div>
