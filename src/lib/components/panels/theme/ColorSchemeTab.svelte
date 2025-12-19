<!--
  配色方案 Tab
  包含预设主题、自定义主题、主题导入导出功能
-->
<script lang="ts">
	import { Check, Copy, Trash2, ChevronDown, ChevronRight } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { slide } from 'svelte/transition';
	import { fetchThemeFromURL } from '$lib/utils/themeManager';
	import {
		type ThemeConfig,
		type ThemeMode,
		presetThemes,
		parseCssTheme,
		persistCustomThemes
	} from './themeStore';

	interface Props {
		selectedTheme: ThemeConfig;
		customThemes: ThemeConfig[];
		currentMode: ThemeMode;
		systemPrefersDark: boolean;
		onThemeSelect: (theme: ThemeConfig) => void;
		onCustomThemesChange: (themes: ThemeConfig[]) => void;
		onThemeColorUpdate: (variant: 'light' | 'dark', key: string, value: string) => void;
	}

	let {
		selectedTheme,
		customThemes,
		currentMode,
		systemPrefersDark,
		onThemeSelect,
		onCustomThemesChange,
		onThemeColorUpdate
	}: Props = $props();

	let isPresetsOpen = $state(false);
	let isCustomThemesOpen = $state(false);
	let themeUrl = $state('');
	let themeJson = $state('');
	let customThemeName = $state('');
	let editingVariant = $state<'light' | 'dark'>('light');

	const placeholderText =
		'JSON 或 CSS 格式\n\nJSON: {"name":"...","cssVars":{...}}\n\nCSS:\n:root {\n  --background: ...;\n}';

	function exportTheme(theme: ThemeConfig, e: MouseEvent) {
		e.stopPropagation();
		const exportData = {
			name: theme.name,
			description: theme.description,
			cssVars: { light: theme.colors.light, dark: theme.colors.dark }
		};
		navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
	}

	function exportAllThemes() {
		const exportData = customThemes.map((theme) => ({
			name: theme.name,
			description: theme.description,
			cssVars: { light: theme.colors.light, dark: theme.colors.dark }
		}));
		navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
	}

	async function importAllThemes() {
		try {
			const text = await navigator.clipboard.readText();
			const parsed = JSON.parse(text);
			const themes = Array.isArray(parsed) ? parsed : [parsed];
			let newThemes = [...customThemes];
			for (const item of themes) {
				if (item.cssVars && (item.cssVars.light || item.cssVars.dark)) {
					const base = item.cssVars.theme ?? {};
					const light = { ...base, ...(item.cssVars.light ?? {}) };
					const dark = { ...base, ...(item.cssVars.dark ?? item.cssVars.light ?? {}) };
					const importedTheme: ThemeConfig = {
						name: item.name || `导入主题`,
						description: item.description || '导入的主题',
						colors: { light, dark }
					};
					const idx = newThemes.findIndex((t) => t.name === importedTheme.name);
					if (idx >= 0) {
						newThemes[idx] = importedTheme;
					} else {
						newThemes.push(importedTheme);
					}
				}
			}
			onCustomThemesChange(newThemes);
			persistCustomThemes(newThemes);
		} catch (e) {
			console.error('导入主题失败', e);
		}
	}

	function deleteCustomTheme(theme: ThemeConfig, e: MouseEvent) {
		e.stopPropagation();
		if (selectedTheme.name === theme.name) {
			onThemeSelect(presetThemes[0]);
		}
		const newThemes = customThemes.filter((t) => t.name !== theme.name);
		onCustomThemesChange(newThemes);
		persistCustomThemes(newThemes);
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
		const idx = customThemes.findIndex((t) => t.name === name);
		let newThemes: ThemeConfig[];
		if (idx >= 0) {
			newThemes = [...customThemes.slice(0, idx), theme, ...customThemes.slice(idx + 1)];
		} else {
			newThemes = [...customThemes, theme];
		}
		onCustomThemesChange(newThemes);
		persistCustomThemes(newThemes);
		customThemeName = name;
		onThemeSelect(theme);
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
				colors: { light, dark }
			};
			const idx = customThemes.findIndex((t) => t.name === importedTheme.name);
			let newThemes: ThemeConfig[];
			if (idx >= 0) {
				newThemes = [...customThemes.slice(0, idx), importedTheme, ...customThemes.slice(idx + 1)];
			} else {
				newThemes = [...customThemes, importedTheme];
			}
			onCustomThemesChange(newThemes);
			persistCustomThemes(newThemes);
			onThemeSelect(importedTheme);
		} catch (error) {
			console.error('导入主题失败', error);
		}
	}

	async function importThemeFromInput() {
		const raw = themeJson.trim();
		if (!raw) return;

		let importedTheme: ThemeConfig | null = null;

		if (raw.startsWith('{')) {
			try {
				const parsed = JSON.parse(raw) as any;
				if (parsed.cssVars && parsed.cssVars.light) {
					const base = parsed.cssVars.theme ?? {};
					const light = { ...base, ...parsed.cssVars.light };
					const dark = { ...base, ...(parsed.cssVars.dark ?? parsed.cssVars.light) };
					importedTheme = {
						name: parsed.name || 'Custom Theme',
						description: '来自 JSON 的主题',
						colors: { light, dark }
					};
				}
			} catch {}
		}

		if (!importedTheme) {
			const cssTheme = parseCssTheme(raw);
			if (cssTheme) {
				importedTheme = {
					name: 'Custom Theme (CSS)',
					description: '来自 CSS 的主题',
					colors: cssTheme
				};
			}
		}

		if (importedTheme) {
			const idx = customThemes.findIndex((t) => t.name === importedTheme!.name);
			let newThemes: ThemeConfig[];
			if (idx >= 0) {
				newThemes = [...customThemes.slice(0, idx), importedTheme, ...customThemes.slice(idx + 1)];
			} else {
				newThemes = [...customThemes, importedTheme];
			}
			onCustomThemesChange(newThemes);
			persistCustomThemes(newThemes);
			onThemeSelect(importedTheme);
		}
	}
