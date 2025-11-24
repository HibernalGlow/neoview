<script lang="ts">
	/**
	 * NeoView - Sidebar Management Panel Component
	 * 边栏管理面板 - 类似Notion的三区域拖拽布局管理
	 */
	import {
		panels,
		movePanelToLocation,
		togglePanelVisibility,
		type PanelLocation,
		type PanelTabType
	} from '$lib/stores';
	import { get } from 'svelte/store';
	import { settingsManager, type NeoViewSettings } from '$lib/settings/settingsManager';

	// 边栏管理状态
	let sidebarManagement = $state({
		// 可用面板列表
		availablePanels: [
			{ id: 'fileBrowser', name: '文件浏览器', icon: '📁', category: '导航' },
			{ id: 'bookmark', name: '书签', icon: '🔖', category: '导航' },
			{ id: 'thumbnail', name: '缩略图', icon: '🖼️', category: '导航' },
			{ id: 'metadata', name: '元数据', icon: '📋', category: '信息' },
			{ id: 'history', name: '历史记录', icon: '📚', category: '导航' },
			{ id: 'search', name: '搜索', icon: '🔍', category: '工具' },
			{ id: 'filter', name: '过滤器', icon: '🎛️', category: '工具' },
			{ id: 'tools', name: '工具', icon: '🔧', category: '工具' }
		],
		// 等待区面板
		waitingArea: [] as Array<{ id: string, name: string, icon: string, category: string }>,
		// 左侧栏面板
		leftSidebar: [] as Array<{ id: string, name: string, icon: string, category: string }>,
		// 右侧栏面板
		rightSidebar: [] as Array<{ id: string, name: string, icon: string, category: string }>,
	});

	let settings = $state<NeoViewSettings>(settingsManager.getSettings());
	let hoverAreas = $derived(settings.panels.hoverAreas);

	// 拖拽状态
	type AreaId = 'waitingArea' | 'leftSidebar' | 'rightSidebar';
	let draggedPanel = $state<{ panel: any, source: AreaId } | null>(null);
	let dragOverArea = $state<AreaId | null>(null);
	let isPointerDragging = $state(false);
	let dragPreview = $state<{ x: number; y: number } | null>(null);

	// 面板 ID 映射到真实 PanelType（panels.svelte）
	const panelIdMap: Record<string, PanelTabType | null> = {
		fileBrowser: 'folder',
		history: 'history',
		bookmark: 'bookmark',
		thumbnail: 'thumbnail',
		metadata: 'info',
		// 下面这些暂时没有对应的真实 PanelType，只在管理界面中展示
		search: null,
		filter: null,
		tools: null
	};

	function applyPanelLayoutToStore(uiPanelId: string, targetArea: AreaId) {
		const panelId = panelIdMap[uiPanelId] as PanelTabType | null | undefined;
		if (!panelId) return;

		const list = get(panels);
		const panelConfig = list.find((p) => p.id === panelId);
		if (!panelConfig) return;

		if (targetArea === 'waitingArea') {
			// 等待区：仅隐藏，不改变原来的 location
			if (panelConfig.visible) {
				togglePanelVisibility(panelId);
			}
			return;
		}

		const newLocation: PanelLocation = targetArea === 'leftSidebar' ? 'left' : 'right';

		if (panelConfig.location !== newLocation) {
			movePanelToLocation(panelId, newLocation);
		}
		if (!panelConfig.visible) {
			// 确保目标区域中的面板处于可见状态
			togglePanelVisibility(panelId);
		}
	}

	function syncPanelsStoreFromSidebarLayout() {
		const areas: { area: AreaId; list: Array<{ id: string }> }[] = [
			{ area: 'waitingArea', list: sidebarManagement.waitingArea },
			{ area: 'leftSidebar', list: sidebarManagement.leftSidebar },
			{ area: 'rightSidebar', list: sidebarManagement.rightSidebar }
		];

		for (const { area, list } of areas) {
			for (const panel of list) {
				applyPanelLayoutToStore(panel.id, area);
			}
		}
	}

	// 拖拽处理函数
	function handlePointerDown(event: PointerEvent, panel: any, source: AreaId) {
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

		// 从源区域移除
		if (source === 'waitingArea') {
			sidebarManagement.waitingArea = sidebarManagement.waitingArea.filter((p) => p.id !== panel.id);
		} else if (source === 'leftSidebar') {
			sidebarManagement.leftSidebar = sidebarManagement.leftSidebar.filter((p) => p.id !== panel.id);
		} else if (source === 'rightSidebar') {
			sidebarManagement.rightSidebar = sidebarManagement.rightSidebar.filter((p) => p.id !== panel.id);
		}

		// 添加到目标区域
		if (targetArea === 'waitingArea') {
			if (!sidebarManagement.waitingArea.find((p) => p.id === panel.id)) {
				sidebarManagement.waitingArea.push(panel);
			}
		} else if (targetArea === 'leftSidebar') {
			if (!sidebarManagement.leftSidebar.find((p) => p.id === panel.id)) {
				sidebarManagement.leftSidebar.push(panel);
			}
		} else if (targetArea === 'rightSidebar') {
			if (!sidebarManagement.rightSidebar.find((p) => p.id === panel.id)) {
				sidebarManagement.rightSidebar.push(panel);
			}
		}

		// 保存到localStorage
		saveSidebarLayout();
		// 同步到真实面板 Store
		applyPanelLayoutToStore(panel.id, targetArea);

		draggedPanel = null;

		isPointerDragging = false;
		dragOverArea = null;
		dragPreview = null;
	}

	// 保存布局到localStorage
	function saveSidebarLayout() {
		localStorage.setItem('neoview-sidebar-management', JSON.stringify({
			waitingArea: sidebarManagement.waitingArea,
			leftSidebar: sidebarManagement.leftSidebar,
			rightSidebar: sidebarManagement.rightSidebar
		}));
	}

	// 初始化面板到等待区
	function initializeSidebarPanels() {
		const savedPanels = localStorage.getItem('neoview-sidebar-management');
		if (savedPanels) {
			try {
				const saved = JSON.parse(savedPanels);
				sidebarManagement.waitingArea = saved.waitingArea || [];
				sidebarManagement.leftSidebar = saved.leftSidebar || [];
				sidebarManagement.rightSidebar = saved.rightSidebar || [];
			} catch (e) {
				console.error('Failed to load sidebar management:', e);
				// 默认将所有面板放入等待区
				sidebarManagement.waitingArea = [...sidebarManagement.availablePanels];
			}
		} else {
			// 默认将所有面板放入等待区
			sidebarManagement.waitingArea = [...sidebarManagement.availablePanels];
		}
	}

	// 重置布局
	function resetLayout() {
		if (confirm('确定要重置所有面板布局吗？')) {
			sidebarManagement.waitingArea = [...sidebarManagement.availablePanels];
			sidebarManagement.leftSidebar = [];
			sidebarManagement.rightSidebar = [];
			saveSidebarLayout();
			syncPanelsStoreFromSidebarLayout();
		}
	}

	// 初始化
	$effect(() => {
		initializeSidebarPanels();
		syncPanelsStoreFromSidebarLayout();
	});

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

	$effect(() => {
		settingsManager.addListener((next) => {
			settings = next;
		});
	});

	function updateHoverAreas(partial: Partial<NeoViewSettings['panels']['hoverAreas']>) {
		const next = {
			...hoverAreas,
			...partial
		};
		settingsManager.updateNestedSettings('panels', { hoverAreas: next });
	}
