<script lang="ts">
	/**
	 * 统一的操作绑定面板
	 * 参考 NeeView：键盘、鼠标、触摸手势统一管理
	 * 支持上下文感知的绑定配置
	 */
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Table from '$lib/components/ui/table';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Badge } from '$lib/components/ui/badge';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import {
		keyBindingsStore,
		type InputBinding,
		type KeyBinding,
		type MouseGesture,
		type TouchGesture,
		type AreaClick,
		type BindingContext
	} from '$lib/stores/keybindings';
	import {
		Keyboard,
		Mouse,
		Hand,
		Trash2,
		Search,
		RotateCcw,
		Target as TargetIcon,
		Layers,
		X,
		CheckCircle,
		AlertTriangle,
		Plus,
		MoreHorizontal,
		Settings2 as SettingsIcon,
		MapPin,
		ChevronRight,
		ChevronLeft,
		ChevronsRight,
		ChevronsLeft,
		ArrowRight,
		ArrowLeft,
		SkipForward,
		SkipBack,
		ZoomIn,
		ZoomOut,
		Maximize2,
		Scaling,
		Scan,
		Fullscreen,
		PanelLeft as PanelLeftIcon,
		PanelRight as PanelRightIcon,
		Pin,
		Layout,
		ArrowLeftRight,
		BookOpen,
		RotateCw,
		FolderOpen,
		FileX,
		FileMinus,
		Play,
		Pause,
		FastForward,
		Rewind,
		Volume2,
		Volume1,
		VolumeX,
		Repeat,
		Gauge,
		Timer,
		Zap,
		Square,
		StepForward
	} from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import GestureVisualizer from './GestureVisualizer.svelte';
	import { confirm } from '$lib/stores/confirmDialog.svelte';
	import MouseGestureRecorder from './MouseGestureRecorder.svelte';
	import MouseKeyRecorder from './MouseKeyRecorder.svelte';
	import AreaClickRecorder from './AreaClickRecorder.svelte';

	let searchQuery = $state('');
	let editingAction = $state<string | null>(null);
	let editingType = $state<'keyboard' | 'mouse' | 'touch' | 'area' | null>(null);
	// 存储每个操作当前选择的“添加到”上下文，key 为 action id
	let actionEditingContexts = $state<Record<string, BindingContext>>({});
	let capturedInput = $state<
		string | { gesture?: string; button?: string; action?: string; area?: string }
	>('');
	let showGestureVisualizer = $state(false);
	let showMouseGestureRecorder = $state(false);
	let showMouseKeyRecorder = $state(false);
	let showAreaClickRecorder = $state(false);

	// 当前选中的分类 Tab
	let activeCategory = $state<string>('');

	// 过滤操作
	const filteredActions = $derived(
		searchQuery.trim()
			? keyBindingsStore.bindings.filter(
					(b) =>
						b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
						b.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
						b.description.toLowerCase().includes(searchQuery.toLowerCase())
				)
			: keyBindingsStore.bindings
	);

	// 获取分类
	const categories = $derived(keyBindingsStore.getCategories());

	// 可用上下文列表
	const availableContexts = $derived(keyBindingsStore.getAvailableContexts());

	// 检测所有冲突
	type ConflictInfo = {
		action1: string;
		action2: string;
		binding: string;
		context: BindingContext;
	};
	const allConflicts = $derived.by(() => {
		const conflicts: ConflictInfo[] = [];
		const bindingMap = new Map<string, { action: string; context: BindingContext }>();

		for (const actionBinding of keyBindingsStore.bindings) {
			// 检查全局绑定
			if (actionBinding.bindings) {
				for (const b of actionBinding.bindings) {
					const key = `global:${JSON.stringify(b)}`;
					const existing = bindingMap.get(key);
					if (existing && existing.action !== actionBinding.action) {
						conflicts.push({
							action1: existing.action,
							action2: actionBinding.action,
							binding: keyBindingsStore.formatBinding(b),
							context: 'global'
						});
					} else {
						bindingMap.set(key, { action: actionBinding.action, context: 'global' });
					}
				}
			}
			// 检查上下文绑定
			if (actionBinding.contextBindings) {
				for (const cb of actionBinding.contextBindings) {
					const key = `${cb.context}:${JSON.stringify(cb.input)}`;
					const existing = bindingMap.get(key);
					if (existing && existing.action !== actionBinding.action) {
						conflicts.push({
							action1: existing.action,
							action2: actionBinding.action,
							binding: keyBindingsStore.formatBinding(cb.input),
							context: cb.context as BindingContext
						});
					} else {
						bindingMap.set(key, {
							action: actionBinding.action,
							context: cb.context as BindingContext
						});
					}
				}
			}
		}
		return conflicts;
	});

	// 初始化默认分类
	$effect(() => {
		if (activeCategory === '' && categories.length > 0) {
			activeCategory = categories[0];
		}
	});

	// 当前分类下的操作
	const currentCategoryActions = $derived(
		activeCategory
			? keyBindingsStore
					.getBindingsByCategory(activeCategory)
					.filter(
						(b) =>
							!searchQuery ||
							b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
							b.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
							b.description.toLowerCase().includes(searchQuery.toLowerCase())
					)
			: []
	);

	// 根据分类获取默认上下文
	function getDefaultContextForCategory(category: string): BindingContext {
		if (category === '视频') return 'videoPlayer';
		return 'global';
	}

	// 监听分类切换，初始化或重置操作的默认上下文
	$effect(() => {
		if (activeCategory) {
			const defaultCtx = getDefaultContextForCategory(activeCategory);
			keyBindingsStore.bindings.forEach((b) => {
				if (b.category === activeCategory && !actionEditingContexts[b.action]) {
					actionEditingContexts[b.action] = defaultCtx;
				}
			});
		}
	});

	// 开始编辑（支持上下文）
	function startEditing(
		action: string,
		type: 'keyboard' | 'mouse' | 'touch' | 'area',
		context: BindingContext
	) {
		editingAction = action;
		editingType = type;
		// 确保捕获时使用的是当时选择的上下文
		actionEditingContexts[action] = context;
		capturedInput = '';

		if (type === 'touch') {
			showGestureVisualizer = true;
		} else if (type === 'area') {
			showAreaClickRecorder = true;
		}
	}

	// 取消编辑
	function cancelEditing() {
		editingAction = null;
		editingType = null;
		capturedInput = '';
		showGestureVisualizer = false;
		showMouseGestureRecorder = false;
		showMouseKeyRecorder = false;
		showAreaClickRecorder = false;
	}

	// 键盘按键捕获
	function handleKeyDown(e: KeyboardEvent) {
		if (editingAction && editingType === 'keyboard') {
			e.preventDefault();

			// 构建按键字符串
			const modifiers = [];
			if (e.ctrlKey) modifiers.push('Ctrl');
			if (e.shiftKey) modifiers.push('Shift');
			if (e.altKey) modifiers.push('Alt');

			// 特殊键映射
			const keyMap: Record<string, string> = {
				' ': 'Space',
				'+': 'Plus',
				'-': 'Minus',
				ArrowUp: '↑',
				ArrowDown: '↓',
				ArrowLeft: '←',
				ArrowRight: '→'
			};

			const key = keyMap[e.key] || e.key;
			capturedInput = [...modifiers, key].join('+');
		}
	}

	// 辅助类型
	type CapturedInputObject = { gesture?: string; button?: string; action?: string; area?: string };

	// 创建绑定对象的辅助函数
	function createBindingFromInput(): InputBinding | null {
		if (!capturedInput) return null;

		if (editingType === 'keyboard') {
			const key = typeof capturedInput === 'string' ? capturedInput : '';
			if (!key) return null;
			return { type: 'keyboard', key };
		} else if (editingType === 'mouse') {
			const obj = capturedInput as CapturedInputObject;
			return {
				type: 'mouse',
				gesture: obj.gesture || '',
				button: (obj.button as 'left' | 'right' | 'middle') || 'left',
				action: obj.action
			} as MouseGesture;
		} else if (editingType === 'area') {
			const obj = capturedInput as CapturedInputObject;
			return {
				type: 'area',
				area: obj.area as any,
				button: (obj.button as 'left' | 'right' | 'middle') || 'left',
				action: (obj.action as 'click' | 'double-click' | 'press') || 'click'
			};
		} else if (editingType === 'touch') {
			const gesture = typeof capturedInput === 'string' ? capturedInput : '';
			if (!gesture) return null;
			return { type: 'touch', gesture };
		}
		return null;
	}

	// 保存绑定（支持上下文）
	function saveBinding() {
		if (!editingAction || !editingType || !capturedInput) return;

		const binding = createBindingFromInput();
		if (!binding) return;

		const targetContext = actionEditingContexts[editingAction] || 'global';

		// 使用上下文感知的添加方法
		const conflict = keyBindingsStore.addContextBinding(editingAction, binding, targetContext);
		if (conflict) {
			// 处理冲突：提示用户
			handleConflict(conflict);
		} else {
			cancelEditing();
		}
	}

	// 处理绑定冲突
	async function handleConflict(conflict: {
		input: InputBinding;
		context: BindingContext;
		existingAction: string;
		newAction: string;
	}) {
		const existingBinding = keyBindingsStore.getBinding(conflict.existingAction);
		const confirmed = await confirm({
			title: '绑定冲突',
			description: `此输入已绑定到 "${existingBinding?.name || conflict.existingAction}"。\n是否要替换现有绑定？`,
			confirmText: '替换',
			cancelText: '取消',
			variant: 'warning'
		});

		if (confirmed && editingAction && capturedInput) {
			const binding = createBindingFromInput();
			if (binding) {
				// 强制添加，移除冲突
				keyBindingsStore.forceAddContextBinding(editingAction, binding, editingContext);
			}
		}
		cancelEditing();
	}

	// 处理区域点击录制完成
	function handleAreaClickComplete(area: string, button: string, action: string) {
		capturedInput = { area, button, action };
		showAreaClickRecorder = false;
		saveBinding();
	}

	// 处理区域点击录制取消
	function handleAreaClickCancel() {
		showAreaClickRecorder = false;
		cancelEditing();
	}

	// 处理鼠标选项选择
	function handleMouseOption(gesture: string, button: 'left' | 'right' | 'middle', action: string) {
		capturedInput = { gesture, button, action };
		saveBinding();
	}

	// 处理鼠标手势录制完成
	function handleMouseGestureComplete(gesture: string, button: string, action: string) {
		capturedInput = { gesture, button, action };
		showMouseGestureRecorder = false;
		saveBinding();
	}

	// 处理鼠标手势录制取消
	function handleMouseGestureCancel() {
		showMouseGestureRecorder = false;
	}

	// 处理鼠标按键录制完成
	function handleMouseKeyComplete(gesture: string, button: string, action: string) {
		capturedInput = { gesture, button, action };
		showMouseKeyRecorder = false;
		saveBinding();
	}

	// 处理鼠标按键录制取消
	function handleMouseKeyCancel() {
		showMouseKeyRecorder = false;
	}

	// 处理手势完成
	function handleGestureComplete(gesture: string) {
		capturedInput = gesture;
		showGestureVisualizer = false;
		saveBinding();
	}

	// 处理手势取消
	function handleGestureCancel() {
		showGestureVisualizer = false;
		cancelEditing();
	}

	// 删除绑定（支持上下文）
	function removeBinding(
		action: string,
		index: number,
		isContextBinding: boolean,
		context?: BindingContext
	) {
		if (isContextBinding && context) {
			keyBindingsStore.removeContextBinding(action, context, index);
		} else {
			keyBindingsStore.removeBinding(action, index);
		}
	}

	// 切换绑定的上下文
	function changeBindingContext(
		action: string,
		inputBinding: InputBinding,
		currentContext: BindingContext,
		index: number,
		isContextBinding: boolean,
		newContext: BindingContext
	) {
		if (currentContext === newContext) {
			return;
		}
		// 先删除旧绑定
		if (isContextBinding) {
			keyBindingsStore.removeContextBinding(action, currentContext, index);
		} else {
			keyBindingsStore.removeBinding(action, index);
		}
		// 添加到新上下文
		keyBindingsStore.addContextBinding(action, inputBinding, newContext);
	}

	// 获取上下文颜色
	function getContextColor(context: BindingContext): string {
		const colors: Record<BindingContext, string> = {
			global: 'bg-gray-500',
			viewer: 'bg-blue-500',
			videoPlayer: 'bg-red-500'
		};
		return colors[context] ?? 'bg-gray-500';
	}

	// 重置
	async function resetAll() {
		const confirmed = await confirm({
			title: '确认重置',
			description: '确定要重置所有绑定为默认设置吗？',
			confirmText: '重置',
			cancelText: '取消',
			variant: 'warning'
		});
		if (confirmed) {
			keyBindingsStore.resetToDefault();
		}
	}

	// 获取绑定图标
	function getBindingIcon(type: string) {
		switch (type) {
			case 'keyboard':
				return Keyboard;
			case 'mouse':
				return Mouse;
			case 'touch':
				return Hand;
			case 'area':
				return TargetIcon;
			default:
				return Keyboard;
		}
	}

	// 获取绑定颜色
	function getBindingColor(type: string): string {
		switch (type) {
			case 'keyboard':
				return 'text-blue-500';
			case 'mouse':
				return 'text-green-500';
			case 'touch':
				return 'text-purple-500';
			case 'area':
				return 'text-orange-500';
			default:
				return 'text-muted-foreground';
		}
	}

	function getActionIcon(action: string, category: string) {
		// Navigation
		if (action === 'nextPage') return ChevronRight;
		if (action === 'prevPage') return ChevronLeft;
		if (action === 'firstPage') return ChevronsLeft;
		if (action === 'lastPage') return ChevronsRight;
		if (action === 'pageLeft') return ArrowLeft;
		if (action === 'pageRight') return ArrowRight;
		if (action === 'nextBook') return SkipForward;
		if (action === 'prevBook') return SkipBack;

		// Zoom
		if (action === 'zoomIn') return ZoomIn;
		if (action === 'zoomOut') return ZoomOut;
		if (action === 'fitWindow') return Maximize2;
		if (action === 'actualSize') return Scaling;
		if (action === 'toggleTemporaryFitZoom') return Scan;

		// Video
		if (action === 'videoPlayPause') return Play;
		if (action === 'videoSeekForward') return FastForward;
		if (action === 'videoSeekBackward') return Rewind;
		if (action === 'videoToggleMute') return VolumeX;
		if (action === 'videoToggleLoopMode') return Repeat;
		if (action === 'videoVolumeUp') return Volume2;
		if (action === 'videoVolumeDown') return Volume1;
		if (action === 'videoSpeedUp') return Gauge;
		if (action === 'videoSpeedDown') return Timer;
		if (action === 'videoSpeedToggle') return TargetIcon;
		if (action === 'videoSeekModeToggle') return Zap;

		// View
		if (action === 'fullscreen') return Fullscreen;
		if (action === 'toggleLeftSidebar') return PanelLeftIcon;
		if (action === 'toggleRightSidebar') return PanelRightIcon;
		if (action === 'toggleTopToolbarPin') return Pin;
		if (action === 'toggleBottomThumbnailBarPin') return Layout;
		if (action === 'toggleReadingDirection') return ArrowLeftRight;
		if (action === 'toggleBookMode') return BookOpen;
		if (action === 'rotate') return RotateCw;
		if (action === 'toggleSinglePanoramaView') return Layers;

		// File
		if (action === 'openFile') return FolderOpen;
		if (action === 'closeFile') return FileX;
		if (action === 'deleteFile') return Trash2;
		if (action === 'deleteCurrentPage') return FileMinus;

		// Upscale
		if (action === 'toggleAutoUpscale') return Zap;

		// Slideshow
		if (action === 'slideshowToggle') return Play;
		if (action === 'slideshowPlayPause') return Pause;
		if (action === 'slideshowStop') return Square;
		if (action === 'slideshowSkip') return StepForward;

		return SettingsIcon;
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="bg-background flex h-full flex-col">
	<!-- 头部 -->
	<div class="space-y-3 border-b p-4">
		<div class="flex items-center justify-between">
			<div class="space-y-1">
				<h3 class="flex items-center gap-2 text-lg font-semibold">
					<Keyboard class="h-5 w-5" />
					操作绑定
				</h3>
				<p class="text-muted-foreground text-xs">
					配置快捷键、鼠标手势和触摸手势。支持为不同上下文配置相同按键的不同操作。
				</p>
			</div>
			<Button variant="outline" size="sm" onclick={resetAll}>
				<RotateCcw class="mr-1 h-3 w-3" />
				重置全部
			</Button>
		</div>

		<!-- 搜索栏和图例 -->
		<div class="flex items-center justify-between gap-4">
			<div class="relative max-w-xs flex-1">
				<Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
				<Input type="text" placeholder="搜索操作..." bind:value={searchQuery} class="h-8 pl-9" />
			</div>
			<!-- 上下文颜色图例 -->
			<div
				class="text-muted-foreground bg-muted/30 flex items-center gap-3 rounded-md border px-3 py-1.5 text-xs"
			>
				<span class="font-medium">上下文:</span>
				{#each availableContexts as ctx}
					<div class="flex items-center gap-1">
						<span class="h-2 w-2 rounded-full {getContextColor(ctx)}"></span>
						<span>{keyBindingsStore.formatContext(ctx)}</span>
					</div>
				{/each}
			</div>
			<!-- 冲突状态 -->
			{#if allConflicts.length === 0}
				<div
					class="flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-600 dark:border-green-800 dark:bg-green-950/30"
				>
					<CheckCircle class="h-3.5 w-3.5" />
					<span>无冲突</span>
				</div>
			{:else}
				<div
					class="flex cursor-pointer items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-600 dark:border-amber-800 dark:bg-amber-950/30"
					title="点击查看冲突详情"
				>
					<AlertTriangle class="h-3.5 w-3.5" />
					<span>{allConflicts.length} 个冲突</span>
				</div>
			{/if}
		</div>

		<!-- 冲突详情（如果有） -->
		{#if allConflicts.length > 0}
			<div
				class="rounded-md border border-amber-200 bg-amber-50/50 p-2 dark:border-amber-800 dark:bg-amber-950/20"
			>
				<div class="space-y-1 text-xs text-amber-700 dark:text-amber-400">
					{#each allConflicts as conflict}
						<div class="flex items-center gap-1">
							<span class="h-2 w-2 rounded-full {getContextColor(conflict.context)}"></span>
							<span class="font-mono">{conflict.binding}</span>
							<span class="text-muted-foreground">:</span>
							<span class="font-medium">{conflict.action1}</span>
							<span class="text-muted-foreground">与</span>
							<span class="font-medium">{conflict.action2}</span>
							<span class="text-muted-foreground">冲突</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<!-- 使用 shadcn Tabs 组件 -->
	<Tabs.Root bind:value={activeCategory} class="flex flex-1 flex-col overflow-hidden">
		<!-- 分类 Tab 列表 -->
		<div class="px-4 pt-2">
			<Tabs.List class="h-auto w-full flex-wrap gap-1">
				{#each categories as category}
					<Tabs.Trigger value={category} class="text-xs">
						{category}
					</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</div>

		<!-- 当前分类的操作列表 -->
		{#each categories as category}
			{@const categoryActions = keyBindingsStore
				.getBindingsByCategory(category)
				.filter(
					(b) =>
						!searchQuery ||
						b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
						b.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
						b.description.toLowerCase().includes(searchQuery.toLowerCase())
				)}
			<Tabs.Content value={category} class="flex-1 overflow-auto p-0 focus-visible:outline-none">
				<div class="px-6 py-4">
					<div class="bg-card overflow-hidden rounded-2xl border shadow-sm">
						<Table.Root class="table-fixed">
							<Table.Header class="bg-muted/50">
								<Table.Row>
									<Table.Head class="w-12 px-0 text-center">#</Table.Head>
									<Table.Head class="w-auto px-2">操作项</Table.Head>
									<Table.Head class="w-36 px-2">目标环境</Table.Head>
									<Table.Head class="w-1/2 px-2">当前绑定</Table.Head>
									<Table.Head class="w-16 pr-6 text-right"></Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each categoryActions as binding}
									{@const ActionIcon = getActionIcon(binding.action, binding.category)}
									<Table.Row class="group transition-colors">
										<!-- 图标 -->
										<Table.Cell class="px-0">
											<div class="flex items-center justify-center">
												<div
													class="bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground flex h-8 w-8 items-center justify-center rounded-xl shadow-sm transition-all duration-300"
												>
													<ActionIcon class="h-4 w-4" />
												</div>
											</div>
										</Table.Cell>

										<!-- 操作信息 -->
										<Table.Cell class="px-2 py-4">
											<div class="flex min-w-0 flex-col overflow-hidden">
												<span class="block truncate text-sm font-medium" title={binding.name}
													>{binding.name}</span
												>
												<span
													class="text-muted-foreground block truncate font-mono text-[9px] uppercase opacity-40"
													>{binding.action}</span
												>
											</div>
										</Table.Cell>

										<!-- 添加操作列 -->
										<Table.Cell class="px-2 py-4">
											{@const currentEditingCtx =
												actionEditingContexts[binding.action] ||
												getDefaultContextForCategory(binding.category)}
											<div class="flex flex-col gap-2">
												<!-- 上行：上下文切换 -->
												<DropdownMenu.Root>
													<DropdownMenu.Trigger asChild>
														{#snippet children({ props })}
															<Button
																{...props}
																variant="ghost"
																size="sm"
																class="hover:bg-muted h-7 w-full justify-start gap-1.5 rounded-lg px-1.5 font-normal"
																title="切换上下文"
															>
																<div
																	class={cn(
																		'h-2 w-2 rounded-full',
																		getContextColor(currentEditingCtx)
																	)}
																></div>
																<span class="text-[10px] uppercase tabular-nums opacity-70">
																	{keyBindingsStore.formatContext(currentEditingCtx)}
																</span>
															</Button>
														{/snippet}
													</DropdownMenu.Trigger>
													<DropdownMenu.Content align="start" class="w-40 rounded-xl p-1 shadow-lg">
														<DropdownMenu.Label
															class="text-muted-foreground px-2 py-1.5 text-[10px] font-bold uppercase"
															>目标环境</DropdownMenu.Label
														>
														{#each availableContexts as ctx}
															<DropdownMenu.CheckboxItem
																checked={currentEditingCtx === ctx}
																onCheckedChange={() =>
																	(actionEditingContexts[binding.action] = ctx)}
																class="gap-2 rounded-lg"
															>
																<div class={cn('h-2 w-2 rounded-full', getContextColor(ctx))}></div>
																{keyBindingsStore.formatContext(ctx)}
															</DropdownMenu.CheckboxItem>
														{/each}
													</DropdownMenu.Content>
												</DropdownMenu.Root>

												<!-- 下行：直接功能图标 -->
												<div class="flex items-center gap-1">
													<!-- Keyboard -->
													<Tooltip.Root>
														<Tooltip.Trigger asChild>
															{#snippet children({ props })}
																<Button
																	{...props}
																	variant="ghost"
																	size="icon"
																	class="h-6 w-6 rounded-lg text-blue-500 hover:bg-blue-500/10"
																	onclick={() =>
																		startEditing(binding.action, 'keyboard', currentEditingCtx)}
																>
																	<Keyboard class="h-3 w-3" />
																</Button>
															{/snippet}
														</Tooltip.Trigger>
														<Tooltip.Content side="top" class="px-2 py-1 text-[10px]"
															>键盘绑定</Tooltip.Content
														>
													</Tooltip.Root>

													<!-- Mouse (Dropdown) -->
													<DropdownMenu.Root>
														<Tooltip.Root>
															<Tooltip.Trigger asChild>
																{#snippet children({ props: tooltipProps })}
																	<DropdownMenu.Trigger asChild>
																		{#snippet children({ props: menuProps })}
																			<Button
																				{...tooltipProps}
																				{...menuProps}
																				variant="ghost"
																				size="icon"
																				class="h-6 w-6 rounded-lg text-green-500 hover:bg-green-500/10"
																			>
																				<Mouse class="h-3 w-3" />
																			</Button>
																		{/snippet}
																	</DropdownMenu.Trigger>
																{/snippet}
															</Tooltip.Trigger>
															<Tooltip.Content side="top" class="px-2 py-1 text-[10px]"
																>鼠标操作</Tooltip.Content
															>
														</Tooltip.Root>
														<DropdownMenu.Content
															align="start"
															class="w-40 rounded-xl p-1 shadow-lg"
														>
															<DropdownMenu.Item
																onclick={() => {
																	editingAction = binding.action;
																	editingType = 'mouse';
																	capturedInput = '';
																	actionEditingContexts[binding.action] = currentEditingCtx;
																	showMouseGestureRecorder = true;
																}}
																class="gap-2 rounded-lg"
															>
																<Mouse class="h-4 w-4 text-green-500" />
																<span>鼠标手势</span>
															</DropdownMenu.Item>
															<DropdownMenu.Item
																onclick={() => {
																	editingAction = binding.action;
																	editingType = 'mouse';
																	capturedInput = '';
																	actionEditingContexts[binding.action] = currentEditingCtx;
																	showMouseKeyRecorder = true;
																}}
																class="gap-2 rounded-lg"
															>
																<Mouse class="h-4 w-4 text-green-500" />
																<span>鼠标按键</span>
															</DropdownMenu.Item>
														</DropdownMenu.Content>
													</DropdownMenu.Root>

													<!-- Touch -->
													<Tooltip.Root>
														<Tooltip.Trigger asChild>
															{#snippet children({ props })}
																<Button
																	{...props}
																	variant="ghost"
																	size="icon"
																	class="h-6 w-6 rounded-lg text-purple-500 hover:bg-purple-500/10"
																	onclick={() =>
																		startEditing(binding.action, 'touch', currentEditingCtx)}
																>
																	<Hand class="h-3 w-3" />
																</Button>
															{/snippet}
														</Tooltip.Trigger>
														<Tooltip.Content side="top" class="px-2 py-1 text-[10px]"
															>触摸手势</Tooltip.Content
														>
													</Tooltip.Root>

													<!-- Area -->
													<Tooltip.Root>
														<Tooltip.Trigger asChild>
															{#snippet children({ props })}
																<Button
																	{...props}
																	variant="ghost"
																	size="icon"
																	class="h-6 w-6 rounded-lg text-orange-500 hover:bg-orange-500/10"
																	onclick={() =>
																		startEditing(binding.action, 'area', currentEditingCtx)}
																>
																	<TargetIcon class="h-3 w-3" />
																</Button>
															{/snippet}
														</Tooltip.Trigger>
														<Tooltip.Content side="top" class="px-2 py-1 text-[10px]"
															>屏幕区域</Tooltip.Content
														>
													</Tooltip.Root>
												</div>
											</div>
										</Table.Cell>

										<!-- 绑定展示列 -->
										<Table.Cell class="px-2 py-4">
											<div class="flex flex-wrap gap-1.5">
												{#each availableContexts as ctx}
													{@const globalBindings = ctx === 'global' ? binding.bindings || [] : []}
													{@const contextBindings =
														ctx !== 'global'
															? binding.contextBindings?.filter((cb) => cb.context === ctx) || []
															: []}

													{#each globalBindings as inputBinding, index}
														{@const IconType = getBindingIcon(inputBinding.type)}
														<div
															class="group/item bg-muted/20 hover:border-primary/30 inline-flex items-center gap-1 rounded-lg border py-0.5 pr-1.5 pl-1.5 text-[11px] transition-all"
														>
															<DropdownMenu.Root>
																<DropdownMenu.Trigger asChild>
																	{#snippet children({ props })}
																		<button
																			{...props}
																			class="h-1.5 w-1.5 rounded-full bg-gray-500 transition-all hover:ring-2 hover:ring-gray-400"
																			title="上下文: 全局 (点击切换)"
																		></button>
																	{/snippet}
																</DropdownMenu.Trigger>
																<DropdownMenu.Content
																	align="start"
																	class="w-40 rounded-xl p-1 shadow-lg"
																>
																	<DropdownMenu.Label
																		class="text-muted-foreground px-2 py-1.5 text-[10px] font-bold uppercase"
																		>迁移至上下文</DropdownMenu.Label
																	>
																	{#each availableContexts as targetCtx}
																		<DropdownMenu.CheckboxItem
																			checked={ctx === targetCtx}
																			onCheckedChange={() =>
																				changeBindingContext(
																					binding.action,
																					inputBinding,
																					'global',
																					index,
																					false,
																					targetCtx
																				)}
																			class="gap-2 rounded-lg"
																		>
																			<div
																				class={cn(
																					'h-2 w-2 rounded-full',
																					getContextColor(targetCtx)
																				)}
																			></div>
																			{keyBindingsStore.formatContext(targetCtx)}
																		</DropdownMenu.CheckboxItem>
																	{/each}
																</DropdownMenu.Content>
															</DropdownMenu.Root>

															<IconType class={cn('h-3 w-3', getBindingColor(inputBinding.type))} />
															<span class="font-mono"
																>{keyBindingsStore.formatBinding(inputBinding)}</span
															>
															<button
																class="text-muted-foreground/0 group-hover/item:text-destructive group-hover/item:text-muted-foreground/100 ml-0.5 transition-all"
																onclick={() => removeBinding(binding.action, index, false)}
															>
																<X class="h-3 w-3" />
															</button>
														</div>
													{/each}

													{#each contextBindings as cb, index}
														{@const IconType = getBindingIcon(cb.input.type)}
														<div
															class="group/item bg-muted/20 hover:border-primary/30 inline-flex items-center gap-1 rounded-lg border py-0.5 pr-1.5 pl-1.5 text-[11px] transition-all"
														>
															<DropdownMenu.Root>
																<DropdownMenu.Trigger asChild>
																	{#snippet children({ props })}
																		<button
																			{...props}
																			class={cn(
																				'h-1.5 w-1.5 rounded-full transition-all hover:ring-2',
																				getContextColor(ctx)
																			)}
																			title="上下文: {keyBindingsStore.formatContext(
																				ctx
																			)} (点击切换)"
																		></button>
																	{/snippet}
																</DropdownMenu.Trigger>
																<DropdownMenu.Content
																	align="start"
																	class="w-40 rounded-xl p-1 shadow-lg"
																>
																	<DropdownMenu.Label
																		class="text-muted-foreground px-2 py-1.5 text-[10px] font-bold uppercase"
																		>迁移至上下文</DropdownMenu.Label
																	>
																	{#each availableContexts as targetCtx}
																		<DropdownMenu.CheckboxItem
																			checked={ctx === targetCtx}
																			onCheckedChange={() =>
																				changeBindingContext(
																					binding.action,
																					cb.input,
																					ctx,
																					index,
																					true,
																					targetCtx
																				)}
																			class="gap-2 rounded-lg"
																		>
																			<div
																				class={cn(
																					'h-2 w-2 rounded-full',
																					getContextColor(targetCtx)
																				)}
																			></div>
																			{keyBindingsStore.formatContext(targetCtx)}
																		</DropdownMenu.CheckboxItem>
																	{/each}
																</DropdownMenu.Content>
															</DropdownMenu.Root>

															<IconType class={cn('h-3 w-3', getBindingColor(cb.input.type))} />
															<span class="font-mono"
																>{keyBindingsStore.formatBinding(cb.input)}</span
															>
															<button
																class="text-muted-foreground/0 group-hover/item:text-destructive group-hover/item:text-muted-foreground/100 ml-0.5 transition-all"
																onclick={() => removeBinding(binding.action, index, true, ctx)}
															>
																<X class="h-3 w-3" />
															</button>
														</div>
													{/each}
												{/each}
											</div>
										</Table.Cell>

										<!-- 重置操作 -->
										<Table.Cell class="py-4 pr-6 text-right">
											<Button
												variant="ghost"
												size="icon"
												class="h-6 w-6 rounded-lg opacity-0 transition-all group-hover:opacity-60 hover:opacity-100"
												onclick={() => keyBindingsStore.resetBindingToDefault(binding.action)}
												title="恢复此项默认绑定"
											>
												<RotateCcw class="h-3 w-3" />
											</Button>
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</div>

					{#if categoryActions.length === 0}
						<div class="text-muted-foreground flex flex-col items-center justify-center py-12">
							<Search class="mb-3 h-8 w-8 opacity-20" />
							<p>
								{#if searchQuery}
									没有找到匹配的操作
								{:else}
									此分类暂无操作
								{/if}
							</p>
						</div>
					{/if}
				</div>
			</Tabs.Content>
		{/each}
	</Tabs.Root>

	<!-- 编辑对话框 -->
	{#if editingAction && editingType && editingType === 'keyboard'}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div class="bg-background mx-4 w-full max-w-md space-y-4 rounded-lg border p-6">
				<div class="space-y-2">
					<h4 class="flex items-center gap-2 font-semibold">
						<Keyboard class="h-4 w-4 text-blue-500" />
						添加键盘按键
					</h4>
					<p class="text-muted-foreground text-sm">按下任意键或组合键</p>
				</div>

				<div class="bg-muted/50 rounded-lg border p-4 text-center">
					<div class="font-mono text-lg font-semibold">
						{capturedInput || '等待按键...'}
					</div>
				</div>

				<div class="flex justify-end gap-2">
					<Button variant="outline" onclick={cancelEditing}>取消</Button>
					<Button onclick={saveBinding} disabled={!capturedInput}>保存</Button>
				</div>
			</div>
		</div>
	{/if}

	<!-- 鼠标手势录制器 -->
	{#if showMouseGestureRecorder && editingAction && editingType === 'mouse'}
		<MouseGestureRecorder
			onComplete={handleMouseGestureComplete}
			onCancel={handleMouseGestureCancel}
		/>
	{/if}

	<!-- 区域点击录制器 -->
	{#if showAreaClickRecorder && editingAction && editingType === 'area'}
		<AreaClickRecorder onComplete={handleAreaClickComplete} onCancel={handleAreaClickCancel} />
	{/if}

	<!-- 鼠标按键录制器 -->
	{#if showMouseKeyRecorder && editingAction && editingType === 'mouse'}
		<MouseKeyRecorder onComplete={handleMouseKeyComplete} onCancel={handleMouseKeyCancel} />
	{/if}

	<!-- 手势可视化器 -->
	{#if showGestureVisualizer && editingAction && editingType === 'touch'}
		<GestureVisualizer
			type={editingType}
			onGestureComplete={handleGestureComplete}
			onCancel={handleGestureCancel}
		/>
	{/if}
</div>
