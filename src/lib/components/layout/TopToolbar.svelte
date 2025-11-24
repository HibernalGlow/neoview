<script lang="ts">
	/**
	 * Top Toolbar Component
	 * 顶部工具栏 - 自动隐藏，包含标题栏、面包屑和图片操作按钮
	 */
	import { getCurrentWebviewWindow, WebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { Button } from '$lib/components/ui/button';
	import * as Separator from '$lib/components/ui/separator';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	// Progress component removed — not used in this toolbar

	import { bookStore } from '$lib/stores/book.svelte';
	import {
		zoomIn,
		zoomOut,
		resetZoom,
		rotateClockwise,
		rotationAngle,
		setViewMode,
		toggleViewModeLock,
		toggleSidebar,
		toggleReadingDirection,
		toggleOrientation,
		topToolbarPinned,
		topToolbarHeight
	} from '$lib/stores';
	import { readable } from 'svelte/store';
	import { onMount } from 'svelte';
	import { appState, type StateSelector } from '$lib/core/state/appState';
	import PathBar from '../ui/PathBar.svelte';
	import {
		ChevronLeft,
		ChevronRight,
		ZoomIn,
		ZoomOut,
		RotateCw,
		RectangleVertical,
		Columns2,
		PanelsTopLeft,
		ArrowDownUp,
		ArrowLeftRight,
		ArrowRight,
		ArrowLeft,
		X,
		Folder,
		FileArchive,
		Menu,
		Minimize,
		Maximize,
		Settings,
		Pin,
		PinOff,
		GripHorizontal,
		ExternalLink,
		Eye,
		Palette,
		Sun,
		Moon,
		Monitor,
		Check
	} from '@lucide/svelte';

	import {
		applyRuntimeThemeFromStorage,
		loadRuntimeThemeFromStorage,
		type RuntimeThemeMode
	} from '$lib/utils/runtimeTheme';

	import { settingsManager } from '$lib/settings/settingsManager';

	const appWindow = getCurrentWebviewWindow();

	function createAppStateStore<T>(selector: StateSelector<T>) {
		const initial = selector(appState.getSnapshot());
		return readable(initial, (set) => appState.subscribe(selector, (value) => set(value)));
	}

	const viewerState = createAppStateStore((state) => state.viewer);

	// 阅读方向状态
	let settings = $state(settingsManager.getSettings());
	let readingDirection = $derived(settings.book.readingDirection);

	// 监听设置变化
	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	type QuickThemeConfig = {
		name: string;
		description?: string;
		colors: {
			light: Record<string, string>;
			dark: Record<string, string>;
		};
	};

	const builtinQuickThemes: QuickThemeConfig[] = [
		{
			name: 'Amethyst Haze',
			description: '优雅的紫色调主题',
			colors: {
				light: {
					primary: 'oklch(0.5569 0.2403 293.3426)',
					background: 'oklch(0.9777 0.0041 301.4256)',
					foreground: 'oklch(0.3651 0.0325 287.0807)'
				},
				dark: {
					primary: 'oklch(0.7137 0.2210 293.5570)',
					background: 'oklch(0.2166 0.0215 292.8474)',
					foreground: 'oklch(0.9053 0.0245 293.5570)'
				}
			}
		},
		{
			name: 'Ocean Breeze',
			description: '清新的海洋蓝主题',
			colors: {
				light: {
					primary: 'oklch(0.5569 0.1803 240.0000)',
					background: 'oklch(0.9777 0.0041 240.0000)',
					foreground: 'oklch(0.3651 0.0325 240.0000)'
				},
				dark: {
					primary: 'oklch(0.7137 0.1610 240.0000)',
					background: 'oklch(0.2166 0.0215 240.0000)',
					foreground: 'oklch(0.9053 0.0245 240.0000)'
				}
			}
		},
		{
			name: 'Forest Mist',
			description: '自然的森林绿主题',
			colors: {
				light: {
					primary: 'oklch(0.5569 0.1803 140.0000)',
					background: 'oklch(0.9777 0.0041 140.0000)',
					foreground: 'oklch(0.3651 0.0325 140.0000)'
				},
				dark: {
					primary: 'oklch(0.7137 0.1610 140.0000)',
					background: 'oklch(0.2166 0.0215 140.0000)',
					foreground: 'oklch(0.9053 0.0245 140.0000)'
				}
			}
		},
		{
			name: 'Sunset Glow',
			description: '温暖的日落橙主题',
			colors: {
				light: {
					primary: 'oklch(0.5569 0.1803 40.0000)',
					background: 'oklch(0.9777 0.0041 40.0000)',
					foreground: 'oklch(0.3651 0.0325 40.0000)'
				},
				dark: {
					primary: 'oklch(0.7137 0.1610 40.0000)',
					background: 'oklch(0.2166 0.0215 40.0000)',
					foreground: 'oklch(0.9053 0.0245 40.0000)'
				}
			}
		}
	];

	let themeMode = $state<RuntimeThemeMode>('system');
	let themeName = $state<string | null>(null);
	let quickThemes = $state<QuickThemeConfig[]>([]);

	function syncQuickThemesFromStorage() {
		if (typeof window === 'undefined') return;

		const merged = new Map<string, QuickThemeConfig>();
		for (const t of builtinQuickThemes) {
			merged.set(t.name, t);
		}

		try {
			const raw = window.localStorage.getItem('custom-themes');
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					for (const item of parsed as QuickThemeConfig[]) {
						if (
							item &&
							typeof item.name === 'string' &&
							item.colors &&
							item.colors.light &&
							item.colors.dark
						) {
							merged.set(item.name, {
								name: item.name,
								description: item.description,
								colors: {
									light: item.colors.light,
									dark: item.colors.dark
								}
							});
						}
					}
				}
			}
		} catch {}

		quickThemes = Array.from(merged.values());
	}

	function applyQuickTheme(theme: QuickThemeConfig) {
		if (typeof window === 'undefined') return;

		const mode: RuntimeThemeMode = themeMode;
		const payload = {
			mode,
			themeName: theme.name,
			themes: theme.colors
		};

		try {
			window.localStorage.setItem('runtime-theme', JSON.stringify(payload));
			window.localStorage.setItem('theme-mode', mode);
			window.localStorage.setItem('theme-name', theme.name);
		} catch {}

		themeName = theme.name;
		applyRuntimeThemeFromStorage();
	}

	function cycleThemeMode() {
		if (typeof window === 'undefined') return;

		const order: RuntimeThemeMode[] = ['light', 'dark', 'system'];
		const index = order.indexOf(themeMode);
		const next = order[(index + 1) % order.length];
		themeMode = next;

		const existing = loadRuntimeThemeFromStorage();
		if (existing) {
			const updated = { ...existing, mode: next };
			try {
				window.localStorage.setItem('runtime-theme', JSON.stringify(updated));
				window.localStorage.setItem('theme-mode', next);
			} catch {}
			applyRuntimeThemeFromStorage();
			return;
		}

		if (typeof document !== 'undefined') {
			const root = document.documentElement;
			const systemPrefersDark =
				typeof window.matchMedia === 'function'
					? window.matchMedia('(prefers-color-scheme: dark)').matches
					: false;
			const isDark = next === 'dark' || (next === 'system' && systemPrefersDark);
			if (isDark) {
				root.classList.add('dark');
			} else {
				root.classList.remove('dark');
			}
			try {
				window.localStorage.setItem('theme-mode', next);
			} catch {}
		}
	}

	onMount(() => {
		if (typeof window === 'undefined') return;

		const payload = loadRuntimeThemeFromStorage();
		if (payload) {
			themeMode = payload.mode;
			themeName = payload.themeName ?? null;
		} else {
			const savedMode = window.localStorage.getItem('theme-mode') as RuntimeThemeMode;
			if (savedMode) {
				themeMode = savedMode;
			}
			themeName = window.localStorage.getItem('theme-name');
		}

		syncQuickThemesFromStorage();

		const handleStorage = (e: StorageEvent) => {
			if (
				e.key === 'runtime-theme' ||
				e.key === 'theme-mode' ||
				e.key === 'theme-name' ||
				e.key === 'custom-themes'
			) {
				const latest = loadRuntimeThemeFromStorage();
				if (latest) {
					themeMode = latest.mode;
					themeName = latest.themeName ?? null;
				} else {
					const saved = window.localStorage.getItem('theme-mode') as RuntimeThemeMode;
					if (saved) {
						themeMode = saved;
					}
					themeName = window.localStorage.getItem('theme-name');
				}

				if (e.key === 'custom-themes') {
					syncQuickThemesFromStorage();
				}
			}
		};

		window.addEventListener('storage', handleStorage);
		return () => window.removeEventListener('storage', handleStorage);
	});

	let isVisible = $state(false);
	let hideTimeout: number | undefined;
	let isResizing = $state(false);
	let resizeStartY = 0;
	let resizeStartHeight = 0;
	let hoverCount = $state(0); // 追踪悬停区域的计数

	// 响应钉住状态
	$effect(() => {
		if ($topToolbarPinned) {
			isVisible = true;
			if (hideTimeout) clearTimeout(hideTimeout);
		}
	});

	function showToolbar() {
		console.log('showToolbar called, setting isVisible to true');
		isVisible = true;
		if (hideTimeout) {
			console.log('Clearing existing timeout');
			clearTimeout(hideTimeout);
		}
		// 不要在这里设置定时器，让 handleMouseLeave 来处理
	}

	function handleMouseEnter() {
		hoverCount++;
		console.log('TopToolbar handleMouseEnter, hoverCount:', hoverCount);
		showToolbar();
	}

	function handleMouseLeave() {
		hoverCount--;
		console.log('TopToolbar handleMouseLeave, hoverCount:', hoverCount);
		if ($topToolbarPinned || isResizing) return;
		if (hideTimeout) clearTimeout(hideTimeout);
		// 只有当计数为0时（即鼠标离开了所有相关区域）才开始延迟隐藏
		if (hoverCount <= 0) {
			console.log('Setting hide timeout for TopToolbar');
			hideTimeout = setTimeout(() => {
				console.log('Timeout triggered, hoverCount:', hoverCount);
				if (hoverCount <= 0) {
					isVisible = false;
				}
			}, 300) as unknown as number;
		}
	}

	function togglePin() {
		topToolbarPinned.update((p) => !p);
	}

	function handlePinContextMenu(e: MouseEvent) {
		e.preventDefault();
		topToolbarPinned.set(false);
		if (hideTimeout) clearTimeout(hideTimeout);
		hoverCount = 0;
		isVisible = false;
	}

	function handleResizeStart(e: MouseEvent) {
		isResizing = true;
		resizeStartY = e.clientY;
		resizeStartHeight = $topToolbarHeight;
		e.preventDefault();
	}

	function handleResizeMove(e: MouseEvent) {
		if (!isResizing) return;
		const deltaY = e.clientY - resizeStartY;
		const newHeight = Math.max(80, Math.min(400, resizeStartHeight + deltaY));
		topToolbarHeight.set(newHeight);
	}

	function handleResizeEnd() {
		isResizing = false;
	}

	$effect(() => {
		if (isResizing) {
			window.addEventListener('mousemove', handleResizeMove);
			window.addEventListener('mouseup', handleResizeEnd);
			return () => {
				window.removeEventListener('mousemove', handleResizeMove);
				window.removeEventListener('mouseup', handleResizeEnd);
			};
		}
	});

	async function handlePreviousPage() {
		if (!bookStore.canPreviousPage) return;
		try {
			if ($viewerState.viewMode === 'double') {
				const currentIndex = bookStore.currentPageIndex;
				const targetIndex = Math.max(currentIndex - 2, 0);
				await bookStore.navigateToPage(targetIndex);
			} else {
				await bookStore.previousPage();
			}
		} catch (err) {
			console.error('Failed to navigate to previous page:', err);
		}
	}

	async function handleNextPage() {
		if (!bookStore.canNextPage) return;
		try {
			if ($viewerState.viewMode === 'double') {
				const currentIndex = bookStore.currentPageIndex;
				const targetIndex = Math.min(currentIndex + 2, bookStore.totalPages - 1);
				await bookStore.navigateToPage(targetIndex);
			} else {
				await bookStore.nextPage();
			}
		} catch (err) {
			console.error('Failed to navigate to next page:', err);
		}
	}

	function handleClose() {
		bookStore.closeBook();
	}

	async function openSettings() {
		try {
			const existingWindow = await WebviewWindow.getByLabel('settings');
			if (existingWindow) {
				await existingWindow.setFocus();
				return;
			}
		} catch (e) {}

		try {
			const settingsWindow = new WebviewWindow('settings', {
				url: '/settings.html',
				title: '设置',
				width: 900,
				height: 700,
				center: true,
				resizable: true,
				decorations: false
			});
		} catch (error) {
			console.error('Failed to create settings window:', error);
		}
	}

	async function minimizeWindow() {
		await appWindow.minimize();
	}

	async function maximizeWindow() {
		await appWindow.toggleMaximize();
	}

	async function closeWindow() {
		await appWindow.close();
	}

	function openStandaloneViewer() {
		const url = `${window.location.origin}/standalone/viewer`;
		const features =
			'width=1200,height=800,resizable=yes,scrollbars=yes,status=yes,toolbar=no,menubar=no,location=no';
		window.open(url, 'NeoView 独立查看器', features);
	}

	function toggleComparisonMode() {
		const nextEnabled = !$viewerState.comparisonVisible;
		const mode = $viewerState.comparisonMode ?? 'slider';
		window.dispatchEvent(
			new CustomEvent('comparison-mode-changed', {
				detail: { enabled: nextEnabled, mode }
			})
		);
	}
