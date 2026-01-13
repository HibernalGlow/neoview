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
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
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

	let settings = $state<NeoViewSettings>(settingsManager.getSettings());
	let hoverAreas = $derived(settings.panels.hoverAreas);
	let autoHideTiming = $derived(settings.panels.autoHideTiming);

	// 从 store 动态获取面板列表
	let leftPanels = $derived($sidebarLeftPanels);
	let rightPanels = $derived($sidebarRightPanels);
	let hiddenPanels = $derived($sidebarHiddenPanels);

	// 拖拽状态
	type AreaId = 'waitingArea' | 'leftSidebar' | 'rightSidebar';
	let draggedPanelId = $state<string | null>(null);
	let isPointerDragging = $state(false);
	let dragPreview = $state<{ x: number; y: number } | null>(null);
	let dropTargetIndex = $state<number | null>(null);

	// 拖拽处理函数
	function handlePointerDown(event: PointerEvent, panel: PanelConfig) {
		// 只有点击手柄时触发
		if (!(event.target as HTMLElement).closest('.drag-handle')) return;

		event.preventDefault();
		draggedPanelId = panel.id;
		isPointerDragging = true;
		dragPreview = { x: event.clientX + 12, y: event.clientY + 12 };
	}

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

	$effect(() => {
		function handleWindowPointerUp() {
			if (!isPointerDragging) return;
			isPointerDragging = false;
			draggedPanelId = null;
			dragPreview = null;
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

	function getPanelStatus(side: 'left' | 'right' | 'hidden') {
		if (side === 'left') return '左侧栏';
		if (side === 'right') return '右侧栏';
		return '已隐藏';
	}

	function getPanelStatusColor(side: 'left' | 'right' | 'hidden') {
		if (side === 'left') return 'blue';
		if (side === 'right') return 'purple';
		return 'red';
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

<div class="bg-background flex h-full flex-col overflow-hidden">
	<Tabs.Root bind:value={activeTab} class="flex flex-1 flex-col overflow-hidden">
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
			class="mt-0 flex flex-1 flex-col gap-6 overflow-auto p-6 focus-visible:outline-none"
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

			<div class="bg-card overflow-hidden rounded-2xl border shadow-sm">
				<Table.Root class="table-fixed">
					<Table.Header class="bg-muted/50">
						<Table.Row>
							<Table.Head class="w-10 px-2"></Table.Head>
							<Table.Head class="w-12 px-0 text-center">图标</Table.Head>
							<Table.Head class="w-auto">名称</Table.Head>
							<Table.Head class="w-[90px] px-2 text-center">状态</Table.Head>
							<Table.Head class="w-[130px] pr-4 text-right">操作</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each groupedPanels as group}
							<Table.Row class="bg-muted/20 hover:bg-muted/20">
								<Table.Cell colspan={5} class="py-2.5 px-4 text-left">
									<div class="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
										<svelte:component this={group.icon} class="h-3.5 w-3.5" />
										{group.title}
										<span class="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
											{group.items.length}
										</span>
									</div>
								</Table.Cell>
							</Table.Row>
							{#each group.items as panel, index (panel.id)}
								<Table.Row
									class={cn(
										'group transition-colors',
										isPointerDragging &&
											draggedPanelId === panel.id &&
											'bg-muted/30 opacity-50 grayscale'
									)}
								>
									<Table.Cell class="px-2">
										<div
											class="drag-handle text-muted-foreground/20 group-hover:text-muted-foreground/60 p-1 transition-colors cursor-grab flex items-center justify-center"
											onpointerdown={(e) => handlePointerDown(e, panel)}
										>
											<GripVertical class="h-4 w-4" />
										</div>
									</Table.Cell>
									<Table.Cell class="px-0">
										<div class="flex items-center justify-center">
											<div
												class="bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300 shadow-sm"
											>
												{#if panel.icon}
													<svelte:component this={panel.icon} class="h-4.5 w-4.5" />
												{:else}
													<LayoutGrid class="h-4.5 w-4.5" />
												{/if}
											</div>
										</div>
									</Table.Cell>
									<Table.Cell class="min-w-0 px-2">
										<div class="flex min-w-0 flex-col overflow-hidden">
											<span class="truncate font-medium block" title={panel.title}>{panel.title}</span>
											<span
												class="text-muted-foreground font-mono text-[10px] uppercase opacity-50 truncate block"
												>{panel.id}</span
											>
										</div>
									</Table.Cell>
									<Table.Cell class="px-1 text-center">
										<DropdownMenu.Root>
											<DropdownMenu.Trigger asChild>
												{#snippet children({ props })}
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
													class="h-8 w-8 rounded-lg text-primary hover:bg-primary/10"
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
													onclick={() => {
														const list =
															panel.side === 'left'
																? leftPanels
																: panel.side === 'right'
																	? rightPanels
																	: hiddenPanels;
														movePanelUp(panel, list);
													}}
												>
													<ArrowUp class="h-3.5 w-3.5" />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													class="h-7 w-7 rounded-lg lg:h-8 lg:w-8"
													disabled={index === group.items.length - 1}
													onclick={() => {
														const list =
															panel.side === 'left'
																? leftPanels
																: panel.side === 'right'
																	? rightPanels
																	: hiddenPanels;
														movePanelDown(panel, list);
													}}
												>
													<ArrowDown class="h-3.5 w-3.5" />
												</Button>
											{/if}
											<DropdownMenu.Root>
												<DropdownMenu.Trigger asChild>
													{#snippet children({ props })}
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
															sidebarConfigStore.setPanelVisible(
																panel.id,
																panel.side === 'hidden'
															)}
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
						{/each}
					</Table.Body>
				</Table.Root>

				{#if groupedPanels.length === 0}
					<div
						class="bg-muted/5 flex flex-col items-center justify-center py-20 text-muted-foreground"
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

	<!-- 拖拽预览 -->
	{#if isPointerDragging && dragPreview && draggedPanelId}
		{@const panel = [...leftPanels, ...rightPanels, ...hiddenPanels].find((p) => p.id === draggedPanelId)}
		{#if panel}
			<div
				class="pointer-events-none fixed z-[100] scale-105"
				style="left: {dragPreview.x}px; top: {dragPreview.y}px;"
			>
				<div
					class="bg-card/95 border-primary/50 animate-in zoom-in-95 flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md"
				>
					<div class="bg-primary/10 text-primary rounded-lg p-1.5">
						<svelte:component this={panel.icon} class="h-5 w-5" />
					</div>
					<span class="text-sm font-semibold">{panel.title}</span>
					<div class="bg-primary ml-2 h-2 w-2 animate-pulse rounded-full"></div>
				</div>
			</div>
		{/if}
	{/if}
</div>
