<script lang="ts">
	/**
	 * NeoView - Quick Library HUD Dialog
	 * 悬浮式沉浸图库 HUD 对话框
	 */
	import * as Dialog from '$lib/components/ui/dialog';
	import FolderPanel from '$lib/components/panels/folderPanel/FolderPanel.svelte';
	import { quickLibraryStore } from '$lib/stores/quickLibrary.svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';

	let sidebarOpacity = $state(settingsManager.getSettings().panels.sidebarOpacity);
	let sidebarBlur = $state(settingsManager.getSettings().panels.sidebarBlur ?? 12);

	$effect(() => {
		const unsubscribe = settingsManager.addListener((s) => {
			sidebarOpacity = s.panels.sidebarOpacity;
			sidebarBlur = s.panels.sidebarBlur ?? 12;
		});
		return unsubscribe;
	});

	// 当书籍开始加载且当前 HUD 处于打开状态时，自动关闭对话框以保障沉浸式加载体验
	$effect(() => {
		if (bookStore.loading && quickLibraryStore.isOpen) {
			quickLibraryStore.close();
		}
	});
</script>

<Dialog.Root bind:open={quickLibraryStore.isOpen}>
	<Dialog.Content
		class="flex h-[80vh] max-w-6xl flex-col overflow-hidden p-4"
		style="background-color: color-mix(in oklch, var(--background) {sidebarOpacity}%, transparent); backdrop-filter: blur({sidebarBlur}px);"
	>
		<Dialog.Header class="pr-6">
			<Dialog.Title>快捷书库</Dialog.Title>
			<Dialog.Description>双击任意目录或书籍开始阅读，切换完毕后视窗将自动关闭</Dialog.Description>
		</Dialog.Header>

		<div class="bg-card/40 mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
			{#if quickLibraryStore.isOpen}
				<FolderPanel />
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
