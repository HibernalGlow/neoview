<script lang="ts">
	import { Palette, Sun, Moon, Monitor, Check } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { onMount } from 'svelte';

	type ThemeMode = 'light' | 'dark' | 'system';

	let currentMode = $state<ThemeMode>('system');
	let systemPrefersDark = $state(false);

	// 预设主题颜色方案
	const presetThemes = [
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

	let selectedTheme = $state(presetThemes[0]);

	// 检测系统主题偏好
	function checkSystemTheme() {
		if (typeof window !== 'undefined') {
			systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		}
	}

	// 应用主题
	function applyTheme(mode: ThemeMode, theme: (typeof presetThemes)[0]) {
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
		root.style.setProperty('--primary', colors.primary);
		root.style.setProperty('--background', colors.background);
		root.style.setProperty('--foreground', colors.foreground);

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
	function selectPresetTheme(theme: (typeof presetThemes)[0]) {
		selectedTheme = theme;
		applyTheme(currentMode, theme);
	}

	// 监听系统主题变化
	onMount(() => {
		checkSystemTheme();

		// 从 localStorage 加载保存的设置
		const savedMode = localStorage.getItem('theme-mode') as ThemeMode;
		const savedThemeName = localStorage.getItem('theme-name');

		if (savedMode) {
			currentMode = savedMode;
		}

		if (savedThemeName) {
			const theme = presetThemes.find((t) => t.name === savedThemeName);
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

	<!-- 提示信息 -->
	<div class="border-primary/20 bg-primary/5 rounded-lg border p-4">
		<p class="text-sm">
			<strong>💡 提示:</strong> 主题设置会自动保存,下次打开应用时会自动应用。
		</p>
	</div>
</div>
