<script lang="ts">
	import { Palette, Sun, Moon, Monitor, Check, Layers } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Slider } from '$lib/components/ui/slider';
	import { onMount } from 'svelte';
	import { fetchThemeFromURL } from '$lib/utils/themeManager';
	import { settingsManager } from '$lib/settings/settingsManager';

	type ThemeMode = 'light' | 'dark' | 'system';

	let currentMode = $state<ThemeMode>('system');
	let systemPrefersDark = $state(false);
	let themeUrl = $state('');
	let sidebarOpacity = $state(settingsManager.getSettings().panels.sidebarOpacity);
	let topToolbarOpacity = $state(settingsManager.getSettings().panels.topToolbarOpacity);
	let bottomBarOpacity = $state(settingsManager.getSettings().panels.bottomBarOpacity);
	let sidebarBlur = $state(settingsManager.getSettings().panels.sidebarBlur ?? 12);
	let topToolbarBlur = $state(settingsManager.getSettings().panels.topToolbarBlur ?? 12);
	let bottomBarBlur = $state(settingsManager.getSettings().panels.bottomBarBlur ?? 12);

	function updateSidebarOpacity(value: number) {
		sidebarOpacity = value;
		settingsManager.updateNestedSettings('panels', { sidebarOpacity: value });
	}
	
	function updateTopToolbarOpacity(value: number) {
		topToolbarOpacity = value;
		settingsManager.updateNestedSettings('panels', { topToolbarOpacity: value });
	}
	
	function updateBottomBarOpacity(value: number) {
		bottomBarOpacity = value;
		settingsManager.updateNestedSettings('panels', { bottomBarOpacity: value });
	}
	
	function updateSidebarBlur(value: number) {
		sidebarBlur = value;
		settingsManager.updateNestedSettings('panels', { sidebarBlur: value });
	}
	
	function updateTopToolbarBlur(value: number) {
		topToolbarBlur = value;
		settingsManager.updateNestedSettings('panels', { topToolbarBlur: value });
	}
	
	function updateBottomBarBlur(value: number) {
		bottomBarBlur = value;
		settingsManager.updateNestedSettings('panels', { bottomBarBlur: value });
	}
	let themeJson = $state('');
	let customThemeName = $state('');
	const placeholderText = '{"name":"My Theme","cssVars":{"theme":{},"light":{},"dark":{}}}';
	let editingVariant = $state<'light' | 'dark'>('light');

	type ThemeColorsVariant = Record<string, string>;

	interface ThemeConfig {
		name: string;
		description: string;
		colors: {
			light: ThemeColorsVariant;
			dark: ThemeColorsVariant;
		};
	}

	// 预设主题颜色方案
	const presetThemes: ThemeConfig[] = [
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

	let selectedTheme = $state<ThemeConfig>(presetThemes[0]);
	let customThemes = $state<ThemeConfig[]>([]);

	// 检测系统主题偏好
	function checkSystemTheme() {
		if (typeof window !== 'undefined') {
			systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		}
	}

	// 应用主题
	function applyTheme(mode: ThemeMode, theme: ThemeConfig) {
		const root = document.documentElement;
		const isDark = mode === 'dark' || (mode === 'system' && systemPrefersDark);

		// 设置 dark class
		if (isDark) {
			root.classList.add('dark');
		} else {
			root.classList.remove('dark');
		}

		// 应用颜色
		const colors = isDark ? theme.colors.dark : theme.colors.light;
		for (const [key, value] of Object.entries(colors)) {
			if (typeof value === 'string') {
				root.style.setProperty(`--${key}`, value);
			}
		}

		try {
			localStorage.setItem('theme-mode', mode);
			localStorage.setItem('theme-name', theme.name);
			localStorage.setItem(
				'runtime-theme',
				JSON.stringify({
					mode,
					themeName: theme.name,
					themes: theme.colors
				})
			);
		} catch {}
	}

	// 切换主题模式
	function setThemeMode(mode: ThemeMode) {
		currentMode = mode;
		applyTheme(mode, selectedTheme);
	}

	// 选择预设主题
	function selectPresetTheme(theme: ThemeConfig) {
		selectedTheme = theme;
		applyTheme(currentMode, theme);
	}

	function persistCustomThemes() {
		try {
			localStorage.setItem('custom-themes', JSON.stringify(customThemes));
		} catch {}
	}

	function addCustomTheme(theme: ThemeConfig) {
		const index = customThemes.findIndex((t) => t.name === theme.name);
		if (index >= 0) {
			customThemes = [
				...customThemes.slice(0, index),
				theme,
				...customThemes.slice(index + 1)
			];
		} else {
			customThemes = [...customThemes, theme];
		}
		persistCustomThemes();
	}

	function saveCurrentThemeAsCustom() {
		const name = (customThemeName || selectedTheme.name || '自定义主题').trim();
		const theme: ThemeConfig = {
			name,
			description: '自定义主题',
			colors: {
				light: { ...selectedTheme.colors.light },
				dark: { ...selectedTheme.colors.dark }
			}
		};
		addCustomTheme(theme);
		customThemeName = name;
		selectedTheme = theme;
		applyTheme(currentMode, selectedTheme);
	}

	function updateThemeColor(variant: 'light' | 'dark', key: string, value: string) {
		const baseColors = selectedTheme.colors[variant] || {};
		const newVariantColors = { ...baseColors, [key]: value };
		const newTheme: ThemeConfig = {
			...selectedTheme,
			colors: {
				...selectedTheme.colors,
				[variant]: newVariantColors
			}
		};

		const presetIndex = presetThemes.findIndex((t) => t.name === selectedTheme.name);
		if (presetIndex !== -1) {
			(presetThemes as any)[presetIndex] = newTheme;
		} else {
			const customIndex = customThemes.findIndex((t) => t.name === selectedTheme.name);
			if (customIndex !== -1) {
				customThemes = [
					...customThemes.slice(0, customIndex),
					newTheme,
					...customThemes.slice(customIndex + 1)
				];
				persistCustomThemes();
			}
		}

		selectedTheme = newTheme;
		applyTheme(currentMode, newTheme);
	}

	async function importThemeFromUrl() {
		if (!themeUrl) return;
		try {
			const theme = await fetchThemeFromURL(themeUrl);
			const base = theme.cssVars.theme ?? {};
			const light = { ...base, ...theme.cssVars.light };
			const dark = { ...base, ...theme.cssVars.dark };
			const importedTheme: ThemeConfig = {
				name: theme.name || 'Custom Theme',
				description: '来自 tweakcn 的主题',
				colors: {
					light,
					dark
				}
			};
			addCustomTheme(importedTheme);
			selectedTheme = importedTheme;
			applyTheme(currentMode, selectedTheme);
		} catch (error) {
			console.error('导入主题失败', error);
		}
	}

	async function importThemeFromJson() {
		const raw = themeJson.trim();
		if (!raw) return;
		try {
			const parsed = JSON.parse(raw) as {
				name?: string;
				cssVars?: {
					light?: Record<string, string>;
					dark?: Record<string, string>;
					theme?: Record<string, string>;
				};
			};
			if (!parsed || !parsed.cssVars || !parsed.cssVars.light || !parsed.cssVars.dark) {
				console.error('JSON 格式不正确，缺少 cssVars.light / cssVars.dark');
				return;
			}
			const base = parsed.cssVars.theme ?? {};
			const light = { ...base, ...parsed.cssVars.light };
			const dark = { ...base, ...parsed.cssVars.dark };
			const importedTheme: ThemeConfig = {
				name: parsed.name || 'Custom Theme',
				description: '来自 JSON 的主题',
				colors: {
					light,
					dark
				}
			};
			addCustomTheme(importedTheme);
			selectedTheme = importedTheme;
			applyTheme(currentMode, selectedTheme);
		} catch (error) {
			console.error('从 JSON 导入主题失败', error);
		}
	}

	// 监听系统主题变化
	onMount(() => {
		checkSystemTheme();

		try {
			const rawCustom = localStorage.getItem('custom-themes');
			if (rawCustom) {
				const parsed = JSON.parse(rawCustom);
				if (Array.isArray(parsed)) {
					customThemes = parsed as ThemeConfig[];
				}
			}
		} catch {}

		// 从 localStorage 加载保存的设置
		const savedMode = localStorage.getItem('theme-mode') as ThemeMode;
		const savedThemeName = localStorage.getItem('theme-name');

		if (savedMode) {
			currentMode = savedMode;
		}

		if (savedThemeName) {
			let theme = presetThemes.find((t) => t.name === savedThemeName) as
				| ThemeConfig
				| undefined;
			if (!theme) {
				theme = customThemes.find((t) => t.name === savedThemeName);
			}
			if (theme) {
				selectedTheme = theme;
			}
		}

		// 应用主题
		applyTheme(currentMode, selectedTheme);

		// 监听系统主题变化
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const handleChange = (e: MediaQueryListEvent) => {
			systemPrefersDark = e.matches;
			if (currentMode === 'system') {
				applyTheme('system', selectedTheme);
			}
		};

		mediaQuery.addEventListener('change', handleChange);
		return () => mediaQuery.removeEventListener('change', handleChange);
	});
</script>

<div class="space-y-6 p-6">
	<!-- 标题 -->
	<div class="space-y-2">
		<h3 class="flex items-center gap-2 text-lg font-semibold">
			<Palette class="h-5 w-5" />
			主题设置
		</h3>
		<p class="text-muted-foreground text-sm">自定义应用的外观和颜色</p>
	</div>

	<!-- 主题模式选择 -->
	<div class="space-y-3">
		<Label class="text-sm font-semibold">主题模式</Label>
		<div class="grid grid-cols-3 gap-3">
			<button
				onclick={() => setThemeMode('light')}
				class="hover:bg-accent flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors {currentMode ===
				'light'
					? 'border-primary bg-primary/5'
					: ''}"
			>
				<Sun class="h-6 w-6" />
				<span class="text-sm font-medium">浅色</span>
				{#if currentMode === 'light'}
					<Check class="text-primary h-4 w-4" />
				{/if}
			</button>

			<button
				onclick={() => setThemeMode('dark')}
				class="hover:bg-accent flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors {currentMode ===
				'dark'
					? 'border-primary bg-primary/5'
					: ''}"
			>
				<Moon class="h-6 w-6" />
				<span class="text-sm font-medium">深色</span>
				{#if currentMode === 'dark'}
					<Check class="text-primary h-4 w-4" />
				{/if}
			</button>

			<button
				onclick={() => setThemeMode('system')}
				class="hover:bg-accent flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors {currentMode ===
				'system'
					? 'border-primary bg-primary/5'
					: ''}"
			>
				<Monitor class="h-6 w-6" />
				<span class="text-sm font-medium">跟随系统</span>
				{#if currentMode === 'system'}
					<Check class="text-primary h-4 w-4" />
				{/if}
			</button>
		</div>
		{#if currentMode === 'system'}
			<p class="text-muted-foreground text-xs">
				当前系统偏好: {systemPrefersDark ? '深色' : '浅色'}
			</p>
		{/if}
	</div>

	<!-- 侧边栏透明度 -->
	<div class="space-y-3">
		<Label class="text-sm font-semibold flex items-center gap-2">
			<Layers class="h-4 w-4" />
			侧边栏透明度
		</Label>
		<div class="flex items-center gap-4">
			<Slider
				type="single"
				value={sidebarOpacity}
				min={50}
				max={100}
				step={5}
				class="flex-1"
				onValueChange={updateSidebarOpacity}
			/>
			<span class="text-sm text-muted-foreground w-12 text-right">{sidebarOpacity}%</span>
		</div>
		<p class="text-muted-foreground text-xs">
			调整侧边栏和面板的背景透明度，数值越低越透明
		</p>
	</div>

	<!-- 顶部工具栏透明度 -->
	<div class="space-y-3">
		<Label class="text-sm font-semibold">顶部工具栏透明度</Label>
		<div class="flex items-center gap-4">
			<Slider
				type="single"
				value={topToolbarOpacity}
				min={50}
				max={100}
				step={5}
				class="flex-1"
				onValueChange={updateTopToolbarOpacity}
			/>
			<span class="text-sm text-muted-foreground w-12 text-right">{topToolbarOpacity}%</span>
		</div>
	</div>

	<!-- 底部缩略图栏透明度 -->
	<div class="space-y-3">
		<Label class="text-sm font-semibold">底部缩略图栏透明度</Label>
		<div class="flex items-center gap-4">
			<Slider
				type="single"
				value={bottomBarOpacity}
				min={50}
				max={100}
				step={5}
				class="flex-1"
				onValueChange={updateBottomBarOpacity}
			/>
			<span class="text-sm text-muted-foreground w-12 text-right">{bottomBarOpacity}%</span>
		</div>
	</div>

	<!-- 模糊程度设置 -->
	<div class="space-y-4 pt-2 border-t">
		<h4 class="text-sm font-semibold">模糊程度</h4>
		
		<div class="space-y-3">
			<Label class="text-sm">侧边栏模糊</Label>
			<div class="flex items-center gap-4">
				<Slider
					type="single"
					value={sidebarBlur}
					min={0}
					max={20}
					step={2}
					class="flex-1"
					onValueChange={updateSidebarBlur}
				/>
				<span class="text-sm text-muted-foreground w-12 text-right">{sidebarBlur}px</span>
			</div>
		</div>

		<div class="space-y-3">
			<Label class="text-sm">顶部工具栏模糊</Label>
			<div class="flex items-center gap-4">
				<Slider
					type="single"
					value={topToolbarBlur}
					min={0}
					max={20}
					step={2}
					class="flex-1"
					onValueChange={updateTopToolbarBlur}
				/>
				<span class="text-sm text-muted-foreground w-12 text-right">{topToolbarBlur}px</span>
			</div>
		</div>

		<div class="space-y-3">
			<Label class="text-sm">底部缩略图栏模糊</Label>
			<div class="flex items-center gap-4">
				<Slider
					type="single"
					value={bottomBarBlur}
					min={0}
					max={20}
					step={2}
					class="flex-1"
					onValueChange={updateBottomBarBlur}
				/>
				<span class="text-sm text-muted-foreground w-12 text-right">{bottomBarBlur}px</span>
			</div>
		</div>
	</div>

	<!-- 预设主题 -->
	<div class="space-y-3">
		<Label class="text-sm font-semibold">配色方案</Label>
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			{#each presetThemes as theme}
				<button
					onclick={() => selectPresetTheme(theme)}
					class="hover:bg-accent flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors {selectedTheme.name ===
					theme.name
						? 'border-primary bg-primary/5'
						: ''}"
				>
					<div class="flex w-full items-center justify-between">
						<h4 class="font-medium">{theme.name}</h4>
						{#if selectedTheme.name === theme.name}
							<Check class="text-primary h-4 w-4" />
						{/if}
					</div>
					<p class="text-muted-foreground text-sm">{theme.description}</p>

					<!-- 颜色预览 -->
					<div class="mt-2 flex gap-2">
						<div
							class="h-6 w-6 rounded-full border"
							style="background: {theme.colors.light.primary}"
							title="浅色主色"
						></div>
						<div
							class="h-6 w-6 rounded-full border"
							style="background: {theme.colors.dark.primary}"
							title="深色主色"
						></div>
					</div>
				</button>
			{/each}
		</div>
	</div>

	{#if customThemes.length}
		<div class="space-y-3">
			<Label class="text-sm font-semibold">自定义主题</Label>
			<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
				{#each customThemes as theme}
					<button
						onclick={() => selectPresetTheme(theme)}
						class="hover:bg-accent flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors {selectedTheme.name ===
						theme.name
							? 'border-primary bg-primary/5'
							: ''}"
					>
						<div class="flex w-full items-center justify-between">
							<h4 class="font-medium">{theme.name}</h4>
							{#if selectedTheme.name === theme.name}
								<Check class="text-primary h-4 w-4" />
							{/if}
						</div>
						<p class="text-muted-foreground text-sm">{theme.description}</p>

						<div class="mt-2 flex gap-2">
							<div
								class="h-6 w-6 rounded-full border"
								style="background: {theme.colors.light.primary}"
								title="浅色主色"
							></div>
							<div
								class="h-6 w-6 rounded-full border"
								style="background: {theme.colors.dark.primary}"
								title="深色主色"
							></div>
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="space-y-3">
		<Label class="text-sm font-semibold">保存当前主题</Label>
		<div class="flex gap-2">
			<Input
				placeholder="自定义主题名称"
				bind:value={customThemeName}
			/>
			<Button size="sm" onclick={saveCurrentThemeAsCustom}>保存</Button>
		</div>
	</div>

	<div class="space-y-3">
		<Label class="text-sm font-semibold">从 URL 导入主题</Label>
		<div class="flex gap-2">
			<Input
				placeholder="https://tweakcn.com/r/themes/perpetuity.json"
				bind:value={themeUrl}
			/>
			<Button size="sm" onclick={importThemeFromUrl}>导入</Button>
		</div>
	</div>

	<div class="space-y-3">
		<Label class="text-sm font-semibold">从 JSON 导入主题</Label>
		<div class="flex flex-col gap-2">
			<textarea
				class="font-mono text-xs bg-muted/50 rounded-md border p-2 min-h-[120px] resize-y outline-none focus-visible:ring-1 focus-visible:ring-ring"
				bind:value={themeJson}
				placeholder={placeholderText}
			></textarea>
			<div class="flex justify-end">
				<Button size="sm" onclick={importThemeFromJson}>导入 JSON</Button>
			</div>
		</div>
	</div>

	<!-- 当前主题预览 -->
	<div class="space-y-3">
		<Label class="text-sm font-semibold">颜色预览</Label>
		<div class="grid grid-cols-2 gap-3">
			<div class="bg-primary text-primary-foreground rounded-lg border p-3">
				<p class="text-sm font-medium">Primary</p>
			</div>
			<div class="bg-secondary text-secondary-foreground rounded-lg border p-3">
				<p class="text-sm font-medium">Secondary</p>
			</div>
			<div class="bg-accent text-accent-foreground rounded-lg border p-3">
				<p class="text-sm font-medium">Accent</p>
			</div>
			<div class="bg-muted text-muted-foreground rounded-lg border p-3">
				<p class="text-sm font-medium">Muted</p>
			</div>
		</div>
	</div>

	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<Label class="text-sm font-semibold">详细颜色</Label>
			<div class="inline-flex gap-2 rounded-md border p-1">
				<Button
					size="sm"
					variant={editingVariant === 'light' ? 'default' : 'ghost'}
					onclick={() => (editingVariant = 'light')}
				>
					浅色
				</Button>
				<Button
					size="sm"
					variant={editingVariant === 'dark' ? 'default' : 'ghost'}
					onclick={() => (editingVariant = 'dark')}
				>
					深色
				</Button>
			</div>
		</div>
		<div class="grid gap-2 md:grid-cols-2">
			{#each Object.entries(selectedTheme.colors[editingVariant] || {}) as [key, value]}
				<div class="flex items-center gap-3 rounded-md border px-3 py-2">
					<div
						class="h-6 w-6 rounded border"
						style="background: {value}"
						title={key}
					></div>
					<div class="flex-1 space-y-1">
						<div class="text-xs font-medium">{key}</div>
						<Input
							value={value}
							on:input={(e) =>
								updateThemeColor(editingVariant, key, e.currentTarget.value)}
						/>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- 提示信息 -->
	<div class="border-primary/20 bg-primary/5 rounded-lg border p-4">
		<p class="text-sm">
			<strong>💡 提示:</strong> 主题设置会自动保存,下次打开应用时会自动应用。
		</p>
	</div>
</div>
