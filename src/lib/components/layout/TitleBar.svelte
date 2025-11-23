<script lang="ts">
	/**
	 * NeoView - Title Bar Component
	 * 标题栏组件
	 */
	import { getCurrentWebviewWindow, WebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Menu, Minimize, Maximize, X, Settings, PanelRightOpen } from '@lucide/svelte';
	import { toggleSidebar, toggleRightSidebar } from '$lib/stores';

	const appWindow = getCurrentWebviewWindow();

	async function openSettings() {
		try {
			// 检查设置窗口是否已存在
			const existingWindow = await WebviewWindow.getByLabel('settings');
			if (existingWindow) {
				await existingWindow.setFocus();
				return;
			}
		} catch (e) {
			// 窗口不存在，继续创建
		}

		try {
			// 创建新的设置窗口
			const settingsWindow = new WebviewWindow('settings', {
				url: '/settings.html',
				title: '设置',
				width: 900,
				height: 700,
				center: true,
				resizable: true,
				decorations: false
			});

			console.log('Settings window created');
		} catch (error) {
			console.error('Failed to create settings window:', error);
			// 如果创建窗口失败，暂时使用 alert 提示
			alert('设置窗口功能即将推出！当前可在主界面使用快捷键和手势功能。');
		}
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
		<Button variant="ghost" size="icon" class="h-6 w-6 hover:bg-destructive" onclick={closeWindow}>
			<X class="h-4 w-4" />
		</Button>
	</div>
</div>
