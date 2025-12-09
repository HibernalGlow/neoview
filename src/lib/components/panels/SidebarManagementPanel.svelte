<script lang="ts">
	/**
	 * NeoView - Sidebar Management Panel Component
	 * 边栏管理面板 - 三区域拖拽布局管理
	 * 完全使用 sidebarConfig store 动态管理面板配置
	 */
	import {
		sidebarConfigStore,
		sidebarLeftPanels,
		sidebarRightPanels,
		sidebarHiddenPanels,
		type PanelId,
		type PanelConfig
	} from '$lib/stores/sidebarConfig.svelte';
	import { onMount } from 'svelte';
	import { settingsManager, type NeoViewSettings } from '$lib/settings/settingsManager';
	import { emit } from '@tauri-apps/api/event';
	import { confirm } from '$lib/stores/confirmDialog.svelte';

	let settings = $state<NeoViewSettings>(settingsManager.getSettings());
	let hoverAreas = $derived(settings.panels.hoverAreas);
	let autoHideTiming = $derived(settings.panels.autoHideTiming);

	// 从 store 动态获取面板列表
	let leftPanels = $derived($sidebarLeftPanels);
	let rightPanels = $derived($sidebarRightPanels);
	let hiddenPanels = $derived($sidebarHiddenPanels);

	// 拖拽状态
	type AreaId = 'waitingArea' | 'leftSidebar' | 'rightSidebar';
	let draggedPanel = $state<{ panel: PanelConfig; source: AreaId } | null>(null);
	let dragOverArea = $state<AreaId | null>(null);
	let isPointerDragging = $state(false);
	let dragPreview = $state<{ x: number; y: number } | null>(null);

	// 拖拽处理函数
	function handlePointerDown(event: PointerEvent, panel: PanelConfig, source: AreaId) {
		event.preventDefault();
		draggedPanel = { panel, source };
		isPointerDragging = true;
		dragPreview = { x: event.clientX + 12, y: event.clientY + 12 };
	}

	function handleAreaPointerEnter(targetArea: AreaId) {
		if (!isPointerDragging) return;
		dragOverArea = targetArea;
	}

	function handleAreaPointerLeave(targetArea: AreaId) {
		if (!isPointerDragging) return;
		if (dragOverArea === targetArea) {
			dragOverArea = null;
		}
	}

	function finalizeDrop() {
		if (!isPointerDragging || !draggedPanel || !dragOverArea) {
			draggedPanel = null;
			isPointerDragging = false;
			dragOverArea = null;
			dragPreview = null;
			return;
		}

		const { panel, source } = draggedPanel;
		const targetArea = dragOverArea;

		// 如果目标区域和源区域相同，不做任何操作
		if (source === targetArea) {
			draggedPanel = null;
			isPointerDragging = false;
			dragOverArea = null;
			dragPreview = null;
			return;
		}

		// 直接更新 store - 使用 movePanel 方法
		if (targetArea === 'waitingArea') {
			// 隐藏面板
			if (panel.canHide) {
				sidebarConfigStore.setPanelVisible(panel.id, false);
			}
		} else if (targetArea === 'leftSidebar') {
			// 移动到左侧栏
			sidebarConfigStore.setPanelVisible(panel.id, true);
			sidebarConfigStore.movePanel(panel.id, 999, 'left'); // 放到最后
		} else if (targetArea === 'rightSidebar') {
			// 移动到右侧栏
			sidebarConfigStore.setPanelVisible(panel.id, true);
			sidebarConfigStore.movePanel(panel.id, 999, 'right'); // 放到最后
		}

		draggedPanel = null;
		isPointerDragging = false;
		dragOverArea = null;
		dragPreview = null;
	}

	// 保存提示消息
	let saveMessage = $state<string | null>(null);

	// 应用布局（通知主窗口重新加载）
	async function applyLayout() {
		try {
			// 发送事件让主窗口重新加载
			await emit('reload-main-window');
			saveMessage = '✓ 布局已应用';
			setTimeout(() => {
				saveMessage = null;
			}, 2000);
		} catch (err) {
			console.error('应用布局失败:', err);
			saveMessage = '❌ 应用失败';
			setTimeout(() => {
				saveMessage = null;
			}, 2000);
		}
	}

	// 重置布局
	async function resetLayout() {
		const confirmed = await confirm({
			title: '确认重置',
			description: '确定要重置所有面板布局吗？',
			confirmText: '重置',
			cancelText: '取消',
			variant: 'warning'
		});
		if (confirmed) {
			sidebarConfigStore.resetPanels();
			saveMessage = '✓ 布局已重置';
			setTimeout(() => {
				saveMessage = null;
			}, 2000);
		}
	}

	// 移动面板顺序
	function movePanelUp(panel: PanelConfig, panels: PanelConfig[]) {
		const currentIndex = panels.findIndex(p => p.id === panel.id);
		if (currentIndex <= 0) return;
		
		const prevPanel = panels[currentIndex - 1];
		// 交换顺序
		sidebarConfigStore.setPanelOrder(panel.id, prevPanel.order);
		sidebarConfigStore.setPanelOrder(prevPanel.id, panel.order);
	}

	function movePanelDown(panel: PanelConfig, panels: PanelConfig[]) {
		const currentIndex = panels.findIndex(p => p.id === panel.id);
		if (currentIndex < 0 || currentIndex >= panels.length - 1) return;
		
		const nextPanel = panels[currentIndex + 1];
		// 交换顺序
		sidebarConfigStore.setPanelOrder(panel.id, nextPanel.order);
		sidebarConfigStore.setPanelOrder(nextPanel.id, panel.order);
	}

	$effect(() => {
		function handleWindowPointerUp() {
			if (!isPointerDragging) return;
			finalizeDrop();
		}
		window.addEventListener('pointerup', handleWindowPointerUp);
		return () => {
			window.removeEventListener('pointerup', handleWindowPointerUp);
		};
	});

	$effect(() => {
		if (!isPointerDragging) return;
		function handleWindowPointerMove(e: PointerEvent) {
			dragPreview = { x: e.clientX + 12, y: e.clientY + 12 };
		}
		window.addEventListener('pointermove', handleWindowPointerMove);
		return () => {
			window.removeEventListener('pointermove', handleWindowPointerMove);
		};
	});

	const handleSettingsUpdate = (next: NeoViewSettings) => {
		settings = next;
	};

	onMount(() => {
		settingsManager.addListener(handleSettingsUpdate);
		return () => {
			settingsManager.removeListener(handleSettingsUpdate);
		};
	});

	function updateHoverAreas(partial: Partial<NeoViewSettings['panels']['hoverAreas']>) {
		settingsManager.updateNestedSettings('panels', { hoverAreas: { ...hoverAreas, ...partial } });
	}

	function updateAutoHideTiming(partial: Partial<NeoViewSettings['panels']['autoHideTiming']>) {
		settingsManager.updateNestedSettings('panels', { autoHideTiming: { ...autoHideTiming, ...partial } });
	}

	</script>

