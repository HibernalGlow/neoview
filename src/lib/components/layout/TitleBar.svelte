<script lang="ts">
	/**
	 * NeoView - Title Bar Component
	 * 标题栏组件
	 */
	import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { LogicalPosition } from '@tauri-apps/api/dpi';
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

	function isInteractiveElement(target: EventTarget | null): boolean {
		const element = target as HTMLElement | null;
		if (!element) return false;
		return Boolean(
			element.closest('button,a,input,select,textarea,[role="button"],[data-no-window-drag]')
		);
	}

	async function handleTitleBarDragStart(event: PointerEvent): Promise<void> {
		if (event.button !== 0) return;
		if (isInteractiveElement(event.target)) return;

		const isFullscreen = await appWindow.isFullscreen();
		const isMaximized = await appWindow.isMaximized();

		if (isFullscreen || isMaximized) {
			const scaleFactor = await appWindow.scaleFactor();
			const maximizedSize = await appWindow.outerSize();
			const maximizedLogicalWidth = maximizedSize.width / scaleFactor;

			const percent = event.clientX / maximizedLogicalWidth;
			const clientY = event.clientY;

			let currentScreenX = event.screenX;
			let currentScreenY = event.screenY;

			const handlePointerMove = (e: PointerEvent) => {
				currentScreenX = e.screenX;
				currentScreenY = e.screenY;
			};
			window.addEventListener('pointermove', handlePointerMove);

			if (isFullscreen) {
				await appWindow.setFullscreen(false);
			}
			if (isMaximized) {
				await appWindow.unmaximize();
			}

			// 轮询等待窗口大小改变（说明操作系统已完成窗口状态恢复）
			let size = maximizedSize;
			const startTime = Date.now();
			while (Date.now() - startTime < 300) {
				size = await appWindow.outerSize();
				if (size.width !== maximizedSize.width || size.height !== maximizedSize.height) {
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 10));
			}

			try {
				const logicalWidth = size.width / scaleFactor;
				const x = currentScreenX - percent * logicalWidth;
				const y = currentScreenY - clientY;
				await appWindow.setPosition(new LogicalPosition(x, y));
				// 等待位置生效
				await new Promise((resolve) => setTimeout(resolve, 16));
			} catch (error) {
				console.warn('调整窗口拖拽位置失败:', error);
			} finally {
				window.removeEventListener('pointermove', handlePointerMove);
			}
		}

		try {
			await appWindow.startDragging();
		} catch (error) {
			console.warn('拖拽窗口失败:', error);
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="bg-secondary/50 flex h-8 items-center justify-between border-b px-2 select-none"
	role="banner"
	aria-label="窗口标题栏"
	onpointerdown={handleTitleBarDragStart}
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
