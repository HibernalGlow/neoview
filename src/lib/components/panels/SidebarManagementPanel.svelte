<script lang="ts">
	/**
	 * NeoView - Sidebar Management Panel Component
	 * 边栏管理面板 - 现代化的列表管理界面
	 * 完全使用 sidebarConfig store 动态管理面板配置
	 */
	import {
		sidebarConfigStore,
		sidebarLeftPanels,
		sidebarRightPanels,
		sidebarHiddenPanels,
		leftSidebarHeight,
		leftSidebarCustomHeight,
		leftSidebarVerticalAlign,
		rightSidebarHeight,
		rightSidebarCustomHeight,
		rightSidebarVerticalAlign,
		SIDEBAR_HEIGHT_PRESETS,
		type PanelId,
		type PanelConfig,
		type SidebarHeightPreset,
		type SidebarVerticalAlign
	} from '$lib/stores/sidebarConfig.svelte';
	import { onMount } from 'svelte';
	import { settingsManager, type NeoViewSettings } from '$lib/settings/settingsManager';
	import { emit } from '@tauri-apps/api/event';
	import { confirm } from '$lib/stores/confirmDialog.svelte';
	import { 
		LayoutGrid, Settings2, PanelTop, PanelBottom, PanelLeft, PanelRight, 
		EyeOff, Columns3, Navigation, Wrench, Folder, Bookmark, History, 
		RotateCcw, ListChecks, GripVertical, MoreHorizontal, ArrowUp, ArrowDown
	} from '@lucide/svelte';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import {
		folderTabBarLayout,
		folderBreadcrumbPosition,
		folderToolbarPosition,
		bookmarkTabBarLayout,
		bookmarkBreadcrumbPosition,
		bookmarkToolbarPosition,
		historyTabBarLayout,
		historyBreadcrumbPosition,
		historyToolbarPosition,
		folderTabActions,
		type TabBarLayout,
		type BreadcrumbPosition,
		type ToolbarPosition,
		type PanelMode
	} from '$lib/components/panels/folderPanel/stores/folderTabStore';

	import ManagementListView from '$lib/components/settings/ManagementListView.svelte';
	import ManagementItemCard from '$lib/components/settings/ManagementItemCard.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	let activeTab = $state('layout');
	let searchQuery = $state('');
	let viewMode = $state<'grid' | 'list'>('grid');

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

		if (source === targetArea) {
			draggedPanel = null;
			isPointerDragging = false;
			dragOverArea = null;
			dragPreview = null;
			return;
		}

		if (targetArea === 'waitingArea') {
			if (panel.canHide) {
				sidebarConfigStore.setPanelVisible(panel.id, false);
			}
		} else if (targetArea === 'leftSidebar') {
			sidebarConfigStore.setPanelVisible(panel.id, true);
			sidebarConfigStore.movePanel(panel.id, 999, 'left');
		} else if (targetArea === 'rightSidebar') {
			sidebarConfigStore.setPanelVisible(panel.id, true);
			sidebarConfigStore.movePanel(panel.id, 999, 'right');
		}

		draggedPanel = null;
		isPointerDragging = false;
		dragOverArea = null;
		dragPreview = null;
	}

	// 保存提示消息
	let saveMessage = $state<string | null>(null);

	async function applyLayout() {
		try {
			await emit('reload-main-window');
			saveMessage = '✓ 布局已应用';
			setTimeout(() => { saveMessage = null; }, 2000);
		} catch (err) {
			console.error('应用布局失败:', err);
			saveMessage = '❌ 应用失败';
			setTimeout(() => { saveMessage = null; }, 2000);
		}
	}

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
			setTimeout(() => { saveMessage = null; }, 2000);
		}
	}

	function movePanelUp(panel: PanelConfig, panels: PanelConfig[]) {
		const currentIndex = panels.findIndex(p => p.id === panel.id);
		if (currentIndex <= 0) return;
		const prevPanel = panels[currentIndex - 1];
		sidebarConfigStore.setPanelOrder(panel.id, prevPanel.order);
		sidebarConfigStore.setPanelOrder(prevPanel.id, panel.order);
	}

	function movePanelDown(panel: PanelConfig, panels: PanelConfig[]) {
		const currentIndex = panels.findIndex(p => p.id === panel.id);
		if (currentIndex < 0 || currentIndex >= panels.length - 1) return;
		const nextPanel = panels[currentIndex + 1];
		sidebarConfigStore.setPanelOrder(panel.id, nextPanel.order);
		sidebarConfigStore.setPanelOrder(nextPanel.id, panel.order);
	}

	$effect(() => {
		function handleWindowPointerUp() {
			if (!isPointerDragging) return;
			finalizeDrop();
		}
		window.addEventListener('pointerup', handleWindowPointerUp);
		return () => { window.removeEventListener('pointerup', handleWindowPointerUp); };
	});

	$effect(() => {
		if (!isPointerDragging) return;
		function handleWindowPointerMove(e: PointerEvent) {
			dragPreview = { x: e.clientX + 12, y: e.clientY + 12 };
		}
		window.addEventListener('pointermove', handleWindowPointerMove);
		return () => { window.removeEventListener('pointermove', handleWindowPointerMove); };
	});

	const handleSettingsUpdate = (next: NeoViewSettings) => {
		settings = next;
	};

	onMount(() => {
		settingsManager.addListener(handleSettingsUpdate);
		return () => { settingsManager.removeListener(handleSettingsUpdate); };
	});

	function updateAutoHideTiming(partial: Partial<NeoViewSettings['panels']['autoHideTiming']>) {
		settingsManager.updateNestedSettings('panels', { autoHideTiming: { ...autoHideTiming, ...partial } });
	}

	// 过滤后的面板数据
	const filteredPanels = $derived.by(() => {
		const query = searchQuery.toLowerCase().trim();
		const all = [
			...leftPanels.map(p => ({ ...p, side: 'left' as const })),
			...rightPanels.map(p => ({ ...p, side: 'right' as const })),
			...hiddenPanels.map(p => ({ ...p, side: 'hidden' as const }))
		];
		
		if (!query) return all;
		return all.filter(p => 
			p.title.toLowerCase().includes(query) || 
			p.id.toLowerCase().includes(query)
		);
	});

	function getPanelStatus(side: 'left' | 'right' | 'hidden') {
		if (side === 'left') return '左侧栏';
		if (side === 'right') return '右侧栏';
		return '已隐藏';
	}

	function getPanelStatusColor(side: 'left' | 'right' | 'hidden') {
		if (side === 'left') return 'default';
		if (side === 'right') return 'secondary';
		return 'outline';
	}

	function assignPanel(panelId: PanelId, side: 'left' | 'right' | 'hidden') {
		if (side === 'hidden') {
			sidebarConfigStore.setPanelVisible(panelId, false);
		} else {
			sidebarConfigStore.setPanelVisible(panelId, true);
			sidebarConfigStore.movePanel(panelId, 999, side);
		}
	}