</script>

<div class="p-6 space-y-6">
	<div class="space-y-2">
		<h3 class="text-lg font-semibold">边栏管理</h3>
		<p class="text-sm text-muted-foreground">拖拽面板到不同区域来自定义您的界面布局</p>
	</div>

	<!-- 悬停触发区域设置 -->
	<div class="mt-6 grid grid-cols-2 gap-4 rounded-lg border bg-card/40 p-4">
		<div class="space-y-2">
			<h4 class="text-sm font-medium">顶部/底部触发高度</h4>
			<div class="space-y-2">
				<div>
					<label class="flex items-center justify-between text-xs text-muted-foreground">
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
					<label class="flex items-center justify-between text-xs text-muted-foreground">
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
					<label class="flex items-center justify-between text-xs text-muted-foreground">
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
					<label class="flex items-center justify-between text-xs text-muted-foreground">
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
			class="px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
			onclick={resetLayout}
		>
			重置布局
		</button>
	</div>

	<!-- 三栏布局 -->
	<div class="grid grid-cols-3 gap-4 min-h-[400px]">
		<!-- 等待区 -->
		<div 
			class="border-2 border-dashed rounded-lg p-4 {dragOverArea === 'waitingArea' ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}"
			onpointerenter={() => handleAreaPointerEnter('waitingArea')}
			onpointerleave={() => handleAreaPointerLeave('waitingArea')}
		>
			<h4 class="font-medium text-sm mb-3 text-center">等待区</h4>
			<div class="space-y-2 min-h-[300px]">
				{#each sidebarManagement.waitingArea as panel}
					<div 
						class="bg-card border rounded-md p-3 hover:bg-accent/50 transition-colors {isPointerDragging && draggedPanel && draggedPanel.panel.id === panel.id ? 'opacity-50' : ''}"
					>
						<div class="flex items-center gap-2">
							<!-- 拖拽手柄 -->
							<div 
								class="cursor-grab active:cursor-grabbing p-1 hover:bg-accent/50 rounded"
								onpointerdown={(e) => handlePointerDown(e, panel, 'waitingArea')}
							>
								<svg class="w-4 h-4 text-muted-foreground" fill="currentColor" viewBox="0 0 20 20">
									<path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
								</svg>
							</div>
							<span class="text-lg">{panel.icon}</span>
							<div>
								<div class="font-medium text-sm">{panel.name}</div>
								<div class="text-xs text-muted-foreground">{panel.category}</div>
							</div>
						</div>
					</div>
				{/each}
				{#if sidebarManagement.waitingArea.length === 0}
					<div class="text-center text-muted-foreground text-sm py-8">
						拖拽面板到这里
					</div>
				{/if}
			</div>
		</div>

		<!-- 左侧栏 -->
		<div 
			class="border-2 border-dashed rounded-lg p-4 {dragOverArea === 'leftSidebar' ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}"
			onpointerenter={() => handleAreaPointerEnter('leftSidebar')}
			onpointerleave={() => handleAreaPointerLeave('leftSidebar')}
		>
			<h4 class="font-medium text-sm mb-3 text-center">左侧栏</h4>
			<div class="space-y-2 min-h-[300px]">
				{#each sidebarManagement.leftSidebar as panel}
					<div 
						class="bg-card border rounded-md p-3 hover:bg-accent/50 transition-colors {isPointerDragging && draggedPanel && draggedPanel.panel.id === panel.id ? 'opacity-50' : ''}"
					>
						<div class="flex items-center gap-2">
							<!-- 拖拽手柄 -->
							<div 
								class="cursor-grab active:cursor-grabbing p-1 hover:bg-accent/50 rounded"
								onpointerdown={(e) => handlePointerDown(e, panel, 'leftSidebar')}
							>
								<svg class="w-4 h-4 text-muted-foreground" fill="currentColor" viewBox="0 0 20 20">
									<path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
								</svg>
							</div>
							<span class="text-lg">{panel.icon}</span>
							<div>
								<div class="font-medium text-sm">{panel.name}</div>
								<div class="text-xs text-muted-foreground">{panel.category}</div>
							</div>
						</div>
					</div>
				{/each}
				{#if sidebarManagement.leftSidebar.length === 0}
					<div class="text-center text-muted-foreground text-sm py-8">
						拖拽面板到这里
					</div>
				{/if}
			</div>
		</div>

		<!-- 右侧栏 -->
		<div 
			class="border-2 border-dashed rounded-lg p-4 {dragOverArea === 'rightSidebar' ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}"
			onpointerenter={() => handleAreaPointerEnter('rightSidebar')}
			onpointerleave={() => handleAreaPointerLeave('rightSidebar')}
		>
			<h4 class="font-medium text-sm mb-3 text-center">右侧栏</h4>
			<div class="space-y-2 min-h-[300px]">
				{#each sidebarManagement.rightSidebar as panel}
					<div 
						class="bg-card border rounded-md p-3 hover:bg-accent/50 transition-colors {isPointerDragging && draggedPanel && draggedPanel.panel.id === panel.id ? 'opacity-50' : ''}"
					>
						<div class="flex items-center gap-2">
							<!-- 拖拽手柄 -->
							<div 
								class="cursor-grab active:cursor-grabbing p-1 hover:bg-accent/50 rounded"
								onpointerdown={(e) => handlePointerDown(e, panel, 'rightSidebar')}
							>
								<svg class="w-4 h-4 text-muted-foreground" fill="currentColor" viewBox="0 0 20 20">
									<path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
								</svg>
							</div>
							<span class="text-lg">{panel.icon}</span>
							<div>
								<div class="font-medium text-sm">{panel.name}</div>
								<div class="text-xs text-muted-foreground">{panel.category}</div>
							</div>
						</div>
					</div>
				{/each}
				{#if sidebarManagement.rightSidebar.length === 0}
					<div class="text-center text-muted-foreground text-sm py-8">
						拖拽面板到这里
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- 说明信息 -->
	<div class="mt-6 p-4 bg-muted/30 rounded-lg">
		<h4 class="font-medium text-sm mb-2">使用说明</h4>
		<ul class="text-sm text-muted-foreground space-y-1">
			<li>• 拖拽面板到不同区域来调整布局</li>
			<li>• 等待区：存放未使用的面板</li>
			<li>• 左侧栏/右侧栏：显示激活的面板</li>
			<li>• 布局会自动保存</li>
		</ul>
	</div>

	{#if isPointerDragging && dragPreview && draggedPanel}
		<div
			class="pointer-events-none fixed z-50"
			style={`left: ${dragPreview.x}px; top: ${dragPreview.y}px;`}
		>
			<div class="bg-card border rounded-md px-3 py-2 shadow-lg flex items-center gap-2 opacity-90">
				<span class="text-lg">{draggedPanel.panel.icon}</span>
				<div>
					<div class="text-sm font-medium">{draggedPanel.panel.name}</div>
					<div class="text-xs text-muted-foreground">{draggedPanel.panel.category}</div>
				</div>
			</div>
		</div>
	{/if}
</div>