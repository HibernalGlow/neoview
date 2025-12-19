<!--
  主题模式选择 Tab
  包含浅色/深色/跟随系统三种模式
-->
<script lang="ts">
	import { Sun, Moon, Monitor, Check } from '@lucide/svelte';
	import { Label } from '$lib/components/ui/label';
	import type { ThemeMode } from './themeStore';

	interface Props {
		currentMode: ThemeMode;
		systemPrefersDark: boolean;
		onModeChange: (mode: ThemeMode) => void;
	}

	let { currentMode, systemPrefersDark, onModeChange }: Props = $props();
</script>

<div class="space-y-4">
	<!-- 主题模式选择 -->
	<div class="space-y-3">
		<Label class="text-sm font-semibold">主题模式</Label>
		<div class="grid grid-cols-3 gap-3">
			<button
				onclick={() => onModeChange('light')}
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
				onclick={() => onModeChange('dark')}
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
				onclick={() => onModeChange('system')}
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

	<!-- 颜色预览 -->
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
			<strong>💡 提示:</strong> 主题设置会自动保存，下次打开应用时会自动应用。
		</p>
	</div>
</div>