<div class="space-y-6 p-6">
	<div class="space-y-2">
		<h3 class="text-lg font-semibold">边栏管理</h3>
		<p class="text-muted-foreground text-sm">拖拽面板到不同区域来自定义您的界面布局</p>
	</div>

	<!-- 自动隐藏时间设置 -->
	<div class="mt-4 grid grid-cols-2 gap-4 rounded-lg border bg-card/40 p-4">
		<div class="space-y-2">
			<h4 class="text-sm font-medium">显示延迟（秒）</h4>
			<input
				type="number"
				min="0"
				step="0.1"
				value={autoHideTiming.showDelaySec}
				oninput={(e) => updateAutoHideTiming({ showDelaySec: Number((e.currentTarget as HTMLInputElement).value) })}
				class="w-24 rounded border px-2 py-1 text-sm"
			/>
		</div>
		<div class="space-y-2">
			<h4 class="text-sm font-medium">隐藏延迟（秒）</h4>
			<input
				type="number"
				min="0"
				step="0.1"
				value={autoHideTiming.hideDelaySec}
				oninput={(e) => updateAutoHideTiming({ hideDelaySec: Number((e.currentTarget as HTMLInputElement).value) })}
				class="w-24 rounded border px-2 py-1 text-sm"
			/>
		</div>
	</div>

	<!-- 悬停触发区域设置 -->
	<div class="mt-4 grid grid-cols-2 gap-4 rounded-lg border bg-card/40 p-4">
		<div class="space-y-2">
			<h4 class="text-sm font-medium">顶部/底部触发高度</h4>
			<div class="space-y-2">
				<div>
					<label class="text-muted-foreground flex items-center justify-between text-xs">
						<span>顶部高度 (px)</span>
						<span class="font-mono text-[11px]">{hoverAreas.topTriggerHeight}</span>
					</label>
					<input
						type="range"
						min="2"
						max="32"
						step="1"
						value={hoverAreas.topTriggerHeight}
						oninput={(event) =>
							updateHoverAreas({
								topTriggerHeight: Number((event.currentTarget as HTMLInputElement).value)
							})}
						class="mt-1 w-full"
					/>
				</div>
				<div>
					<label class="text-muted-foreground flex items-center justify-between text-xs">
						<span>底部高度 (px)</span>
						<span class="font-mono text-[11px]">{hoverAreas.bottomTriggerHeight}</span>
					</label>
					<input
						type="range"
						min="2"
						max="32"
						step="1"
						value={hoverAreas.bottomTriggerHeight}
						oninput={(event) =>
							updateHoverAreas({
								bottomTriggerHeight: Number((event.currentTarget as HTMLInputElement).value)
							})}
						class="mt-1 w-full"
					/>
				</div>
			</div>
		</div>
		<div class="space-y-2">
			<h4 class="text-sm font-medium">左右侧边栏触发宽度</h4>
			<div class="space-y-2">
				<div>
					<label class="text-muted-foreground flex items-center justify-between text-xs">
						<span>左侧宽度 (px)</span>
						<span class="font-mono text-[11px]">{hoverAreas.leftTriggerWidth}</span>
					</label>
					<input
						type="range"
						min="4"
						max="48"
						step="1"
						value={hoverAreas.leftTriggerWidth}
						oninput={(event) =>
							updateHoverAreas({
								leftTriggerWidth: Number((event.currentTarget as HTMLInputElement).value)
							})}
						class="mt-1 w-full"
					/>
				</div>
				<div>
					<label class="text-muted-foreground flex items-center justify-between text-xs">
						<span>右侧宽度 (px)</span>
						<span class="font-mono text-[11px]">{hoverAreas.rightTriggerWidth}</span>
					</label>
					<input
						type="range"
						min="4"
						max="48"
						step="1"
						value={hoverAreas.rightTriggerWidth}
						oninput={(event) =>
							updateHoverAreas({
								rightTriggerWidth: Number((event.currentTarget as HTMLInputElement).value)
							})}
						class="mt-1 w-full"
					/>
				</div>
			</div>
		</div>
	</div>

	<!-- 操作按钮 -->
	<div class="flex items-center gap-2">
		<button
			type="button"
			class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm transition-colors"
			onclick={applyLayout}
		>
			应用布局
		</button>
		<button
			type="button"
			class="bg-secondary hover:bg-secondary/80 rounded-md px-3 py-1.5 text-sm transition-colors"
			onclick={resetLayout}
		>
			重置布局
		</button>
		{#if saveMessage}
			<span class="text-sm text-green-600">{saveMessage}</span>
		{/if}
	</div>

	<!-- 三栏布局 -->
	<div class="grid min-h-[300px] grid-cols-3 gap-4">
		<!-- 等待区 -->
		<div
			class="rounded-lg border-2 border-dashed p-4 {dragOverArea === 'waitingArea' ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}"
			onpointerenter={() => handleAreaPointerEnter('waitingArea')}
			onpointerleave={() => handleAreaPointerLeave('waitingArea')}
		>
			<h4 class="mb-3 text-center text-sm font-medium">等待区（隐藏）</h4>
			<div class="min-h-[200px] space-y-2">
				{#each hiddenPanels as panel (panel.id)}
					{@const Icon = panel.icon}
					<div
						class="bg-card rounded-md border p-3 transition-colors hover:bg-accent/50 {isPointerDragging && draggedPanel?.panel.id === panel.id ? 'opacity-50' : ''}"
					>
						<div class="flex items-center gap-2">
							<div
								class="cursor-grab rounded p-1 hover:bg-accent/50 active:cursor-grabbing"
								onpointerdown={(e) => handlePointerDown(e, panel, 'waitingArea')}
							>
								<svg class="text-muted-foreground h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
									<path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
								</svg>
							</div>
							<Icon class="h-4 w-4" />
							<span class="text-sm font-medium">{panel.title}</span>
						</div>
					</div>
				{/each}
				{#if hiddenPanels.length === 0}
					<div class="text-muted-foreground py-8 text-center text-sm">拖拽面板到这里隐藏</div>
				{/if}
			</div>
		</div>

		<!-- 左侧栏 -->
		<div
			class="rounded-lg border-2 border-dashed p-4 {dragOverArea === 'leftSidebar' ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}"
			onpointerenter={() => handleAreaPointerEnter('leftSidebar')}
			onpointerleave={() => handleAreaPointerLeave('leftSidebar')}
		>
			<h4 class="mb-3 text-center text-sm font-medium">左侧栏</h4>
			<div class="min-h-[200px] space-y-2">
				{#each leftPanels as panel, index (panel.id)}
					{@const Icon = panel.icon}
					<div
						class="bg-card rounded-md border p-3 transition-colors hover:bg-accent/50 {isPointerDragging && draggedPanel?.panel.id === panel.id ? 'opacity-50' : ''}"
					>
						<div class="flex items-center gap-2">
							<div
								class="cursor-grab rounded p-1 hover:bg-accent/50 active:cursor-grabbing"
								onpointerdown={(e) => handlePointerDown(e, panel, 'leftSidebar')}
							>
								<svg class="text-muted-foreground h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
									<path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
								</svg>
							</div>
							<Icon class="h-4 w-4" />
							<span class="flex-1 text-sm font-medium">{panel.title}</span>
							<!-- 上下箭头 -->
							<div class="flex flex-col gap-0.5">
								<button
									type="button"
									class="rounded p-0.5 hover:bg-accent/50 disabled:opacity-30"
									disabled={index === 0}
									onclick={() => movePanelUp(panel, leftPanels)}
									title="上移"
								>
									<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
									</svg>
								</button>
								<button
									type="button"
									class="rounded p-0.5 hover:bg-accent/50 disabled:opacity-30"
									disabled={index === leftPanels.length - 1}
									onclick={() => movePanelDown(panel, leftPanels)}
									title="下移"
								>
									<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
									</svg>
								</button>
							</div>
						</div>
					</div>
				{/each}
				{#if leftPanels.length === 0}
					<div class="text-muted-foreground py-8 text-center text-sm">拖拽面板到这里</div>
				{/if}
			</div>
		</div>

		<!-- 右侧栏 -->
		<div
			class="rounded-lg border-2 border-dashed p-4 {dragOverArea === 'rightSidebar' ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}"
			onpointerenter={() => handleAreaPointerEnter('rightSidebar')}
			onpointerleave={() => handleAreaPointerLeave('rightSidebar')}
		>
			<h4 class="mb-3 text-center text-sm font-medium">右侧栏</h4>
			<div class="min-h-[200px] space-y-2">
				{#each rightPanels as panel, index (panel.id)}
					{@const Icon = panel.icon}
					<div
						class="bg-card rounded-md border p-3 transition-colors hover:bg-accent/50 {isPointerDragging && draggedPanel?.panel.id === panel.id ? 'opacity-50' : ''}"
					>
						<div class="flex items-center gap-2">
							<div
								class="cursor-grab rounded p-1 hover:bg-accent/50 active:cursor-grabbing"
								onpointerdown={(e) => handlePointerDown(e, panel, 'rightSidebar')}
							>
								<svg class="text-muted-foreground h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
									<path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
								</svg>
							</div>
							<Icon class="h-4 w-4" />
							<span class="flex-1 text-sm font-medium">{panel.title}</span>
							<!-- 上下箭头 -->
							<div class="flex flex-col gap-0.5">
								<button
									type="button"
									class="rounded p-0.5 hover:bg-accent/50 disabled:opacity-30"
									disabled={index === 0}
									onclick={() => movePanelUp(panel, rightPanels)}
									title="上移"
								>
									<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
									</svg>
								</button>
								<button
									type="button"
									class="rounded p-0.5 hover:bg-accent/50 disabled:opacity-30"
									disabled={index === rightPanels.length - 1}
									onclick={() => movePanelDown(panel, rightPanels)}
									title="下移"
								>
									<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
									</svg>
								</button>
							</div>
						</div>
					</div>
				{/each}
				{#if rightPanels.length === 0}
					<div class="text-muted-foreground py-8 text-center text-sm">拖拽面板到这里</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- 拖拽预览 -->
	{#if isPointerDragging && dragPreview && draggedPanel}
		{@const DragIcon = draggedPanel.panel.icon}
		<div class="pointer-events-none fixed z-50" style="left: {dragPreview.x}px; top: {dragPreview.y}px;">
			<div class="bg-card flex items-center gap-2 rounded-md border px-3 py-2 opacity-90 shadow-lg">
				<DragIcon class="h-4 w-4" />
				<span class="text-sm font-medium">{draggedPanel.panel.title}</span>
			</div>
		</div>
	{/if}
</div>
