<!--
  外观设置面板
  使用多 Tab 形式组织：主题模式、透明度、配色方案、字体
-->
<script lang="ts">
	import { Palette, Sun, Layers, PaintBucket, Type } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import * as Tabs from '$lib/components/ui/tabs';
	import {
		type ThemeMode,
		type ThemeConfig,
		presetThemes,
		checkSystemTheme,
		applyTheme,
		loadCustomThemes,
		persistCustomThemes
	} from './theme/themeStore';
	import ThemeModeTab from './theme/ThemeModeTab.svelte';
	import TransparencyTab from './theme/TransparencyTab.svelte';
	import ColorSchemeTab from './theme/ColorSchemeTab.svelte';
	import FontTab from './theme/FontTab.svelte';

	let activeTab = $state('mode');
	let currentMode = $state<ThemeMode>('system');
	let systemPrefersDark = $state(false);
	let selectedTheme = $state<ThemeConfig>(presetThemes[0]);
	let customThemes = $state<ThemeConfig[]>([]);

	function handleModeChange(mode: ThemeMode) {
		currentMode = mode;
		applyTheme(currentMode, selectedTheme, systemPrefersDark);
	}
// ... (omitting lines for brevity, just targeting the import and grid-cols)

// actually I can't skip lines in ReplacementContent easily without copying them.
// I will do separate replace calls if needed or just copy the necessary block.
// Let's just do the import first.


	function handleThemeSelect(theme: ThemeConfig) {
		selectedTheme = theme;
		applyTheme(currentMode, theme, systemPrefersDark);
	}

	function handleCustomThemesChange(themes: ThemeConfig[]) {
		customThemes = themes;
	}

	function handleThemeColorUpdate(variant: 'light' | 'dark', key: string, value: string) {
		const baseColors = selectedTheme.colors[variant] || {};
		const newVariantColors = { ...baseColors, [key]: value };
		const newTheme: ThemeConfig = {
			...selectedTheme,
			colors: {
				...selectedTheme.colors,
				[variant]: newVariantColors
			}
		};

		// 更新预设或自定义主题
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
				persistCustomThemes(customThemes);
			}
		}

		selectedTheme = newTheme;
		applyTheme(currentMode, newTheme, systemPrefersDark);
	}

	onMount(() => {
		systemPrefersDark = checkSystemTheme();
		customThemes = loadCustomThemes();

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

		applyTheme(currentMode, selectedTheme, systemPrefersDark);

		// 监听系统主题变化
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const handleChange = (e: MediaQueryListEvent) => {
			systemPrefersDark = e.matches;
			if (currentMode === 'system') {
				applyTheme('system', selectedTheme, systemPrefersDark);
			}
		};

		mediaQuery.addEventListener('change', handleChange);
		return () => mediaQuery.removeEventListener('change', handleChange);
	});
</script>

<div class="space-y-4 p-6">
	<!-- 标题 -->
	<div class="space-y-2">
		<h3 class="flex items-center gap-2 text-lg font-semibold">
			<Palette class="h-5 w-5" />
			外观设置
		</h3>
		<p class="text-muted-foreground text-sm">自定义应用的外观和颜色</p>
	</div>

	<!-- Tabs -->
	<Tabs.Root bind:value={activeTab} class="w-full">
		<Tabs.List class="grid w-full grid-cols-4">
			<Tabs.Trigger value="mode" class="gap-1.5 text-xs">
				<Sun class="h-3.5 w-3.5" />
				主题
			</Tabs.Trigger>
			<Tabs.Trigger value="transparency" class="gap-1.5 text-xs">
				<Layers class="h-3.5 w-3.5" />
				透明度
			</Tabs.Trigger>
			<Tabs.Trigger value="colors" class="gap-1.5 text-xs">
				<PaintBucket class="h-3.5 w-3.5" />
				配色
			</Tabs.Trigger>
			<Tabs.Trigger value="font" class="gap-1.5 text-xs">
				<Type class="h-3.5 w-3.5" />
				字体
			</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="mode" class="mt-4">
			<ThemeModeTab
				{currentMode}
				{systemPrefersDark}
				onModeChange={handleModeChange}
			/>
		</Tabs.Content>

		<Tabs.Content value="transparency" class="mt-4">
			<TransparencyTab />
		</Tabs.Content>

		<Tabs.Content value="colors" class="mt-4">
			<ColorSchemeTab
				{selectedTheme}
				{customThemes}
				{currentMode}
				{systemPrefersDark}
				onThemeSelect={handleThemeSelect}
				onCustomThemesChange={handleCustomThemesChange}
				onThemeColorUpdate={handleThemeColorUpdate}
			/>
		</Tabs.Content>

		<Tabs.Content value="font" class="mt-4">
			<FontTab />
		</Tabs.Content>
	</Tabs.Root>
</div>
