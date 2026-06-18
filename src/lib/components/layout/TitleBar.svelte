<script lang="ts">
	/**
	 * NeoView - Title Bar Component
	 * 标题栏组件
	 */
	import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { openSettingsOverlay } from '$lib/stores/settingsOverlay.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Menu, Minimize, Maximize, X, Settings, PanelRightOpen } from '@lucide/svelte';
	import { toggleLeftSidebar, toggleRightSidebar } from '$lib/stores';

	const appWindow = getCurrentWebviewWindow();

	function openSettings() {
		openSettingsOverlay();
	}

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

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	data-tauri-drag-region
	class="bg-secondary/50 flex h-8 items-center justify-between border-b px-2 select-none"
	role="banner"
	aria-label="窗口标题栏"
>
	<!-- 左侧：菜单按钮 -->
	<div class="flex items-center gap-1">
		<Button variant="ghost" size="icon" class="h-6 w-6" onclick={toggleLeftSidebar}>
			<Menu class="h-4 w-4" />
		</Button>
		<span class="ml-2 text-sm font-semibold">NeoView</span>
	</div>

	<!-- 中间：功能按钮 -->
	<div class="flex items-center gap-1">
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button variant="ghost" size="icon" class="h-6 w-6" onclick={toggleRightSidebar}>
					<PanelRightOpen class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>右侧边栏</p>
			</Tooltip.Content>
		</Tooltip.Root>
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button variant="ghost" size="icon" class="h-6 w-6" onclick={openSettings}>
					<Settings class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>设置</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</div>

	<!-- 右侧：窗口控制按钮 -->
	<div class="flex items-center gap-1">
		<Button variant="ghost" size="icon" class="h-6 w-6" onclick={minimizeWindow}>
			<Minimize class="h-3 w-3" />
		</Button>
		<Button variant="ghost" size="icon" class="h-6 w-6" onclick={maximizeWindow}>
			<Maximize class="h-3 w-3" />
		</Button>
		<Button variant="ghost" size="icon" class="hover:bg-destructive h-6 w-6" onclick={closeWindow}>
			<X class="h-4 w-4" />
		</Button>
	</div>
</div>
