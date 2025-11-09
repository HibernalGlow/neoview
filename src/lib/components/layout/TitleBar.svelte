<script lang="ts">
	/**
	 * NeoView - Title Bar Component
	 * 标题栏组件
	 */
	import { Window } from '@tauri-apps/api/window';
	import { Button } from '$lib/components/ui/button';
	import { Menu, Minimize, Maximize, X, Settings } from '@lucide/svelte';
	import { toggleSidebar } from '$lib/stores';
	import SettingsDialog from '../dialogs/SettingsDialog.svelte';

	const appWindow = Window.getCurrent();

	let settingsOpen = $state(false);

	async function minimizeWindow() {
		await appWindow.minimize();
	}

	async function maximizeWindow() {
		await appWindow.toggleMaximize();
	}

	async function closeWindow() {
		await appWindow.close();
	}
</script>

<div
	data-tauri-drag-region
	class="h-8 bg-secondary/50 flex items-center justify-between px-2 select-none border-b"
>
	<!-- 左侧：菜单按钮 -->
	<div class="flex items-center gap-1">
		<Button variant="ghost" size="icon" class="h-6 w-6" onclick={toggleSidebar}>
			<Menu class="h-4 w-4" />
		</Button>
		<span class="text-sm font-semibold ml-2">NeoView</span>
	</div>

	<!-- 中间：设置按钮 -->
	<div class="flex items-center gap-1">
		<Button variant="ghost" size="icon" class="h-6 w-6" onclick={() => (settingsOpen = true)}>
			<Settings class="h-4 w-4" />
		</Button>
	</div>

	<!-- 右侧：窗口控制按钮 -->
	<div class="flex items-center gap-1">
		<Button variant="ghost" size="icon" class="h-6 w-6" onclick={minimizeWindow}>
			<Minimize class="h-3 w-3" />
		</Button>
		<Button variant="ghost" size="icon" class="h-6 w-6" onclick={maximizeWindow}>
			<Maximize class="h-3 w-3" />
		</Button>
		<Button variant="ghost" size="icon" class="h-6 w-6 hover:bg-destructive" onclick={closeWindow}>
			<X class="h-4 w-4" />
		</Button>
	</div>
</div>

<!-- 设置对话框 -->
<SettingsDialog bind:open={settingsOpen} />