</script>

<div class="h-full flex flex-col overflow-hidden bg-background">
	<Tabs.Root bind:value={activeTab} class="flex-1 flex flex-col overflow-hidden">
		<div class="px-6 pt-6 bg-background/80 backdrop-blur-md z-10 border-b pb-4">
			<Tabs.List class="grid w-full grid-cols-2 h-12 rounded-2xl p-1 bg-muted/30">
				<Tabs.Trigger value="layout" class="gap-2 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm">
					<LayoutGrid class="h-4 w-4" />
					布局管理
				</Tabs.Trigger>
				<Tabs.Trigger value="settings" class="gap-2 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm">
					<Settings2 class="h-4 w-4" />
					高级设置
				</Tabs.Trigger>
			</Tabs.List>
		</div>

		<Tabs.Content value="layout" class="flex-1 overflow-auto mt-0 p-6 focus-visible:outline-none">
			<ManagementListView
				title="边栏布局"
				description="管理左右边栏的面板位置、顺序和可见性。"
				bind:searchQuery
				onSearchChange={(val) => searchQuery = val}
				{viewMode}
				onViewModeChange={(mode) => viewMode = mode}
			>
				{#snippet actions()}
					<div class="flex items-center gap-2">
						{#if saveMessage}
							<span class="text-xs text-green-600 font-medium animate-in fade-in slide-in-from-right-2">{saveMessage}</span>
						{/if}
						<Button variant="outline" size="sm" onclick={resetLayout} class="h-10 rounded-xl gap-2">
							<RotateCcw class="h-4 w-4" />
							重置
						</Button>
						<Button variant="default" size="sm" onclick={applyLayout} class="h-10 rounded-xl gap-2 shadow-sm">
							<ListChecks class="h-4 w-4" />
							应用面板
						</Button>
					</div>
				{/snippet}

				{#each filteredPanels as panel, index (panel.id)}
					<ManagementItemCard
						id={panel.id}
						title={panel.title}
						icon={panel.icon}
						subtitle={`ID: ${panel.id}`}
						status={getPanelStatus(panel.side)}
						statusColor={getPanelStatusColor(panel.side)}
						active={isPointerDragging && draggedPanel?.panel.id === panel.id}
						isFirst={index === 0}
						isLast={index === filteredPanels.length - 1}
						onMoveUp={() => {
							const list = panel.side === 'left' ? leftPanels : panel.side === 'right' ? rightPanels : hiddenPanels;
							movePanelUp(panel, list);
						}}
						onMoveDown={() => {
							const list = panel.side === 'left' ? leftPanels : panel.side === 'right' ? rightPanels : hiddenPanels;
							movePanelDown(panel, list);
						}}
						onToggleVisible={() => {
							if (panel.canHide) {
								sidebarConfigStore.setPanelVisible(panel.id, panel.side === 'hidden');
							}
						}}
						onPointerDown={(e) => handlePointerDown(e, panel, panel.side === 'left' ? 'leftSidebar' : panel.side === 'right' ? 'rightSidebar' : 'waitingArea')}
					>
						{#snippet assignOptions()}
							<DropdownMenu.Item onclick={() => assignPanel(panel.id, 'left')}>
								<PanelLeft class="mr-2 h-4 w-4" />
								<span>左侧栏</span>
							</DropdownMenu.Item>
							<DropdownMenu.Item onclick={() => assignPanel(panel.id, 'right')}>
								<PanelRight class="mr-2 h-4 w-4" />
								<span>右侧栏</span>
							</DropdownMenu.Item>
							{#if panel.canHide}
								<DropdownMenu.Item onclick={() => assignPanel(panel.id, 'hidden')}>
									<EyeOff class="mr-2 h-4 w-4" />
									<span>隐藏</span>
								</DropdownMenu.Item>
							{/if}
						{/snippet}
					</ManagementItemCard>
				{/each}

				{#if filteredPanels.length === 0}
					<div class="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground bg-muted/5 rounded-3xl border-2 border-dashed border-muted">
						<LayoutGrid class="h-12 w-12 opacity-20 mb-4" />
						<p>未找到匹配的面板</p>
					</div>
				{/if}
			</ManagementListView>
		</Tabs.Content>

		<Tabs.Content value="settings" class="flex-1 overflow-auto mt-0 p-6 focus-visible:outline-none">
			<div class="grid gap-6 max-w-4xl mx-auto">
				<!-- 文件面板组件设置 -->
				<div class="rounded-3xl border bg-card/40 p-6 space-y-6 shadow-sm">
					<div class="flex items-center gap-3">
						<div class="p-2.5 rounded-2xl bg-primary/10 text-primary">
							<Folder class="h-5 w-5" />
						</div>
						<div>
							<h4 class="font-bold text-lg">面板组件交互</h4>
							<p class="text-sm text-muted-foreground">精细化管理各面板内部件的显示布局</p>
						</div>
					</div>

					<div class="grid gap-6">
						<!-- 文件夹面板 -->
						<div class="p-4 rounded-2xl bg-muted/30 space-y-4">
							<div class="flex items-center gap-2">
								<Folder class="h-4 w-4 text-blue-500" />
								<span class="font-semibold">文件夹面板</span>
							</div>
							<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
								<div class="space-y-2">
									<label class="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Columns3 class="h-3 w-3" />标签栏</label>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button variant={$folderTabBarLayout === pos ? 'default' : 'outline'} size="sm" class="h-8 w-8 p-0 rounded-lg" onclick={() => folderTabActions.setTabBarLayout(pos as TabBarLayout, 'folder')}>
												{#if pos === 'none'}<EyeOff class="h-3.5 w-3.5" />{:else if pos === 'top'}<PanelTop class="h-3.5 w-3.5" />{:else if pos === 'bottom'}<PanelBottom class="h-3.5 w-3.5" />{:else if pos === 'left'}<PanelLeft class="h-3.5 w-3.5" />{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
								<div class="space-y-2">
									<label class="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Navigation class="h-3 w-3" />面包屑</label>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button variant={$folderBreadcrumbPosition === pos ? 'default' : 'outline'} size="sm" class="h-8 w-8 p-0 rounded-lg" onclick={() => folderTabActions.setBreadcrumbPosition(pos as BreadcrumbPosition, 'folder')}>
												{#if pos === 'none'}<EyeOff class="h-3.5 w-3.5" />{:else if pos === 'top'}<PanelTop class="h-3.5 w-3.5" />{:else if pos === 'bottom'}<PanelBottom class="h-3.5 w-3.5" />{:else if pos === 'left'}<PanelLeft class="h-3.5 w-3.5" />{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
								<div class="space-y-2">
									<label class="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Wrench class="h-3 w-3" />工具栏</label>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button variant={$folderToolbarPosition === pos ? 'default' : 'outline'} size="sm" class="h-8 w-8 p-0 rounded-lg" onclick={() => folderTabActions.setToolbarPosition(pos as ToolbarPosition, 'folder')}>
												{#if pos === 'none'}<EyeOff class="h-3.5 w-3.5" />{:else if pos === 'top'}<PanelTop class="h-3.5 w-3.5" />{:else if pos === 'bottom'}<PanelBottom class="h-3.5 w-3.5" />{:else if pos === 'left'}<PanelLeft class="h-3.5 w-3.5" />{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
							</div>
						</div>

						<!-- 书签面板 -->
						<div class="p-4 rounded-2xl bg-muted/30 space-y-4">
							<div class="flex items-center gap-2">
								<Bookmark class="h-4 w-4 text-amber-500" />
								<span class="font-semibold">书签面板</span>
							</div>
							<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
								<div class="space-y-2">
									<label class="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Columns3 class="h-3 w-3" />标签栏</label>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button variant={$bookmarkTabBarLayout === pos ? 'default' : 'outline'} size="sm" class="h-8 w-8 p-0 rounded-lg" onclick={() => folderTabActions.setTabBarLayout(pos as TabBarLayout, 'bookmark')}>
												{#if pos === 'none'}<EyeOff class="h-3.5 w-3.5" />{:else if pos === 'top'}<PanelTop class="h-3.5 w-3.5" />{:else if pos === 'bottom'}<PanelBottom class="h-3.5 w-3.5" />{:else if pos === 'left'}<PanelLeft class="h-3.5 w-3.5" />{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
								<div class="space-y-2">
									<label class="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Navigation class="h-3 w-3" />面包屑</label>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button variant={$bookmarkBreadcrumbPosition === pos ? 'default' : 'outline'} size="sm" class="h-8 w-8 p-0 rounded-lg" onclick={() => folderTabActions.setBreadcrumbPosition(pos as BreadcrumbPosition, 'bookmark')}>
												{#if pos === 'none'}<EyeOff class="h-3.5 w-3.5" />{:else if pos === 'top'}<PanelTop class="h-3.5 w-3.5" />{:else if pos === 'bottom'}<PanelBottom class="h-3.5 w-3.5" />{:else if pos === 'left'}<PanelLeft class="h-3.5 w-3.5" />{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
								<div class="space-y-2">
									<label class="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Wrench class="h-3 w-3" />工具栏</label>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button variant={$bookmarkToolbarPosition === pos ? 'default' : 'outline'} size="sm" class="h-8 w-8 p-0 rounded-lg" onclick={() => folderTabActions.setToolbarPosition(pos as ToolbarPosition, 'bookmark')}>
												{#if pos === 'none'}<EyeOff class="h-3.5 w-3.5" />{:else if pos === 'top'}<PanelTop class="h-3.5 w-3.5" />{:else if pos === 'bottom'}<PanelBottom class="h-3.5 w-3.5" />{:else if pos === 'left'}<PanelLeft class="h-3.5 w-3.5" />{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
							</div>
						</div>

						<!-- 历史面板 -->
						<div class="p-4 rounded-2xl bg-muted/30 space-y-4">
							<div class="flex items-center gap-2">
								<History class="h-4 w-4 text-green-500" />
								<span class="font-semibold">历史面板</span>
							</div>
							<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
								<div class="space-y-2">
									<label class="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Columns3 class="h-3 w-3" />标签栏</label>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button variant={$historyTabBarLayout === pos ? 'default' : 'outline'} size="sm" class="h-8 w-8 p-0 rounded-lg" onclick={() => folderTabActions.setTabBarLayout(pos as TabBarLayout, 'history')}>
												{#if pos === 'none'}<EyeOff class="h-3.5 w-3.5" />{:else if pos === 'top'}<PanelTop class="h-3.5 w-3.5" />{:else if pos === 'bottom'}<PanelBottom class="h-3.5 w-3.5" />{:else if pos === 'left'}<PanelLeft class="h-3.5 w-3.5" />{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
								<div class="space-y-2">
									<label class="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Navigation class="h-3 w-3" />面包屑</label>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button variant={$historyBreadcrumbPosition === pos ? 'default' : 'outline'} size="sm" class="h-8 w-8 p-0 rounded-lg" onclick={() => folderTabActions.setBreadcrumbPosition(pos as BreadcrumbPosition, 'history')}>
												{#if pos === 'none'}<EyeOff class="h-3.5 w-3.5" />{:else if pos === 'top'}<PanelTop class="h-3.5 w-3.5" />{:else if pos === 'bottom'}<PanelBottom class="h-3.5 w-3.5" />{:else if pos === 'left'}<PanelLeft class="h-3.5 w-3.5" />{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
								<div class="space-y-2">
									<label class="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Wrench class="h-3 w-3" />工具栏</label>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button variant={$historyToolbarPosition === pos ? 'default' : 'outline'} size="sm" class="h-8 w-8 p-0 rounded-lg" onclick={() => folderTabActions.setToolbarPosition(pos as ToolbarPosition, 'history')}>
												{#if pos === 'none'}<EyeOff class="h-3.5 w-3.5" />{:else if pos === 'top'}<PanelTop class="h-3.5 w-3.5" />{:else if pos === 'bottom'}<PanelBottom class="h-3.5 w-3.5" />{:else if pos === 'left'}<PanelLeft class="h-3.5 w-3.5" />{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- 延迟设置 -->
				<div class="rounded-3xl border bg-card/40 p-6 space-y-6 shadow-sm">
					<div class="flex items-center gap-3">
						<div class="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500">
							<History class="h-5 w-5" />
						</div>
						<div>
							<h4 class="font-bold text-lg">交互响应速度</h4>
							<p class="text-sm text-muted-foreground">调整边栏自动显示的延迟时间</p>
						</div>
					</div>
					<div class="grid grid-cols-2 gap-6">
						<div class="space-y-3">
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium">显示延迟</span>
								<span class="text-xs bg-muted px-2 py-1 rounded-lg">{autoHideTiming.showDelaySec}s</span>
							</div>
							<input type="range" min="0" max="2" step="0.1" value={autoHideTiming.showDelaySec} oninput={(e) => updateAutoHideTiming({ showDelaySec: Number(e.currentTarget.value) })} class="w-full accent-primary" />
						</div>
						<div class="space-y-3">
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium">隐藏延迟</span>
								<span class="text-xs bg-muted px-2 py-1 rounded-lg">{autoHideTiming.hideDelaySec}s</span>
							</div>
							<input type="range" min="0" max="5" step="0.1" value={autoHideTiming.hideDelaySec} oninput={(e) => updateAutoHideTiming({ hideDelaySec: Number(e.currentTarget.value) })} class="w-full accent-primary" />
						</div>
					</div>
				</div>
			</div>
		</Tabs.Content>
	</Tabs.Root>

	<!-- 拖拽预览 -->
	{#if isPointerDragging && dragPreview && draggedPanel}
		{@const DragIcon = draggedPanel.panel.icon}
		<div class="pointer-events-none fixed z-[100]" style="left: {dragPreview.x}px; top: {dragPreview.y}px;">
			<div class="bg-card/90 backdrop-blur-md flex items-center gap-3 rounded-2xl border border-primary/50 px-4 py-3 shadow-2xl animate-in zoom-in-95">
				<div class="bg-primary/10 p-1.5 rounded-lg text-primary">
					<DragIcon class="h-5 w-5" />
				</div>
				<span class="font-semibold text-sm">{draggedPanel.panel.title}</span>
				<div class="ml-2 bg-primary h-2 w-2 rounded-full animate-pulse"></div>
			</div>
		</div>
	{/if}
</div>
