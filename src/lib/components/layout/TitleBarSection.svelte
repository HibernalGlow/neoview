<script lang="ts">
	/**
	 * 标题栏区域组件
	 * 包含窗口控制、主题切换、钉住按钮等
	 */
	import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { openSettingsOverlay } from '$lib/stores/settingsOverlay.svelte';
	import {
		topToolbarPinned,
		bottomThumbnailBarPinned,
		leftSidebarPinned,
		rightSidebarPinned,
		leftSidebarOpen,
		rightSidebarOpen
	} from '$lib/stores/ui.svelte';
	import { showToast } from '$lib/utils/toast';
	import { settingsManager } from '$lib/settings/settingsManager';
	import {
		loadRuntimeThemeFromStorage,
		applyRuntimeThemeFromStorage,
		type RuntimeThemeMode
	} from '$lib/utils/runtimeTheme';
	import { onMount } from 'svelte';
	import {
		Menu,
		Pin,
		PinOff,
		Sun,
		Moon,
		Monitor,
		Palette,
		Settings,
		Layers,
		Square,
		Minimize,
		Maximize,
		X,
		Check,
		Zap,
		HardDrive,
		Image,
		PaintbrushVertical,
		PanelTop,
		PanelBottom,
		PanelLeft,
		PanelRight
	} from '@lucide/svelte';
	import { loadModeStore } from '$lib/stores/loadModeStore.svelte';

	// Props
	interface Props {
		opacity?: number;
		blur?: number;
		onMouseEnter?: () => void;
		onMouseLeave?: () => void;
		onPinContextMenu?: (e: MouseEvent) => void;
	}
	let { opacity = 85, blur = 12, onMouseEnter, onMouseLeave, onPinContextMenu }: Props = $props();

	const appWindow = getCurrentWebviewWindow();

	// 设置状态
	let settings = $state(settingsManager.getSettings());
	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	// 渲染器模式
	let rendererMode = $derived(settings.view.renderer?.mode ?? 'stack');
	function toggleRendererMode() {
		const newMode = rendererMode === 'stack' ? 'standard' : 'stack';
		settingsManager.updateNestedSettings('view', {
			renderer: {
				...settings.view.renderer,
				mode: newMode
			}
		});
		showToast({
			title: '渲染模式',
			description:
				newMode === 'stack' ? '已切换到 StackViewer（槽位系统）' : '已切换到 Layer 系统（标准）',
			variant: 'info',
			duration: 2000
		});
	}

	// 主题相关
	interface QuickThemeConfig {
		name: string;
		description?: string;
		colors: {
			light: Record<string, string>;
			dark: Record<string, string>;
		};
	}

	const builtinQuickThemes: QuickThemeConfig[] = [
		{
			name: '默认',
			description: '简洁的黑白灰配色',
			colors: {
				light: {
					primary: 'oklch(0.205 0 0)',
					background: 'oklch(1 0 0)',
					foreground: 'oklch(0.145 0 0)'
				},
				dark: {
					primary: 'oklch(0.922 0 0)',
					background: 'oklch(0.145 0 0)',
					foreground: 'oklch(0.985 0 0)'
				}
			}
		},
		{
			name: '橙',
			description: '温暖的橙色调',
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
						if (item?.name && item.colors?.light && item.colors?.dark) {
							merged.set(item.name, item);
						}
					}
				}
			}
		} catch {}
		quickThemes = Array.from(merged.values());
	}

	function applyQuickTheme(theme: QuickThemeConfig) {
		if (typeof window === 'undefined') return;
		const payload = {
			mode: themeMode,
			themeName: theme.name,
			themes: theme.colors
		};
		try {
			window.localStorage.setItem('runtime-theme', JSON.stringify(payload));
			window.localStorage.setItem('theme-mode', themeMode);
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

	function togglePin() {
		topToolbarPinned.update((v) => !v);
	}

	// 边栏控制函数
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

	function handlePinContextMenu(e: MouseEvent) {
		e.preventDefault();
		if (onPinContextMenu) {
			onPinContextMenu(e);
		} else {
			// 默认行为：取消钉住顶栏
			topToolbarPinned.set(false);
		}
	}

	function openSettings() {
		openSettingsOverlay();
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

	onMount(() => {
		if (typeof window === 'undefined') return;
		const payload = loadRuntimeThemeFromStorage();
		if (payload) {
			themeMode = payload.mode;
			themeName = payload.themeName ?? null;
		} else {
			const savedMode = window.localStorage.getItem('theme-mode') as RuntimeThemeMode;
			if (savedMode) themeMode = savedMode;
			themeName = window.localStorage.getItem('theme-name');
		}
		syncQuickThemesFromStorage();

		const handleStorage = (e: StorageEvent) => {
			if (['runtime-theme', 'theme-mode', 'theme-name', 'custom-themes'].includes(e.key ?? '')) {
				const latest = loadRuntimeThemeFromStorage();
				if (latest) {
					themeMode = latest.mode;
					themeName = latest.themeName ?? null;
				}
				if (e.key === 'custom-themes') {
					syncQuickThemesFromStorage();
				}
			}
		};
		window.addEventListener('storage', handleStorage);
		return () => window.removeEventListener('storage', handleStorage);
	});
</script>

<div
	data-tauri-drag-region
	class="flex h-8 select-none items-center justify-between border-b px-2"
	style="background-color: color-mix(in oklch, var(--sidebar) {opacity}%, transparent); color: var(--sidebar-foreground); backdrop-filter: blur({blur}px);"
>
	<!-- 左侧：四边栏控制和应用名 -->
	<div class="flex items-center gap-0.5">
		<!-- 上边栏 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={$topToolbarPinned ? 'default' : 'ghost'}
					size="icon"
					class="h-5 w-5"
					style="pointer-events: auto;"
					onclick={toggleTopPinned}
				>
					<PanelTop class="h-3 w-3" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>顶栏{$topToolbarPinned ? '（已固定）' : '（自动隐藏）'}</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<!-- 下边栏 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={$bottomThumbnailBarPinned ? 'default' : 'ghost'}
					size="icon"
					class="h-5 w-5"
					style="pointer-events: auto;"
					onclick={toggleBottomPinned}
				>
					<PanelBottom class="h-3 w-3" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>底栏{$bottomThumbnailBarPinned ? '（已固定）' : '（自动隐藏）'}</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<!-- 左边栏 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={$leftSidebarPinned ? 'default' : ($leftSidebarOpen ? 'secondary' : 'ghost')}
					size="icon"
					class="h-5 w-5"
					style="pointer-events: auto;"
					onclick={toggleLeftOpen}
					oncontextmenu={(e: MouseEvent) => { e.preventDefault(); toggleLeftPinned(); }}
				>
					<PanelLeft class="h-3 w-3" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>左栏{$leftSidebarPinned ? '（已固定）' : $leftSidebarOpen ? '（已打开）' : '（已关闭）'}</p>
				<p class="text-muted-foreground text-xs">右键切换固定</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<!-- 右边栏 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={$rightSidebarPinned ? 'default' : ($rightSidebarOpen ? 'secondary' : 'ghost')}
					size="icon"
					class="h-5 w-5"
					style="pointer-events: auto;"
					onclick={toggleRightOpen}
					oncontextmenu={(e: MouseEvent) => { e.preventDefault(); toggleRightPinned(); }}
				>
					<PanelRight class="h-3 w-3" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>右栏{$rightSidebarPinned ? '（已固定）' : $rightSidebarOpen ? '（已打开）' : '（已关闭）'}</p>
				<p class="text-muted-foreground text-xs">右键切换固定</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<span class="ml-2 text-sm font-semibold">NeoView</span>
	</div>

	<!-- 中间：功能按钮 -->
	<div class="flex items-center gap-1">
		<!-- 钉住按钮 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={$topToolbarPinned ? 'default' : 'ghost'}
					size="icon"
					class="h-6 w-6"
					style="pointer-events: auto;"
					onclick={togglePin}
					oncontextmenu={handlePinContextMenu}
				>
					{#if $topToolbarPinned}
						<Pin class="h-4 w-4" />
					{:else}
						<PinOff class="h-4 w-4" />
					{/if}
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{$topToolbarPinned ? '松开工具栏（自动隐藏）' : '钉住工具栏（始终显示）'}</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<!-- 主题模式切换 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant="ghost"
					size="icon"
					class="h-6 w-6"
					style="pointer-events: auto;"
					onclick={cycleThemeMode}
				>
					{#if themeMode === 'light'}
						<Sun class="h-4 w-4" />
					{:else if themeMode === 'dark'}
						<Moon class="h-4 w-4" />
					{:else}
						<Monitor class="h-4 w-4" />
					{/if}
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>
					主题模式：{themeMode === 'light' ? '浅色' : themeMode === 'dark' ? '深色' : '跟随系统'}
				</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<!-- 快速主题切换 -->
		<DropdownMenu.Root>
			<Tooltip.Root>
				<Tooltip.Trigger>
					<DropdownMenu.Trigger>
						<Button variant="ghost" size="icon" class="h-6 w-6" style="pointer-events: auto;">
							<Palette class="h-4 w-4" />
						</Button>
					</DropdownMenu.Trigger>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>{themeName ? `当前主题：${themeName}` : '切换主题'}</p>
				</Tooltip.Content>
			</Tooltip.Root>
			<DropdownMenu.Content
				class="z-60 w-52"
				onmouseenter={onMouseEnter}
				onmouseleave={onMouseLeave}
			>
				{#if quickThemes.length}
					<DropdownMenu.Label>主题</DropdownMenu.Label>
					<DropdownMenu.Separator />
					{#each quickThemes as theme}
						<DropdownMenu.Item
							onclick={() => {
								applyQuickTheme(theme);
								onMouseLeave?.();
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
						onMouseLeave?.();
					}}
				>
					<Settings class="mr-2 h-4 w-4" />
					<span class="text-xs">打开主题设置…</span>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<!-- 设置按钮 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant="ghost"
					size="icon"
					class="h-6 w-6"
					style="pointer-events: auto;"
					onclick={openSettings}
				>
					<Settings class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>设置</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<!-- 渲染器模式切换（弹出菜单） -->
		<DropdownMenu.Root>
			<Tooltip.Root>
				<Tooltip.Trigger>
					<DropdownMenu.Trigger>
						<Button
							variant={rendererMode === 'stack' ? 'default' : 'ghost'}
							size="icon"
							class="h-6 w-6"
							style="pointer-events: auto;"
						>
							{#if rendererMode === 'stack'}
								<Layers class="h-4 w-4" />
							{:else}
								<Square class="h-4 w-4" />
							{/if}
						</Button>
					</DropdownMenu.Trigger>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>渲染设置</p>
				</Tooltip.Content>
			</Tooltip.Root>

			<DropdownMenu.Content side="bottom" align="end" class="w-56">
				<DropdownMenu.Label>渲染器模式</DropdownMenu.Label>
				<DropdownMenu.Item onclick={toggleRendererMode}>
					<div class="flex w-full items-center justify-between">
						<div class="flex items-center gap-2">
							{#if rendererMode === 'stack'}
								<Layers class="h-4 w-4" />
								<span>StackViewer（槽位）</span>
							{:else}
								<Square class="h-4 w-4" />
								<span>Layer 系统（标准）</span>
							{/if}
						</div>
						<span class="text-muted-foreground text-xs">点击切换</span>
					</div>
				</DropdownMenu.Item>

				<DropdownMenu.Separator />
				<DropdownMenu.Label>数据源</DropdownMenu.Label>
				<DropdownMenu.Item onclick={() => loadModeStore.toggleDataSource()}>
					<div class="flex w-full items-center justify-between">
						<div class="flex items-center gap-2">
							{#if loadModeStore.isBlobMode}
								<Zap class="h-4 w-4" />
								<span>Blob (IPC)</span>
							{:else}
								<HardDrive class="h-4 w-4" />
								<span>Tempfile</span>
							{/if}
						</div>
						<span class="text-muted-foreground text-xs">点击切换</span>
					</div>
				</DropdownMenu.Item>

				<DropdownMenu.Separator />
				<DropdownMenu.Label>渲染方式</DropdownMenu.Label>
				<DropdownMenu.Item onclick={() => loadModeStore.toggleRenderMode()}>
					<div class="flex w-full items-center justify-between">
						<div class="flex items-center gap-2">
							{#if loadModeStore.isImgMode}
								<Image class="h-4 w-4" />
								<span>img 元素</span>
							{:else}
								<PaintbrushVertical class="h-4 w-4" />
								<span>canvas</span>
							{/if}
						</div>
						<span class="text-muted-foreground text-xs">点击切换</span>
					</div>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
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
