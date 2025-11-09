<script lang="ts">
	/**
	 * NeoView - Settings Window
	 * 设置窗口主组件
	 */
	import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { Button } from '$lib/components/ui/button';
	import { Settings, Keyboard, Palette, Zap, Mouse, Hand, X, Minimize } from '@lucide/svelte';
	import KeyBindingPanel from '$lib/components/dialogs/KeyBindingPanel.svelte';
	import ViewerSettingsPanel from '$lib/components/dialogs/ViewerSettingsPanel.svelte';
	import MouseSettingsPanel from '$lib/components/dialogs/MouseSettingsPanel.svelte';
	import GestureSettingsPanel from '$lib/components/dialogs/GestureSettingsPanel.svelte';

	const appWindow = getCurrentWebviewWindow();

	const tabs = [
		{ value: 'general', label: '通用', icon: Settings },
		{ value: 'viewer', label: '查看器', icon: Palette },
		{ value: 'keyboard', label: '快捷键', icon: Keyboard },
		{ value: 'mouse', label: '鼠标', icon: Mouse },
		{ value: 'gesture', label: '手势', icon: Hand },
		{ value: 'performance', label: '性能', icon: Zap }
	];

	let activeTab = $state('general');

	async function minimizeWindow() {
		await appWindow.minimize();
	}

	async function closeWindow() {
		await appWindow.close();
	}
</script>

<div class="h-screen w-screen flex flex-col bg-background">
	<!-- 自定义标题栏 -->
	<div
		data-tauri-drag-region
		class="h-10 bg-secondary/50 flex items-center justify-between px-4 select-none border-b"
	>
		<div class="flex items-center gap-2">
			<Settings class="h-4 w-4" />
			<span class="text-sm font-semibold">设置</span>
		</div>

		<div class="flex items-center gap-1">
			<Button variant="ghost" size="icon" class="h-7 w-7" onclick={minimizeWindow}>
				<Minimize class="h-3 w-3" />
			</Button>
			<Button variant="ghost" size="icon" class="h-7 w-7" onclick={closeWindow}>
				<X class="h-4 w-4" />
			</Button>
		</div>
	</div>

	<!-- 主内容区 -->
	<div class="flex-1 flex overflow-hidden">
		<!-- 左侧标签栏 -->
		<div class="w-48 border-r p-2 space-y-1">
			{#each tabs as tab}
				{@const IconComponent = tab.icon}
				<button
					class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-accent transition-colors {activeTab ===
					tab.value
						? 'bg-accent'
						: ''}"
					onclick={() => (activeTab = tab.value)}
				>
					<IconComponent class="h-5 w-5" />
					<span>{tab.label}</span>
				</button>
			{/each}
		</div>

		<!-- 右侧内容区 -->
		<div class="flex-1 overflow-auto">
			{#if activeTab === 'general'}
				<div class="p-6 space-y-4">
					<h3 class="text-lg font-semibold">通用设置</h3>
					<p class="text-sm text-muted-foreground">即将推出...</p>
				</div>
			{:else if activeTab === 'viewer'}
				<ViewerSettingsPanel />
			{:else if activeTab === 'keyboard'}
				<KeyBindingPanel />
			{:else if activeTab === 'mouse'}
				<MouseSettingsPanel />
			{:else if activeTab === 'gesture'}
				<GestureSettingsPanel />
			{:else if activeTab === 'performance'}
				<div class="p-6 space-y-4">
					<h3 class="text-lg font-semibold">性能设置</h3>
					<p class="text-sm text-muted-foreground">即将推出...</p>
				</div>
			{/if}
		</div>
	</div>

	<!-- 底部按钮 -->
	<div class="h-14 border-t flex items-center justify-end px-4 gap-2 bg-secondary/30">
		<Button variant="outline" onclick={closeWindow}>关闭</Button>
		<Button onclick={() => alert('设置已保存')}>保存</Button>
	</div>
</div>
