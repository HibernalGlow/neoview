<script lang="ts">
	/**
	 * NeoView - Sidebar Management Panel Component
	 * 边栏管理面板 - 现代化的表格管理界面
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
	import { onMount, type Component } from 'svelte';
	import { settingsManager, type NeoViewSettings } from '$lib/settings/settingsManager';
	import { emit } from '@tauri-apps/api/event';
	import { confirm } from '$lib/stores/confirmDialog.svelte';
	import {
		LayoutGrid,
		Settings2,
		PanelTop,
		PanelBottom,
		PanelLeft,
		PanelRight,
		EyeOff,
		Columns3,
		Navigation,
		Wrench,
		Folder,
		Bookmark,
		History,
		RotateCcw,
		ListChecks,
		GripVertical,
		MoreHorizontal,
		ArrowUp,
		ArrowDown,
		Search,
		MapPin,
		Eye,
		EyeClosed,
		Filter
	} from '@lucide/svelte';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { cn } from '$lib/utils';
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

	let activeTab = $state('layout');
	let searchQuery = $state('');
	// 分组标签页：默认加载左侧栏
	let activeLayoutGroup = $state<'all' | 'left' | 'right' | 'hidden'>('left');
	// 从 store 动态获取面板列表
	let leftPanels = $derived($sidebarLeftPanels);
	let rightPanels = $derived($sidebarRightPanels);
	let hiddenPanels = $derived($sidebarHiddenPanels);

	let settings = $state<NeoViewSettings>(settingsManager.getSettings());
	let hoverAreas = $derived(settings.panels.hoverAreas);
	let autoHideTiming = $derived(settings.panels.autoHideTiming);

	// 动态分组列表
	const layoutGroups = $derived([
		{ id: 'all' as const, title: '全部', icon: LayoutGrid, count: leftPanels.length + rightPanels.length + hiddenPanels.length },
		{ id: 'left' as const, title: '左侧栏', icon: PanelLeft, count: leftPanels.length },
		{ id: 'right' as const, title: '右侧栏', icon: PanelRight, count: rightPanels.length },
		{ id: 'hidden' as const, title: '已隐藏', icon: EyeOff, count: hiddenPanels.length }
	]);

	// --- 自定义指针拖拽逻辑 (Pointer-based DnD) ---
	let dragId = $state<string | null>(null);
	let dropTargetPanelId = $state<string | null>(null);
	let startY = $state(0);
	let currentDeltaY = $state(0);
	let dragIndex = $state(-1); // 拖拽行在当前 filteredPanelsForGroup 中的索引

	function handlePointerDown(event: PointerEvent, panel: PanelConfig, index: number) {
		// 仅允许主键点击（左键）
		if (event.button !== 0) return;
		
		// 如果点击的是按钮或其他交互元素，不触发拖拽
		const target = event.target as HTMLElement;
		if (target.closest('button') || target.closest('a')) return;

		console.log('Pointer down for drag:', panel.id);
		
		dragId = panel.id;
		startY = event.clientY;
		currentDeltaY = 0;
		dragIndex = index;
		dropTargetPanelId = null;

		// 捕获指针，确保移出元素后依然能接收 move 事件
		const row = event.currentTarget as HTMLElement;
		row.setPointerCapture(event.pointerId);
	}

	function handlePointerMove(event: PointerEvent) {
		if (!dragId) return;
		currentDeltaY = event.clientY - startY;

		// 极其稳健的落点检测：直接查找鼠标下的行元素
		const element = document.elementFromPoint(event.clientX, event.clientY);
		const row = element?.closest('[data-drag-id]') as HTMLElement;
		
		if (row && row.dataset.dragId && row.dataset.dragId !== dragId) {
			const targetId = row.dataset.dragId;
			const targetPanel = filteredPanelsForGroup.find(p => p.id === targetId);
			
			// 仅在同侧内预览（跨侧拖拽通过勋章或下拉菜单处理，此处仅处理排序）
			if (targetPanel && targetPanel.side === filteredPanelsForGroup[dragIndex].side) {
				dropTargetPanelId = targetId;
			} else {
				dropTargetPanelId = null;
			}
		} else {
			dropTargetPanelId = null;
		}
	}

	function handlePointerUp(event: PointerEvent) {
		if (!dragId) return;

		const sourceId = dragId;
		const panels = filteredPanelsForGroup;
		
		if (dropTargetPanelId && dropTargetPanelId !== sourceId) {
			const sourceIdx = panels.findIndex(p => p.id === sourceId);
			const targetIdx = panels.findIndex(p => p.id === dropTargetPanelId);
			
			if (sourceIdx !== -1 && targetIdx !== -1) {
				const sourcePanel = panels[sourceIdx];
				const targetPanel = panels[targetIdx];
				
				if (sourcePanel.side === targetPanel.side) {
					// 采用“插入”逻辑而非“交换”逻辑，确保排序自然
					// 计算该侧所有面板的新顺序
					const sidePanels = [...panels.filter(p => p.side === sourcePanel.side)];
					const sIdx = sidePanels.findIndex(p => p.id === sourceId);
					const tIdx = sidePanels.findIndex(p => p.id === dropTargetPanelId);
					
					if (sIdx !== -1 && tIdx !== -1) {
						const result = [...sidePanels];
						const [removed] = result.splice(sIdx, 1);
						result.splice(tIdx, 0, removed);
						
						// 批量更新顺序
						result.forEach((p, i) => {
							sidebarConfigStore.setPanelOrder(p.id as PanelId, i);
						});
					}
				}
			}
		}

		dragId = null;
		dropTargetPanelId = null;
		currentDeltaY = 0;
		dragIndex = -1;
		
		const row = event.currentTarget as HTMLElement;
		if (row && row.releasePointerCapture) {
			row.releasePointerCapture(event.pointerId);
		}
	}
	// --- 代码清理：移除原生 DnD 函数 ---

	// 保存提示消息
	let saveMessage = $state<string | null>(null);

	async function applyLayout() {
		try {
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

	function movePanelUp(panel: PanelConfig, panels: PanelConfig[]) {
		const currentIndex = panels.findIndex((p) => p.id === panel.id);
		if (currentIndex <= 0) return;
		const prevPanel = panels[currentIndex - 1];
		sidebarConfigStore.setPanelOrder(panel.id, prevPanel.order);
		sidebarConfigStore.setPanelOrder(prevPanel.id, panel.order);
	}

	function movePanelDown(panel: PanelConfig, panels: PanelConfig[]) {
		const currentIndex = panels.findIndex((p) => p.id === panel.id);
		if (currentIndex < 0 || currentIndex >= panels.length - 1) return;
		const nextPanel = panels[currentIndex + 1];
		sidebarConfigStore.setPanelOrder(panel.id, nextPanel.order);
		sidebarConfigStore.setPanelOrder(nextPanel.id, panel.order);
	}

	function restorePanel(panel: PanelConfig) {
		sidebarConfigStore.setPanelPosition(panel.id, panel.defaultPosition);
		sidebarConfigStore.setPanelVisible(panel.id, true);
	}

	// 移除 Pointer Events 逻辑
	

	const handleSettingsUpdate = (next: NeoViewSettings) => {
		settings = next;
	};

	onMount(() => {
		settingsManager.addListener(handleSettingsUpdate);
		return () => {
			settingsManager.removeListener(handleSettingsUpdate);
		};
	});

	function updateAutoHideTiming(partial: Partial<NeoViewSettings['panels']['autoHideTiming']>) {
		settingsManager.updateNestedSettings('panels', {
			autoHideTiming: { ...autoHideTiming, ...partial }
		});
	}

	// 过滤并按组分类后的面板数据
	const groupedPanels = $derived.by(() => {
		const query = searchQuery.toLowerCase().trim();
		const all = [
			...leftPanels.map((p) => ({ ...p, side: 'left' as const })),
			...rightPanels.map((p) => ({ ...p, side: 'right' as const })),
			...hiddenPanels.map((p) => ({ ...p, side: 'hidden' as const }))
		];

		const filtered = !query
			? all
			: all.filter(
					(p) => p.title.toLowerCase().includes(query) || p.id.toLowerCase().includes(query)
				);

		const groups = [
			{
				id: 'left',
				title: '左侧栏',
				icon: PanelLeft,
				items: filtered.filter((p) => p.side === 'left')
			},
			{
				id: 'right',
				title: '右侧栏',
				icon: PanelRight,
				items: filtered.filter((p) => p.side === 'right')
			},
			{
				id: 'hidden',
				title: '已隐藏',
				icon: EyeOff,
				items: filtered.filter((p) => p.side === 'hidden')
			}
		];

		return groups.filter((g) => g.items.length > 0);
	});

	// 当前分组的面板数据
	const filteredPanelsForGroup = $derived.by(() => {
		const query = searchQuery.toLowerCase().trim();
		let sourcePanels: (PanelConfig & { side: 'left' | 'right' | 'hidden' })[] = [];

		if (activeLayoutGroup === 'all') {
			sourcePanels = [
				...leftPanels.map((p) => ({ ...p, side: 'left' as const })),
				...rightPanels.map((p) => ({ ...p, side: 'right' as const })),
				...hiddenPanels.map((p) => ({ ...p, side: 'hidden' as const }))
			];
		} else if (activeLayoutGroup === 'left') {
			sourcePanels = leftPanels.map((p) => ({ ...p, side: 'left' as const }));
		} else if (activeLayoutGroup === 'right') {
			sourcePanels = rightPanels.map((p) => ({ ...p, side: 'right' as const }));
		} else {
			sourcePanels = hiddenPanels.map((p) => ({ ...p, side: 'hidden' as const }));
		}

		return !query
			? sourcePanels
			: sourcePanels.filter(
					(p) => p.title.toLowerCase().includes(query) || p.id.toLowerCase().includes(query)
				);
	});

	// 各栏位的面板列表映射
	const panelsBySide = $derived({
		left: leftPanels,
		right: rightPanels,
		hidden: hiddenPanels
	});

	// 获取各分组面板数量（用于标签页计数）
	const groupCounts = $derived({
		left: leftPanels.length,
		right: rightPanels.length,
		hidden: hiddenPanels.length
	});

	function getPanelStatus(side: 'left' | 'right' | 'hidden') {
		if (side === 'left') return '左侧栏';
		if (side === 'right') return '右侧栏';
		return '已隐藏';
	}

	function getPanelStatusColor(side: 'left' | 'right' | 'hidden') {
		if (side === 'left') return 'default';
		if (side === 'right') return 'secondary';
		return 'destructive';
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

<div class="bg-background flex flex-col gap-6 p-1">
	<Tabs.Root bind:value={activeTab} class="flex flex-col gap-6">
		<div class="bg-background/80 z-10 border-b px-6 pt-6 pb-4 backdrop-blur-md">
			<Tabs.List class="bg-muted/30 grid h-12 w-full grid-cols-2 rounded-2xl p-1">
				<Tabs.Trigger
					value="layout"
					class="data-[state=active]:bg-background gap-2 rounded-xl data-[state=active]:shadow-sm"
				>
					<LayoutGrid class="h-4 w-4" />
					布局管理
				</Tabs.Trigger>
				<Tabs.Trigger
					value="settings"
					class="data-[state=active]:bg-background gap-2 rounded-xl data-[state=active]:shadow-sm"
				>
					<Settings2 class="h-4 w-4" />
					高级设置
				</Tabs.Trigger>
			</Tabs.List>
		</div>

		<Tabs.Content
			value="layout"
			class="mt-0 flex flex-col gap-6 focus-visible:outline-none"
		>
			<div class="flex flex-col gap-1.5">
				<h3 class="text-xl font-bold tracking-tight">边栏布局</h3>
				<p class="text-muted-foreground text-sm">管理左右边栏的面板位置、顺序和可见性。</p>
			</div>

			<div class="flex flex-wrap items-center justify-between gap-4">
				<div class="relative w-full max-w-sm">
					<Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
					<Input bind:value={searchQuery} placeholder="搜索面板..." class="h-10 rounded-xl pl-9" />
				</div>

				<div class="flex items-center gap-2">
					{#if saveMessage}
						<span
							class="animate-in fade-in slide-in-from-right-2 text-xs font-medium text-green-600"
							>{saveMessage}</span
						>
					{/if}
					<Button variant="outline" size="sm" onclick={resetLayout} class="h-10 gap-2 rounded-xl">
						<RotateCcw class="h-4 w-4" />
						重置
					</Button>
					<Button
						variant="default"
						size="sm"
						onclick={applyLayout}
						class="h-10 gap-2 rounded-xl shadow-sm"
					>
						<ListChecks class="h-4 w-4" />
						应用面板
					</Button>
				</div>
			</div>

			<!-- 分组标签页 -->
			<div class="flex items-center gap-2 px-1">
				<Tabs.Root value={activeLayoutGroup} onValueChange={(v) => activeLayoutGroup = v as any} class="w-full">
					<Tabs.List class="bg-muted/50 flex h-auto w-full flex-wrap justify-start gap-1 rounded-2xl border p-1 shadow-sm">
						<Tooltip.Provider>
							{#each layoutGroups as group}
								{@const GroupIcon = group.icon}
								<Tooltip.Root delayDuration={300}>
									<Tooltip.Trigger asChild>
										{#snippet children({ props }: { props: any })}
											<Tabs.Trigger
												{...props}
												value={group.id}
												class="data-[state=active]:bg-background data-[state=active]:text-primary flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs transition-all data-[state=active]:shadow-sm"
											>
												<GroupIcon class="h-4 w-4" />
												<Badge variant="secondary" class="h-4.5 min-w-4.5 justify-center px-1 text-[9px] opacity-70">
													{group.count}
												</Badge>
											</Tabs.Trigger>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content side="top" class="rounded-lg px-2 py-1 text-xs">{group.title}</Tooltip.Content>
								</Tooltip.Root>
							{/each}
						</Tooltip.Provider>
					</Tabs.List>
				</Tabs.Root>
			</div>

			<div class="bg-card overflow-hidden rounded-2xl border shadow-sm">
				<Table.Root class="table-fixed">
					<Table.Header class="bg-muted/50">
						<Table.Row>
							<Table.Head class="w-10 px-2"></Table.Head>
							<Table.Head class="w-12 px-0 text-center">图标</Table.Head>
							<Table.Head class="w-auto">名称</Table.Head>
							<Table.Head class="w-22.5 px-2 text-center">状态</Table.Head>
							<Table.Head class="w-32.5 pr-4 text-right">操作</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each filteredPanelsForGroup as panel, index (panel.id)}
							{#if activeLayoutGroup === 'all' && (index === 0 || filteredPanelsForGroup[index - 1].side !== panel.side)}
								<Table.Row class="bg-muted/20 hover:bg-muted/20">
									<Table.Cell colspan={5} class="px-4 py-2 text-left">
										<div
											class="text-muted-foreground/60 flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase"
										>
											{#if panel.side === 'left'}
												<PanelLeft class="h-3 w-3" />
												左侧栏
											{:else if panel.side === 'right'}
												<PanelRight class="h-3 w-3" />
												右侧栏
											{:else}
												<EyeOff class="h-3 w-3" />
												已隐藏
											{/if}
										</div>
									</Table.Cell>
								</Table.Row>
							{/if}
							<Table.Row
								onpointerdown={(e) => handlePointerDown(e, panel, index)}
								onpointermove={handlePointerMove}
								onpointerup={handlePointerUp}
								onpointercancel={handlePointerUp}
								data-drag-id={panel.id}
								class={cn(
									'group transition-all duration-200 select-none touch-none',
									dragId === panel.id && 'z-50 shadow-xl ring-2 ring-primary/50 bg-accent relative translate-y-0 opacity-90 scale-[1.02] pointer-events-none',
									dropTargetPanelId === panel.id && dragId !== panel.id && 'bg-primary/5 border-primary/20 scale-[0.98] blur-[0.5px]'
								)}
								style={dragId === panel.id ? `transform: translateY(${currentDeltaY}px); z-index: 100; cursor: grabbing;` : ''}
							>
								<Table.Cell class="px-2">
									<div
										class="drag-handle text-muted-foreground/20 group-hover:text-muted-foreground/60 flex cursor-grab items-center justify-center p-1 transition-colors"
									>
										<GripVertical class="h-4 w-4" />
									</div>
								</Table.Cell>
								<Table.Cell class="px-0">
									<div class="flex items-center justify-center">
										<div
											class="bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground flex h-9 w-9 items-center justify-center rounded-xl shadow-sm transition-all duration-300"
										>
											<Icon name={panel.id} fallback={panel.icon} class="h-4.5 w-4.5" />
										</div>
									</div>
								</Table.Cell>
								<Table.Cell class="min-w-0 px-2">
									<div class="flex min-w-0 flex-col overflow-hidden">
										<span class="block truncate font-medium" title={panel.title}
											>{panel.title}</span
										>
										<span
											class="text-muted-foreground block truncate font-mono text-[10px] uppercase opacity-50"
											>{panel.id}</span
										>
									</div>
								</Table.Cell>
								<Table.Cell class="px-1 text-center">
									<DropdownMenu.Root>
										<DropdownMenu.Trigger asChild>
											{#snippet children({ props }: { props: any })}
												<Button
													{...props}
													variant="ghost"
													size="sm"
													class="hover:bg-muted h-7 rounded-lg px-1 font-normal"
												>
													<Badge
														variant={getPanelStatusColor(panel.side)}
														class="pointer-events-none h-4 px-1 text-[9px] font-bold tracking-tighter uppercase"
													>
														{getPanelStatus(panel.side)}
													</Badge>
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content
											align="start"
											class="border-muted/50 rounded-xl p-1 shadow-lg"
										>
											<DropdownMenu.Item
												onclick={() => assignPanel(panel.id, 'left')}
												class="gap-2 rounded-lg"
											>
												<PanelLeft class="h-4 w-4 text-blue-500" />
												<span>左侧栏</span>
											</DropdownMenu.Item>
											<DropdownMenu.Item
												onclick={() => assignPanel(panel.id, 'right')}
												class="gap-2 rounded-lg"
											>
												<PanelRight class="h-4 w-4 text-purple-500" />
												<span>右侧栏</span>
											</DropdownMenu.Item>
											{#if panel.canHide}
												<DropdownMenu.Separator />
												<DropdownMenu.Item
													onclick={() => assignPanel(panel.id, 'hidden')}
													class="text-destructive focus:text-destructive gap-2 rounded-lg"
												>
													<EyeOff class="h-4 w-4" />
													<span>隐藏</span>
												</DropdownMenu.Item>
											{/if}
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</Table.Cell>
								<Table.Cell class="pr-4 text-right">
									<div class="flex items-center justify-end gap-0.5">
										{#if panel.side === 'hidden'}
											<Button
												variant="ghost"
												size="icon"
												class="text-primary hover:bg-primary/10 h-8 w-8 rounded-lg"
												onclick={() => restorePanel(panel)}
												title="恢复到默认位置"
											>
												<RotateCcw class="h-4 w-4" />
											</Button>
										{:else}
											<Button
												variant="ghost"
												size="icon"
												class="h-7 w-7 rounded-lg lg:h-8 lg:w-8"
												disabled={index === 0}
												onclick={() => movePanelUp(panel, panelsBySide[panel.side])}
											>
												<ArrowUp class="h-3.5 w-3.5" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												class="h-7 w-7 rounded-lg lg:h-8 lg:w-8"
												disabled={index === filteredPanelsForGroup.length - 1}
												onclick={() => movePanelDown(panel, panelsBySide[panel.side])}
											>
												<ArrowDown class="h-3.5 w-3.5" />
											</Button>
										{/if}
										<DropdownMenu.Root>
											<DropdownMenu.Trigger asChild>
												{#snippet children({ props }: { props: any })}
													<Button
														{...props}
														variant="ghost"
														size="icon"
														class="ml-1 h-8 w-8 rounded-lg"
													>
														<MoreHorizontal class="h-4 w-4" />
													</Button>
												{/snippet}
											</DropdownMenu.Trigger>
											<DropdownMenu.Content align="end" class="rounded-xl p-1">
												<DropdownMenu.Item
													onclick={() =>
														sidebarConfigStore.setPanelVisible(panel.id, panel.side === 'hidden')}
													disabled={!panel.canHide}
													class="gap-2"
												>
													{#if panel.side === 'hidden'}
														<Eye class="h-4 w-4" />
														<span>显示面板</span>
													{:else}
														<EyeOff class="h-4 w-4" />
														<span>隐藏面板</span>
													{/if}
												</DropdownMenu.Item>
											</DropdownMenu.Content>
										</DropdownMenu.Root>
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>

				{#if filteredPanelsForGroup.length === 0}
					<div
						class="bg-muted/5 text-muted-foreground flex flex-col items-center justify-center py-20"
					>
						<LayoutGrid class="mb-4 h-12 w-12 opacity-10" />
						<p class="text-sm">未找到匹配的面板</p>
					</div>
				{/if}
			</div>
		</Tabs.Content>

		<Tabs.Content value="settings" class="mt-0 flex-1 overflow-auto p-6 focus-visible:outline-none">
			<div class="mx-auto grid max-w-4xl gap-6">
				<!-- 文件面板组件设置 -->
				<div class="bg-card/40 space-y-6 rounded-3xl border p-6 shadow-sm">
					<div class="flex items-center gap-3">
						<div class="bg-primary/10 text-primary rounded-2xl p-2.5">
							<Folder class="h-5 w-5" />
						</div>
						<div>
							<h4 class="text-lg font-bold">面板组件交互</h4>
							<p class="text-muted-foreground text-sm">精细化管理各面板内部件的显示布局</p>
						</div>
					</div>

					<div class="grid gap-6">
						<!-- 文件夹面板 -->
						<div class="bg-muted/30 space-y-4 rounded-2xl p-4">
							<div class="flex items-center gap-2">
								<Folder class="h-4 w-4 text-blue-500" />
								<span class="font-semibold">文件夹面板</span>
							</div>
							<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
								<div class="space-y-2">
									<label class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium"
										><Columns3 class="h-3 w-3" />标签栏</label
									>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button
												variant={$folderTabBarLayout === pos ? 'default' : 'outline'}
												size="sm"
												class="h-8 w-8 rounded-lg p-0"
												onclick={() =>
													folderTabActions.setTabBarLayout(pos as TabBarLayout, 'folder')}
											>
												{#if pos === 'none'}<EyeOff
														class="h-3.5 w-3.5"
													/>{:else if pos === 'top'}<PanelTop
														class="h-3.5 w-3.5"
													/>{:else if pos === 'bottom'}<PanelBottom
														class="h-3.5 w-3.5"
													/>{:else if pos === 'left'}<PanelLeft
														class="h-3.5 w-3.5"
													/>{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
								<div class="space-y-2">
									<label class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium"
										><Navigation class="h-3 w-3" />面包屑</label
									>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button
												variant={$folderBreadcrumbPosition === pos ? 'default' : 'outline'}
												size="sm"
												class="h-8 w-8 rounded-lg p-0"
												onclick={() =>
													folderTabActions.setBreadcrumbPosition(
														pos as BreadcrumbPosition,
														'folder'
													)}
											>
												{#if pos === 'none'}<EyeOff
														class="h-3.5 w-3.5"
													/>{:else if pos === 'top'}<PanelTop
														class="h-3.5 w-3.5"
													/>{:else if pos === 'bottom'}<PanelBottom
														class="h-3.5 w-3.5"
													/>{:else if pos === 'left'}<PanelLeft
														class="h-3.5 w-3.5"
													/>{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
								<div class="space-y-2">
									<label class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium"
										><Wrench class="h-3 w-3" />工具栏</label
									>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button
												variant={$folderToolbarPosition === pos ? 'default' : 'outline'}
												size="sm"
												class="h-8 w-8 rounded-lg p-0"
												onclick={() =>
													folderTabActions.setToolbarPosition(pos as ToolbarPosition, 'folder')}
											>
												{#if pos === 'none'}<EyeOff
														class="h-3.5 w-3.5"
													/>{:else if pos === 'top'}<PanelTop
														class="h-3.5 w-3.5"
													/>{:else if pos === 'bottom'}<PanelBottom
														class="h-3.5 w-3.5"
													/>{:else if pos === 'left'}<PanelLeft
														class="h-3.5 w-3.5"
													/>{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
							</div>
						</div>

						<!-- 书签面板 -->
						<div class="bg-muted/30 space-y-4 rounded-2xl p-4">
							<div class="flex items-center gap-2">
								<Bookmark class="h-4 w-4 text-amber-500" />
								<span class="font-semibold">书签面板</span>
							</div>
							<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
								<div class="space-y-2">
									<label class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium"
										><Columns3 class="h-3 w-3" />标签栏</label
									>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button
												variant={$bookmarkTabBarLayout === pos ? 'default' : 'outline'}
												size="sm"
												class="h-8 w-8 rounded-lg p-0"
												onclick={() =>
													folderTabActions.setTabBarLayout(pos as TabBarLayout, 'bookmark')}
											>
												{#if pos === 'none'}<EyeOff
														class="h-3.5 w-3.5"
													/>{:else if pos === 'top'}<PanelTop
														class="h-3.5 w-3.5"
													/>{:else if pos === 'bottom'}<PanelBottom
														class="h-3.5 w-3.5"
													/>{:else if pos === 'left'}<PanelLeft
														class="h-3.5 w-3.5"
													/>{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
								<div class="space-y-2">
									<label class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium"
										><Navigation class="h-3 w-3" />面包屑</label
									>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button
												variant={$bookmarkBreadcrumbPosition === pos ? 'default' : 'outline'}
												size="sm"
												class="h-8 w-8 rounded-lg p-0"
												onclick={() =>
													folderTabActions.setBreadcrumbPosition(
														pos as BreadcrumbPosition,
														'bookmark'
													)}
											>
												{#if pos === 'none'}<EyeOff
														class="h-3.5 w-3.5"
													/>{:else if pos === 'top'}<PanelTop
														class="h-3.5 w-3.5"
													/>{:else if pos === 'bottom'}<PanelBottom
														class="h-3.5 w-3.5"
													/>{:else if pos === 'left'}<PanelLeft
														class="h-3.5 w-3.5"
													/>{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
								<div class="space-y-2">
									<label class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium"
										><Wrench class="h-3 w-3" />工具栏</label
									>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button
												variant={$bookmarkToolbarPosition === pos ? 'default' : 'outline'}
												size="sm"
												class="h-8 w-8 rounded-lg p-0"
												onclick={() =>
													folderTabActions.setToolbarPosition(pos as ToolbarPosition, 'bookmark')}
											>
												{#if pos === 'none'}<EyeOff
														class="h-3.5 w-3.5"
													/>{:else if pos === 'top'}<PanelTop
														class="h-3.5 w-3.5"
													/>{:else if pos === 'bottom'}<PanelBottom
														class="h-3.5 w-3.5"
													/>{:else if pos === 'left'}<PanelLeft
														class="h-3.5 w-3.5"
													/>{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
							</div>
						</div>

						<!-- 历史面板 -->
						<div class="bg-muted/30 space-y-4 rounded-2xl p-4">
							<div class="flex items-center gap-2">
								<History class="h-4 w-4 text-green-500" />
								<span class="font-semibold">历史面板</span>
							</div>
							<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
								<div class="space-y-2">
									<label class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium"
										><Columns3 class="h-3 w-3" />标签栏</label
									>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button
												variant={$historyTabBarLayout === pos ? 'default' : 'outline'}
												size="sm"
												class="h-8 w-8 rounded-lg p-0"
												onclick={() =>
													folderTabActions.setTabBarLayout(pos as TabBarLayout, 'history')}
											>
												{#if pos === 'none'}<EyeOff
														class="h-3.5 w-3.5"
													/>{:else if pos === 'top'}<PanelTop
														class="h-3.5 w-3.5"
													/>{:else if pos === 'bottom'}<PanelBottom
														class="h-3.5 w-3.5"
													/>{:else if pos === 'left'}<PanelLeft
														class="h-3.5 w-3.5"
													/>{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
								<div class="space-y-2">
									<label class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium"
										><Navigation class="h-3 w-3" />面包屑</label
									>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button
												variant={$historyBreadcrumbPosition === pos ? 'default' : 'outline'}
												size="sm"
												class="h-8 w-8 rounded-lg p-0"
												onclick={() =>
													folderTabActions.setBreadcrumbPosition(
														pos as BreadcrumbPosition,
														'history'
													)}
											>
												{#if pos === 'none'}<EyeOff
														class="h-3.5 w-3.5"
													/>{:else if pos === 'top'}<PanelTop
														class="h-3.5 w-3.5"
													/>{:else if pos === 'bottom'}<PanelBottom
														class="h-3.5 w-3.5"
													/>{:else if pos === 'left'}<PanelLeft
														class="h-3.5 w-3.5"
													/>{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
								<div class="space-y-2">
									<label class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium"
										><Wrench class="h-3 w-3" />工具栏</label
									>
									<div class="flex flex-wrap gap-1">
										{#each ['none', 'top', 'bottom', 'left', 'right'] as pos}
											<Button
												variant={$historyToolbarPosition === pos ? 'default' : 'outline'}
												size="sm"
												class="h-8 w-8 rounded-lg p-0"
												onclick={() =>
													folderTabActions.setToolbarPosition(pos as ToolbarPosition, 'history')}
											>
												{#if pos === 'none'}<EyeOff
														class="h-3.5 w-3.5"
													/>{:else if pos === 'top'}<PanelTop
														class="h-3.5 w-3.5"
													/>{:else if pos === 'bottom'}<PanelBottom
														class="h-3.5 w-3.5"
													/>{:else if pos === 'left'}<PanelLeft
														class="h-3.5 w-3.5"
													/>{:else}<PanelRight class="h-3.5 w-3.5" />{/if}
											</Button>
										{/each}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- 延迟设置 -->
				<div class="bg-card/40 space-y-6 rounded-3xl border p-6 shadow-sm">
					<div class="flex items-center gap-3">
						<div class="rounded-2xl bg-amber-500/10 p-2.5 text-amber-500">
							<History class="h-5 w-5" />
						</div>
						<div>
							<h4 class="text-lg font-bold">交互响应速度</h4>
							<p class="text-muted-foreground text-sm">调整边栏自动显示的延迟时间</p>
						</div>
					</div>
					<div class="grid grid-cols-2 gap-6">
						<div class="space-y-3">
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium">显示延迟</span>
								<span class="bg-muted rounded-lg px-2 py-1 text-xs"
									>{autoHideTiming.showDelaySec}s</span
								>
							</div>
							<input
								type="range"
								min="0"
								max="2"
								step="0.1"
								value={autoHideTiming.showDelaySec}
								oninput={(e) =>
									updateAutoHideTiming({ showDelaySec: Number(e.currentTarget.value) })}
								class="accent-primary w-full"
							/>
						</div>
						<div class="space-y-3">
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium">隐藏延迟</span>
								<span class="bg-muted rounded-lg px-2 py-1 text-xs"
									>{autoHideTiming.hideDelaySec}s</span
								>
							</div>
							<input
								type="range"
								min="0"
								max="5"
								step="0.1"
								value={autoHideTiming.hideDelaySec}
								oninput={(e) =>
									updateAutoHideTiming({ hideDelaySec: Number(e.currentTarget.value) })}
								class="accent-primary w-full"
							/>
						</div>
					</div>
				</div>
			</div>
		</Tabs.Content>
	</Tabs.Root>

</div>
