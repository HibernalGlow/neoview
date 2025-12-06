<script lang="ts">
	/**
	 * 边栏控制卡片
	 * 控制上下左右边栏的显示/隐藏，支持右键锁定
	 */
	import * as Switch from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import {
		topToolbarPinned,
		bottomThumbnailBarPinned,
		leftSidebarPinned,
		rightSidebarPinned,
		leftSidebarOpen,
		rightSidebarOpen
	} from '$lib/stores/ui.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import {
		PanelTop,
		PanelBottom,
		PanelLeft,
		PanelRight,
		Pin,
		PinOff,
		Move,
		RotateCcw
	} from '@lucide/svelte';

	// 浮动控制器状态
	let floatingControlEnabled = $state(false);
	let floatingControlPosition = $state<{ x: number; y: number }>({ x: 100, y: 100 });

	// 从设置加载
	$effect(() => {
		const s = settingsManager.getSettings();
		const ctrl = s.view?.sidebarControl;
		floatingControlEnabled = ctrl?.enabled ?? true;
		floatingControlPosition = ctrl?.position ?? { x: 100, y: 100 };
	});

	function updateSidebarControl(partial: {
		enabled?: boolean;
		position?: { x: number; y: number };
	}) {
		const current = settingsManager.getSettings();
		const prev = current.view?.sidebarControl ?? { enabled: true, position: { x: 100, y: 100 } };
		const next = { ...prev };

		if (partial.enabled !== undefined) next.enabled = partial.enabled;
		if (partial.position !== undefined) next.position = partial.position;

		floatingControlEnabled = next.enabled;
		floatingControlPosition = next.position;

		settingsManager.updateNestedSettings('view', { sidebarControl: next });
	}

	function resetPosition() {
		updateSidebarControl({ position: { x: 100, y: 100 } });
	}

	// 边栏状态
	let topPinned = $state(false);
	let bottomPinned = $state(false);
	let leftPinned = $state(false);
	let rightPinned = $state(false);
	let leftOpen = $state(false);
	let rightOpen = $state(false);

	// 订阅 stores
	topToolbarPinned.subscribe((v) => (topPinned = v));
	bottomThumbnailBarPinned.subscribe((v) => (bottomPinned = v));
	leftSidebarPinned.subscribe((v) => (leftPinned = v));
	rightSidebarPinned.subscribe((v) => (rightPinned = v));
	leftSidebarOpen.subscribe((v) => (leftOpen = v));
	rightSidebarOpen.subscribe((v) => (rightOpen = v));

	function toggleTopPinned() {
		topToolbarPinned.update((v) => !v);
	}

	function toggleBottomPinned() {
		bottomThumbnailBarPinned.update((v) => !v);
	}

	function toggleLeftPinned() {
		leftSidebarPinned.update((v) => !v);
	}

	function toggleRightPinned() {
		rightSidebarPinned.update((v) => !v);
	}

	function toggleLeftOpen() {
		leftSidebarOpen.update((v) => !v);
	}

	function toggleRightOpen() {
		rightSidebarOpen.update((v) => !v);
	}
</script>

<div class="text-muted-foreground space-y-3 text-xs">
	<!-- 启用浮动控制器 -->
	<div class="flex items-center justify-between gap-2">
		<span>启用浮动控制器</span>
		<div class="flex items-center gap-1">
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				onclick={resetPosition}
				title="重置控制器位置"
			>
				<RotateCcw class="h-3 w-3" />
			</Button>
			<Switch.Root
				checked={floatingControlEnabled}
				onCheckedChange={(v) => updateSidebarControl({ enabled: v })}
				class="scale-75"
			/>
		</div>
	</div>

	<p class="text-muted-foreground/70 text-[10px]">
		启用后会在画面上显示一个可拖动的控制器，用于快速控制边栏显示。
	</p>

	<hr class="border-border/50" />

	<!-- 边栏状态概览 -->
	<div class="grid grid-cols-2 gap-2">
		<!-- 上边栏 -->
		<Button
			variant={topPinned ? 'default' : 'outline'}
			size="sm"
			class="h-8 gap-1 text-xs"
			onclick={toggleTopPinned}
		>
			<PanelTop class="h-3 w-3" />
			<span>上</span>
			{#if topPinned}
				<Pin class="h-2.5 w-2.5" />
			{:else}
				<PinOff class="h-2.5 w-2.5 opacity-50" />
			{/if}
		</Button>

		<!-- 下边栏 -->
		<Button
			variant={bottomPinned ? 'default' : 'outline'}
			size="sm"
			class="h-8 gap-1 text-xs"
			onclick={toggleBottomPinned}
		>
			<PanelBottom class="h-3 w-3" />
			<span>下</span>
			{#if bottomPinned}
				<Pin class="h-2.5 w-2.5" />
			{:else}
				<PinOff class="h-2.5 w-2.5 opacity-50" />
			{/if}
		</Button>

		<!-- 左边栏 -->
		<Button
			variant={leftPinned ? 'default' : leftOpen ? 'secondary' : 'outline'}
			size="sm"
			class="h-8 gap-1 text-xs"
			onclick={toggleLeftOpen}
			oncontextmenu={(e) => {
				e.preventDefault();
				toggleLeftPinned();
			}}
		>
			<PanelLeft class="h-3 w-3" />
			<span>左</span>
			{#if leftPinned}
				<Pin class="h-2.5 w-2.5" />
			{:else if leftOpen}
				<span class="text-[10px] opacity-70">开</span>
			{:else}
				<PinOff class="h-2.5 w-2.5 opacity-50" />
			{/if}
		</Button>

		<!-- 右边栏 -->
		<Button
			variant={rightPinned ? 'default' : rightOpen ? 'secondary' : 'outline'}
			size="sm"
			class="h-8 gap-1 text-xs"
			onclick={toggleRightOpen}
			oncontextmenu={(e) => {
				e.preventDefault();
				toggleRightPinned();
			}}
		>
			<PanelRight class="h-3 w-3" />
			<span>右</span>
			{#if rightPinned}
				<Pin class="h-2.5 w-2.5" />
			{:else if rightOpen}
				<span class="text-[10px] opacity-70">开</span>
			{:else}
				<PinOff class="h-2.5 w-2.5 opacity-50" />
			{/if}
		</Button>
	</div>

	<p class="text-muted-foreground/70 text-[10px]">
		点击切换显示/隐藏，右键切换锁定状态。锁定后边栏不会自动隐藏。
	</p>
</div>