</script>

<div
	data-top-toolbar="true"
	class="absolute left-0 right-0 top-0 z-[58] transition-transform duration-300 {isVisible
		? 'translate-y-0'
		: '-translate-y-full'}"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	role="complementary"
	aria-label="顶部工具栏"
	tabindex="-1"
>
	<!-- 标题栏（窗口控制） -->
	<div
		data-tauri-drag-region
		class="bg-sidebar/95 flex h-8 select-none items-center justify-between border-b px-2 backdrop-blur-sm"
	>
		<!-- 左侧：菜单和应用名 -->
		<div class="flex items-center gap-1">
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				onclick={toggleSidebar}
				style="pointer-events: auto;"
			>
				<Menu class="h-4 w-4" />
			</Button>
			<span class="ml-2 text-sm font-semibold">NeoView</span>
		</div>

		<!-- 中间：功能按钮 -->
		<div class="flex items-center gap-1">
			<!-- 钉住按钮 -->
			<Button
				variant={$topToolbarPinned ? 'default' : 'ghost'}
				size="icon"
				class="h-6 w-6"
				style="pointer-events: auto;"
				onclick={togglePin}
				oncontextmenu={handlePinContextMenu}
				title={$topToolbarPinned ? '松开工具栏（自动隐藏）' : '钉住工具栏（始终显示）'}
			>
				{#if $topToolbarPinned}
					<Pin class="h-4 w-4" />
				{:else}
					<PinOff class="h-4 w-4" />
				{/if}
			</Button>

			<!-- 主题模式切换：在浅色 / 深色 / 跟随系统之间循环 -->
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				style="pointer-events: auto;"
				onclick={cycleThemeMode}
				title={`主题模式：${
					themeMode === 'light' ? '浅色' : themeMode === 'dark' ? '深色' : '跟随系统'
				}`}
			>
				{#if themeMode === 'light'}
					<Sun class="h-4 w-4" />
				{:else if themeMode === 'dark'}
					<Moon class="h-4 w-4" />
				{:else}
					<Monitor class="h-4 w-4" />
				{/if}
			</Button>

			<!-- 快速主题切换：预设 + 自定义主题列表 -->
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					<Button
						variant="ghost"
						size="icon"
						class="h-6 w-6"
						style="pointer-events: auto;"
						title={themeName ? `当前主题：${themeName}` : '切换主题'}
					>
						<Palette class="h-4 w-4" />
					</Button>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content
					class="z-60 w-52"
					onmouseenter={handleMouseEnter}
					onmouseleave={handleMouseLeave}
				>
					{#if quickThemes.length}
						<DropdownMenu.Label>主题</DropdownMenu.Label>
						<DropdownMenu.Separator />
						{#each quickThemes as theme}
							<DropdownMenu.Item
								onclick={() => {
									applyQuickTheme(theme);
									handleMouseLeave();
								}}
								class={themeName === theme.name ? 'bg-accent' : ''}
							>
								<div class="flex items-center gap-2">
									<div class="flex h-4 w-4 items-center justify-center">
										{#if themeName === theme.name}
											<Check class="h-3 w-3" />
										{/if}
									</div>
									<div class="flex flex-col gap-0.5">
										<span class="text-xs font-medium leading-tight">{theme.name}</span>
										{#if theme.description}
											<span class="text-muted-foreground line-clamp-1 text-[10px] leading-tight">
												{theme.description}
											</span>
										{/if}
									</div>
								</div>
							</DropdownMenu.Item>
						{/each}
						<DropdownMenu.Separator />
					{/if}
					<DropdownMenu.Item
						onclick={() => {
							openSettings();
							handleMouseLeave();
						}}
					>
						<Settings class="mr-2 h-4 w-4" />
						<span class="text-xs">打开主题设置…</span>
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>

			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				style="pointer-events: auto;"
				onclick={openSettings}
				title="设置"
			>
				<Settings class="h-4 w-4" />
			</Button>

			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				style="pointer-events: auto;"
				onclick={openStandaloneViewer}
				title="在独立窗口中打开查看器"
			>
				<ExternalLink class="h-4 w-4" />
			</Button>
		</div>

		<!-- 右侧：窗口控制按钮 -->
		<div class="flex items-center gap-1">
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				style="pointer-events: auto;"
				onclick={minimizeWindow}
			>
				<Minimize class="h-3 w-3" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6"
				style="pointer-events: auto;"
				onclick={maximizeWindow}
			>
				<Maximize class="h-3 w-3" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="hover:bg-destructive h-6 w-6"
				style="pointer-events: auto;"
				onclick={closeWindow}
			>
				<X class="h-4 w-4" />
			</Button>
		</div>
	</div>

	<!-- 工具栏（图片操作） -->
	<div
		class="bg-sidebar/95 border-b shadow-lg backdrop-blur-sm"
		style="height: {$topToolbarHeight}px;"
	>
		<div class="flex h-full items-center justify-between gap-2 overflow-y-auto px-2 py-1">
			<!-- 左侧：关闭按钮 + 面包屑导航 -->
			<div class="flex min-w-0 flex-1 items-center gap-2">
				<Button variant="ghost" size="icon" class="h-8 w-8 flex-shrink-0" onclick={handleClose}>
					<X class="h-4 w-4" />
				</Button>

				{#if bookStore.currentBook}
					<div class="min-w-0 flex-1">
						<PathBar
							currentPath={bookStore.currentBook.path}
							isArchive={bookStore.currentBook.type === 'archive'}
						/>
					</div>
				{/if}
			</div>

			<!-- 中间：页码信息和进度 -->
			{#if bookStore.currentBook}
				<div class="text-muted-foreground flex items-center gap-3 whitespace-nowrap text-sm">
					{#if bookStore.currentBook.type === 'archive'}
						<FileArchive class="h-3 w-3" />
					{:else}
						<Folder class="h-3 w-3" />
					{/if}
					<span class="font-mono text-xs">
						{bookStore.currentPageIndex + 1} / {bookStore.totalPages}
					</span>
					<!-- progress removed: not needed in top toolbar -->
				</div>
			{/if}

			<!-- 右侧：图片操作按钮 -->
			<div class="flex flex-shrink-0 items-center gap-1">
				<!-- 导航按钮 -->
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8"
							onclick={handlePreviousPage}
							disabled={!bookStore.canPreviousPage}
						>
							<ChevronLeft class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>上一页</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8"
							onclick={handleNextPage}
							disabled={!bookStore.canNextPage}
						>
							<ChevronRight class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>下一页</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<!-- 分隔线 -->
				<Separator.Root orientation="vertical" class="mx-1 h-6" />

				<!-- 缩放按钮 -->
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button variant="ghost" size="icon" class="h-8 w-8" onclick={zoomOut}>
							<ZoomOut class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>缩小</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant="ghost"
							size="sm"
							class="h-8 px-2 font-mono text-xs"
							onclick={resetZoom}
						>
							{($viewerState.zoom * 100).toFixed(0)}%
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>重置缩放</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button variant="ghost" size="icon" class="h-8 w-8" onclick={zoomIn}>
							<ZoomIn class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>放大</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<!-- 分隔线 -->
				<Separator.Root orientation="vertical" class="mx-1 h-6" />

				<!-- 视图模式切换 - 图标列 -->
				<div class="flex items-center">
					<div class="bg-muted/60 inline-flex items-center rounded-full p-0.5 shadow-inner">
						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button
									variant={$viewerState.viewMode === 'panorama' ? 'default' : 'ghost'}
									size="icon"
									class={`h-8 w-8 rounded-full ${$viewerState.lockedViewMode === 'panorama' ? 'ring-primary bg-primary/20 text-primary ring-2' : ''}`}
									onclick={() =>
										setViewMode($viewerState.viewMode === 'panorama' ? 'single' : 'panorama')}
									oncontextmenu={(event) => {
										event.preventDefault();
										toggleViewModeLock('panorama');
									}}
								>
									<PanelsTopLeft class="h-4 w-4" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>全景模式{$viewerState.lockedViewMode === 'panorama' ? '（已锁定）' : ''}</p>
							</Tooltip.Content>
						</Tooltip.Root>

						<!-- 视图方向切换（横/竖），主要影响全景模式的填充方向 -->
						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button
									variant={$viewerState.orientation === 'vertical' ? 'default' : 'ghost'}
									size="icon"
									class="ml-1 h-8 w-8 rounded-full"
									onclick={toggleOrientation}
								>
									{#if $viewerState.orientation === 'horizontal'}
										<ArrowLeftRight class="h-4 w-4" />
									{:else}
										<ArrowDownUp class="h-4 w-4" />
									{/if}
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>
									{$viewerState.orientation === 'horizontal'
										? '横向布局（点击切换为纵向）'
										: '纵向布局（点击切换为横向）'}
								</p>
							</Tooltip.Content>
						</Tooltip.Root>

						<!-- 视图模式切换按钮 -->
						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button
									variant={$viewerState.viewMode === 'double' ? 'default' : 'ghost'}
									size="icon"
									class={`h-8 w-8 rounded-full ${
										$viewerState.lockedViewMode === 'double' ||
										$viewerState.lockedViewMode === 'single'
											? 'ring-primary bg-primary/20 text-primary ring-2'
											: ''
									}`}
									onclick={() =>
										setViewMode($viewerState.viewMode === 'double' ? 'single' : 'double')}
									oncontextmenu={(event) => {
										event.preventDefault();
										const mode = $viewerState.viewMode === 'double' ? 'double' : 'single';
										toggleViewModeLock(mode);
									}}
								>
									{#if $viewerState.viewMode === 'double'}
										<Columns2 class="h-4 w-4" />
									{:else}
										<RectangleVertical class="h-4 w-4" />
									{/if}
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>
									{$viewerState.viewMode === 'double'
										? $viewerState.lockedViewMode === 'double'
											? '双页模式（已锁定）'
											: '双页模式（点击切换为单页）'
										: $viewerState.lockedViewMode === 'single'
											? '单页模式（已锁定）'
											: '单页模式（点击切换为双页）'}
								</p>
							</Tooltip.Content>
						</Tooltip.Root>
					</div>
				</div>

				<!-- 阅读方向切换按钮 -->
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button variant="ghost" size="icon" class="h-8 w-8" onclick={toggleReadingDirection}>
							{#if readingDirection === 'left-to-right'}
								<ArrowRight class="h-4 w-4" />
							{:else}
								<ArrowLeft class="h-4 w-4" />
							{/if}
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>
							{readingDirection === 'left-to-right'
								? '左开模式 (点击切换到右开)'
								: '右开模式 (点击切换到左开)'}
						</p>
					</Tooltip.Content>
				</Tooltip.Root>

				<!-- 分隔线 -->
				<Separator.Root orientation="vertical" class="mx-1 h-6" />

				<!-- 旋转按钮 -->
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button variant="ghost" size="icon" class="h-8 w-8" onclick={rotateClockwise}>
							<RotateCw class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>旋转 90°</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</div>
		</div>

		<!-- 拖拽手柄 -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<button
			type="button"
			class="text-muted-foreground hover:bg-accent absolute bottom-0 left-1/2 z-50 -translate-x-1/2 translate-y-1/2 cursor-ns-resize rounded-md p-1 transition-colors"
			onmousedown={handleResizeStart}
			aria-label="拖拽调整工具栏高度"
		>
			<GripHorizontal class="h-4 w-4" />
		</button>
	</div>
</div>

<!-- 触发区域（独立于工具栏，始终存在） -->
<div
	class="fixed left-0 right-0 top-0 z-[57] h-4"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	role="presentation"
	aria-label="顶部工具栏触发区域"
></div>
