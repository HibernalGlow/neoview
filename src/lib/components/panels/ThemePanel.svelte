<script lang="ts">
	import {
		Palette,
		Sun,
		Moon,
		Monitor,
		Check,
		Layers,
		Copy,
		Trash2,
		ChevronDown,
		ChevronRight
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Slider } from '$lib/components/ui/slider';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { fetchThemeFromURL } from '$lib/utils/themeManager';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { emit } from '@tauri-apps/api/event';

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
	let settingsOpacity = $state(settingsManager.getSettings().panels.settingsOpacity ?? 85);
	let settingsBlur = $state(settingsManager.getSettings().panels.settingsBlur ?? 12);

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

	function updateSettingsOpacity(value: number) {
		settingsOpacity = value;
		settingsManager.updateNestedSettings('panels', { settingsOpacity: value });
	}

	function updateSettingsBlur(value: number) {
		settingsBlur = value;
		settingsManager.updateNestedSettings('panels', { settingsBlur: value });
	}

	// 字体设置
	import {
		applyFontSettings,
		broadcastFontSettings,
		type FontSettings
	} from '$lib/utils/fontManager';
	import { Type, Plus, X } from '@lucide/svelte';
	import Switch from '$lib/components/ui/switch/switch.svelte';

	let fontSettings = $state<FontSettings>({
		enabled: false,
		fontFamilies: [],
		uiFontFamilies: [],
		monoFontFamilies: []
	});
	let newMainFont = $state('');
	let newMonoFont = $state('');

	function loadFontSettings() {
		const settings = settingsManager.getSettings().theme.customFont;
		fontSettings = { ...settings };
	}

	function saveFontSettings() {
		settingsManager.updateNestedSettings('theme', {
			customFont: { ...fontSettings }
		});
		applyFontSettings(fontSettings);
		broadcastFontSettings(fontSettings);
	}

	function toggleFontEnabled(enabled: boolean) {
		fontSettings.enabled = enabled;
		saveFontSettings();
	}

	function addMainFont() {
		if (newMainFont.trim() && !fontSettings.fontFamilies.includes(newMainFont.trim())) {
			fontSettings.fontFamilies = [...fontSettings.fontFamilies, newMainFont.trim()];
			newMainFont = '';
			saveFontSettings();
		}
	}

	function removeMainFont(font: string) {
		fontSettings.fontFamilies = fontSettings.fontFamilies.filter((f) => f !== font);
		saveFontSettings();
	}

	function addMonoFont() {
		if (newMonoFont.trim() && !fontSettings.monoFontFamilies.includes(newMonoFont.trim())) {
			fontSettings.monoFontFamilies = [...fontSettings.monoFontFamilies, newMonoFont.trim()];
			newMonoFont = '';
			saveFontSettings();
		}
	}

	function removeMonoFont(font: string) {
		fontSettings.monoFontFamilies = fontSettings.monoFontFamilies.filter((f) => f !== font);
		saveFontSettings();
	}

	let themeJson = $state('');
	let customThemeName = $state('');
	const placeholderText =
		'JSON 或 CSS 格式\n\nJSON: {"name":"...","cssVars":{...}}\n\nCSS:\n:root {\n  --background: ...;\n}';
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

	let isPresetsOpen = $state(false);
	let isCustomThemesOpen = $state(false);

	// 导出单个主题为 JSON 并复制到剪贴板
	function exportTheme(theme: ThemeConfig, e: MouseEvent) {
		e.stopPropagation();
		const exportData = {
			name: theme.name,
			description: theme.description,
			cssVars: {
				light: theme.colors.light,
				dark: theme.colors.dark
			}
		};
		const json = JSON.stringify(exportData, null, 2);
		navigator.clipboard.writeText(json).then(() => {
			// 可以添加一个 toast 提示
			console.log('主题已复制到剪贴板');
		});
	}

	// 导出所有自定义主题为 JSON 并复制到剪贴板
	function exportAllThemes() {
		const exportData = customThemes.map((theme) => ({
			name: theme.name,
			description: theme.description,
			cssVars: {
				light: theme.colors.light,
				dark: theme.colors.dark
			}
		}));
		const json = JSON.stringify(exportData, null, 2);
		navigator.clipboard.writeText(json).then(() => {
			console.log('所有主题已复制到剪贴板');
		});
	}

	// 从剪贴板导入所有主题
	async function importAllThemes() {
		try {
			const text = await navigator.clipboard.readText();
			const parsed = JSON.parse(text);
			const themes = Array.isArray(parsed) ? parsed : [parsed];
			let importedCount = 0;
			for (const item of themes) {
				if (item.cssVars && (item.cssVars.light || item.cssVars.dark)) {
					const base = item.cssVars.theme ?? {};
					const light = { ...base, ...(item.cssVars.light ?? {}) };
					const dark = { ...base, ...(item.cssVars.dark ?? item.cssVars.light ?? {}) };
					const importedTheme: ThemeConfig = {
						name: item.name || `导入主题 ${importedCount + 1}`,
						description: item.description || '导入的主题',
						colors: { light, dark }
					};
					addCustomTheme(importedTheme);
					importedCount++;
				}
			}
			if (importedCount > 0) {
				console.log(`成功导入 ${importedCount} 个主题`);
			}
		} catch (e) {
			console.error('导入主题失败', e);
		}
	}

	function deleteCustomTheme(theme: ThemeConfig, e: MouseEvent) {
		e.stopPropagation();
		if (selectedTheme.name === theme.name) {
			selectPresetTheme(presetThemes[0]);
		}
		customThemes = customThemes.filter((t) => t.name !== theme.name);
		persistCustomThemes();
	}

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
			const runtimeThemePayload = {
				mode,
				themeName: theme.name,
				themes: theme.colors
			};
			localStorage.setItem('theme-mode', mode);
			localStorage.setItem('theme-name', theme.name);
			localStorage.setItem('runtime-theme', JSON.stringify(runtimeThemePayload));

			// 通过 Tauri 事件广播主题变更到所有窗口
			emit('theme-changed', runtimeThemePayload).catch(() => {});
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
			customThemes = [...customThemes.slice(0, index), theme, ...customThemes.slice(index + 1)];
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

	function parseCssTheme(css: string) {
		const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
		const light: Record<string, string> = {};
		const dark: Record<string, string> = {};

		const parseVars = (str: string, target: Record<string, string>) => {
			const regex = /--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
			let match;
			while ((match = regex.exec(str)) !== null) {
				target[match[1]] = match[2].trim();
			}
		};

		const rootMatch = cleanCss.match(/:root\s*{([^}]*)}/);
		if (rootMatch) parseVars(rootMatch[1], light);

		const darkMatch = cleanCss.match(/\.dark\s*{([^}]*)}/);
		if (darkMatch) parseVars(darkMatch[1], dark);

		if (Object.keys(light).length === 0 && Object.keys(dark).length === 0) {
			parseVars(cleanCss, light);
		}

		if (Object.keys(light).length === 0 && Object.keys(dark).length === 0) return null;

		if (Object.keys(dark).length === 0) Object.assign(dark, light);
		if (Object.keys(light).length === 0) Object.assign(light, dark);

		return { light, dark };
	}

	async function importThemeFromInput() {
		const raw = themeJson.trim();
		if (!raw) return;

		if (raw.startsWith('{')) {
			try {
				const parsed = JSON.parse(raw) as any;
				if (parsed.cssVars && parsed.cssVars.light) {
					const base = parsed.cssVars.theme ?? {};
					const light = { ...base, ...parsed.cssVars.light };
					const dark = { ...base, ...(parsed.cssVars.dark ?? parsed.cssVars.light) };
					const importedTheme: ThemeConfig = {
						name: parsed.name || 'Custom Theme',
						description: '来自 JSON 的主题',
						colors: { light, dark }
					};
					addCustomTheme(importedTheme);
					selectedTheme = importedTheme;
					applyTheme(currentMode, selectedTheme);
					return;
				}
			} catch (e) {
				console.log('JSON parse failed, trying CSS');
			}
		}

		const cssTheme = parseCssTheme(raw);
		if (cssTheme) {
			const importedTheme: ThemeConfig = {
				name: 'Custom Theme (CSS)',
				description: '来自 CSS 的主题',
				colors: cssTheme
			};
			addCustomTheme(importedTheme);
			selectedTheme = importedTheme;
			applyTheme(currentMode, selectedTheme);
		} else {
			console.error('无法识别的主题格式');
		}
	}

	// 监听系统主题变化
	onMount(() => {
		checkSystemTheme();
		loadFontSettings();

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
			let theme = presetThemes.find((t) => t.name === savedThemeName) as ThemeConfig | undefined;
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
		<Label class="flex items-center gap-2 text-sm font-semibold">
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
			<span class="text-muted-foreground w-12 text-right text-sm">{sidebarOpacity}%</span>
		</div>
		<p class="text-muted-foreground text-xs">调整侧边栏和面板的背景透明度，数值越低越透明</p>
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
			<span class="text-muted-foreground w-12 text-right text-sm">{topToolbarOpacity}%</span>
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
			<span class="text-muted-foreground w-12 text-right text-sm">{bottomBarOpacity}%</span>
		</div>
	</div>

	<!-- 模糊程度设置 -->
	<div class="space-y-4 border-t pt-2">
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
				<span class="text-muted-foreground w-12 text-right text-sm">{sidebarBlur}px</span>
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
				<span class="text-muted-foreground w-12 text-right text-sm">{topToolbarBlur}px</span>
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
				<span class="text-muted-foreground w-12 text-right text-sm">{bottomBarBlur}px</span>
			</div>
		</div>
	</div>

	<!-- 设置界面透明度与模糊 -->
	<div class="space-y-3">
		<Label class="text-sm font-semibold">设置界面透明度与模糊</Label>
		<div class="space-y-2">
			<Label class="text-muted-foreground text-xs">设置界面透明度</Label>
			<div class="flex items-center gap-4">
				<Slider
					type="single"
					value={settingsOpacity}
					min={50}
					max={100}
					step={5}
					class="flex-1"
					onValueChange={updateSettingsOpacity}
				/>
				<span class="text-muted-foreground w-12 text-right text-sm">{settingsOpacity}%</span>
			</div>
		</div>
		<div class="space-y-2">
			<Label class="text-muted-foreground text-xs">设置界面模糊程度</Label>
			<div class="flex items-center gap-4">
				<Slider
					type="single"
					value={settingsBlur}
					min={0}
					max={20}
					step={2}
					class="flex-1"
					onValueChange={updateSettingsBlur}
				/>
				<span class="text-muted-foreground w-12 text-right text-sm">{settingsBlur}px</span>
			</div>
		</div>
	</div>

	<!-- 自定义字体 -->
	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<Label class="flex items-center gap-2 text-sm font-semibold">
				<Type class="h-4 w-4" />
				自定义字体
			</Label>
			<Switch checked={fontSettings.enabled} onCheckedChange={toggleFontEnabled} />
		</div>

		{#if fontSettings.enabled}
			<!-- 主字体 -->
			<div class="space-y-2">
				<Label class="text-muted-foreground text-xs">主字体（按优先级排序）</Label>
				<div class="flex gap-2">
					<Input
						bind:value={newMainFont}
						placeholder="输入字体名称，如 Microsoft YaHei"
						class="flex-1"
						onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && addMainFont()}
					/>
					<Button size="sm" variant="outline" onclick={addMainFont}>
						<Plus class="h-4 w-4" />
					</Button>
				</div>
				{#if fontSettings.fontFamilies.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each fontSettings.fontFamilies as font}
							<span
								class="bg-secondary inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
							>
								{font}
								<button onclick={() => removeMainFont(font)} class="hover:text-destructive">
									<X class="h-3 w-3" />
								</button>
							</span>
						{/each}
					</div>
				{/if}
			</div>

			<!-- 等宽字体 -->
			<div class="space-y-2">
				<Label class="text-muted-foreground text-xs">等宽字体（代码等）</Label>
				<div class="flex gap-2">
					<Input
						bind:value={newMonoFont}
						placeholder="输入字体名称，如 Cascadia Code"
						class="flex-1"
						onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && addMonoFont()}
					/>
					<Button size="sm" variant="outline" onclick={addMonoFont}>
						<Plus class="h-4 w-4" />
					</Button>
				</div>
				{#if fontSettings.monoFontFamilies.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each fontSettings.monoFontFamilies as font}
							<span
								class="bg-secondary inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs"
							>
								{font}
								<button onclick={() => removeMonoFont(font)} class="hover:text-destructive">
									<X class="h-3 w-3" />
								</button>
							</span>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- 预设主题 -->
	<div class="space-y-3">
		<button
			class="flex w-full items-center justify-between text-sm font-semibold"
			onclick={() => (isPresetsOpen = !isPresetsOpen)}
		>
			<span class="flex items-center gap-2">
				{#if isPresetsOpen}
					<ChevronDown class="h-4 w-4" />
				{:else}
					<ChevronRight class="h-4 w-4" />
				{/if}
				配色方案
			</span>
			<span class="text-muted-foreground text-xs">{presetThemes.length} 个</span>
		</button>

		{#if isPresetsOpen}
			<div class="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4" transition:slide>
				{#each presetThemes as theme}
					<button
						onclick={() => selectPresetTheme(theme)}
						class="hover:bg-accent group relative flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition-colors {selectedTheme.name ===
						theme.name
							? 'border-primary bg-primary/5'
							: ''}"
					>
						<div
							class="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100"
						>
							<Button
								variant="ghost"
								size="icon"
								class="h-5 w-5"
								onclick={(e: MouseEvent) => exportTheme(theme, e)}
								title="导出主题 JSON"
							>
								<Copy class="h-3 w-3" />
							</Button>
						</div>

						{#if selectedTheme.name === theme.name}
							<div class="absolute top-1 left-1">
								<Check class="text-primary h-3.5 w-3.5" />
							</div>
						{/if}

						<div class="grid grid-cols-2 gap-1">
							<div
								class="h-4 w-4 rounded-full border"
								style="background: {theme.colors.light.primary || theme.colors.dark.primary}"
								title="Primary"
							></div>
							<div
								class="h-4 w-4 rounded-full border"
								style="background: {theme.colors.light.secondary || theme.colors.light.primary}"
								title="Secondary"
							></div>
							<div
								class="h-4 w-4 rounded-full border"
								style="background: {theme.colors.light.accent || theme.colors.light.primary}"
								title="Accent"
							></div>
							<div
								class="h-4 w-4 rounded-full border"
								style="background: {theme.colors.light.muted || theme.colors.light.background}"
								title="Muted"
							></div>
						</div>

						<h4 class="w-full truncate text-xs font-medium" title={theme.name}>{theme.name}</h4>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	{#if customThemes.length}
		<div class="space-y-3">
			<div class="flex w-full items-center justify-between">
				<button
					class="flex items-center gap-2 text-sm font-semibold"
					onclick={() => (isCustomThemesOpen = !isCustomThemesOpen)}
				>
					{#if isCustomThemesOpen}
						<ChevronDown class="h-4 w-4" />
					{:else}
						<ChevronRight class="h-4 w-4" />
					{/if}
					自定义主题
					<span class="text-muted-foreground text-xs">({customThemes.length} 个)</span>
				</button>
				<div class="flex gap-1">
					<Button
						variant="outline"
						size="sm"
						class="h-6 text-xs"
						onclick={importAllThemes}
						title="从剪贴板导入主题"
					>
						导入全部
					</Button>
					<Button
						variant="outline"
						size="sm"
						class="h-6 text-xs"
						onclick={exportAllThemes}
						title="导出所有自定义主题"
					>
						导出全部
					</Button>
				</div>
			</div>

			{#if isCustomThemesOpen}
				<div class="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4" transition:slide>
					{#each customThemes as theme}
						<button
							onclick={() => selectPresetTheme(theme)}
							class="hover:bg-accent group relative flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition-colors {selectedTheme.name ===
							theme.name
								? 'border-primary bg-primary/5'
								: ''}"
						>
							<div
								class="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
							>
								<Button
									variant="ghost"
									size="icon"
									class="h-5 w-5"
									onclick={(e: MouseEvent) => exportTheme(theme, e)}
									title="导出主题 JSON"
								>
									<Copy class="h-3 w-3" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									class="text-destructive h-5 w-5 hover:text-red-600"
									onclick={(e: MouseEvent) => deleteCustomTheme(theme, e)}
									title="删除主题"
								>
									<Trash2 class="h-3 w-3" />
								</Button>
							</div>

							{#if selectedTheme.name === theme.name}
								<div class="absolute top-1 left-1">
									<Check class="text-primary h-3.5 w-3.5" />
								</div>
							{/if}

							<div class="grid grid-cols-2 gap-1">
								<div
									class="h-4 w-4 rounded-full border"
									style="background: {theme.colors.light.primary || theme.colors.dark.primary}"
									title="Primary"
								></div>
								<div
									class="h-4 w-4 rounded-full border"
									style="background: {theme.colors.light.secondary || theme.colors.light.primary}"
									title="Secondary"
								></div>
								<div
									class="h-4 w-4 rounded-full border"
									style="background: {theme.colors.light.accent || theme.colors.light.primary}"
									title="Accent"
								></div>
								<div
									class="h-4 w-4 rounded-full border"
									style="background: {theme.colors.light.muted || theme.colors.light.background}"
									title="Muted"
								></div>
							</div>

							<h4 class="w-full truncate text-xs font-medium" title={theme.name}>{theme.name}</h4>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<div class="space-y-3">
		<Label class="text-sm font-semibold">保存当前主题</Label>
		<div class="flex gap-2">
			<Input placeholder="自定义主题名称" bind:value={customThemeName} />
			<Button size="sm" onclick={saveCurrentThemeAsCustom}>保存</Button>
		</div>
	</div>

	<div class="space-y-3">
		<Label class="text-sm font-semibold">从 URL 导入主题</Label>
		<div class="flex gap-2">
			<Input placeholder="https://tweakcn.com/r/themes/perpetuity.json" bind:value={themeUrl} />
			<Button size="sm" onclick={importThemeFromUrl}>导入</Button>
		</div>
	</div>

	<div class="space-y-3">
		<Label class="text-sm font-semibold">导入主题 (JSON / CSS)</Label>
		<div class="flex flex-col gap-2">
			<textarea
				class="bg-muted/50 focus-visible:ring-ring min-h-[120px] resize-y rounded-md border p-2 font-mono text-xs outline-none focus-visible:ring-1"
				bind:value={themeJson}
				placeholder={placeholderText}
			></textarea>
			<div class="flex justify-end">
				<Button size="sm" onclick={importThemeFromInput}>导入</Button>
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
					<div class="h-6 w-6 rounded border" style="background: {value}" title={key}></div>
					<div class="flex-1 space-y-1">
						<div class="text-xs font-medium">{key}</div>
						<Input
							{value}
							on:input={(e) => updateThemeColor(editingVariant, key, e.currentTarget.value)}
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