</script>

<div class="space-y-4">
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
						onclick={() => onThemeSelect(theme)}
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
							></div>
							<div
								class="h-4 w-4 rounded-full border"
								style="background: {theme.colors.light.secondary || theme.colors.light.primary}"
							></div>
							<div
								class="h-4 w-4 rounded-full border"
								style="background: {theme.colors.light.accent || theme.colors.light.primary}"
							></div>
							<div
								class="h-4 w-4 rounded-full border"
								style="background: {theme.colors.light.muted || theme.colors.light.background}"
							></div>
						</div>
						<h4 class="w-full truncate text-xs font-medium" title={theme.name}>{theme.name}</h4>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- 自定义主题 -->
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
					<Button variant="outline" size="sm" class="h-6 text-xs" onclick={importAllThemes}>
						导入全部
					</Button>
					<Button variant="outline" size="sm" class="h-6 text-xs" onclick={exportAllThemes}>
						导出全部
					</Button>
				</div>
			</div>

			{#if isCustomThemesOpen}
				<div class="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4" transition:slide>
					{#each customThemes as theme}
						<button
							onclick={() => onThemeSelect(theme)}
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
								>
									<Copy class="h-3 w-3" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									class="text-destructive h-5 w-5 hover:text-red-600"
									onclick={(e: MouseEvent) => deleteCustomTheme(theme, e)}
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
								></div>
								<div
									class="h-4 w-4 rounded-full border"
									style="background: {theme.colors.light.secondary || theme.colors.light.primary}"
								></div>
								<div
									class="h-4 w-4 rounded-full border"
									style="background: {theme.colors.light.accent || theme.colors.light.primary}"
								></div>
								<div
									class="h-4 w-4 rounded-full border"
									style="background: {theme.colors.light.muted || theme.colors.light.background}"
								></div>
							</div>
							<h4 class="w-full truncate text-xs font-medium" title={theme.name}>{theme.name}</h4>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- 保存当前主题 -->
	<div class="space-y-3">
		<Label class="text-sm font-semibold">保存当前主题</Label>
		<div class="flex gap-2">
			<Input placeholder="自定义主题名称" bind:value={customThemeName} />
			<Button size="sm" onclick={saveCurrentThemeAsCustom}>保存</Button>
		</div>
	</div>

	<!-- 从 URL 导入 -->
	<div class="space-y-3">
		<Label class="text-sm font-semibold">从 URL 导入主题</Label>
		<div class="flex gap-2">
			<Input placeholder="https://tweakcn.com/r/themes/perpetuity.json" bind:value={themeUrl} />
			<Button size="sm" onclick={importThemeFromUrl}>导入</Button>
		</div>
	</div>

	<!-- 从 JSON/CSS 导入 -->
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

	<!-- 详细颜色编辑 -->
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
							on:input={(e) => onThemeColorUpdate(editingVariant, key, e.currentTarget.value)}
						/>
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
