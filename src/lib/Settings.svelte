<script lang="ts">
	/**
	 * NeoView - Settings Window
	 * 设置窗口 - 独立窗口外壳，内容复用 SettingsContent
	 */
	import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { Button } from '$lib/components/ui/button';
	import { Settings, X, Minimize } from '@lucide/svelte';
	import SettingsContent from '$lib/components/SettingsContent.svelte';

	function isTauriRuntime(): boolean {
		return (
			typeof window !== 'undefined' &&
			Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
		);
	}

	const appWindow = isTauriRuntime() ? getCurrentWebviewWindow() : null;

	async function minimizeWindow() {
		await appWindow?.minimize();
	}

	async function closeWindow() {
		if (appWindow) {
			await appWindow.close();
			return;
		}
		window.close();
	}
</script>

<div class="bg-background fixed inset-0 flex flex-col">
	<!-- 自定义标题栏 -->
	<div
		data-tauri-drag-region
		class="bg-secondary/50 flex h-10 shrink-0 items-center justify-between border-b px-4 select-none"
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

	<!-- 设置内容 -->
	<div class="flex-1 overflow-hidden">
		<SettingsContent />
	</div>
</div>
