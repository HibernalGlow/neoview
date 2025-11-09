<script lang="ts">
	/**
	 * NeoView - Settings Window
	 * 设置窗口 - 使用完整的设置面板
	 */
	import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { Button } from '$lib/components/ui/button';
	import { Settings, X, Minimize } from '@lucide/svelte';
	import SettingsPanel from '$lib/components/panels/SettingsPanel.svelte';

	const appWindow = getCurrentWebviewWindow();

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

	<!-- 主内容区 - 完整设置面板 -->
	<div class="flex-1 overflow-hidden">
		<SettingsPanel />
	</div>
</div>
