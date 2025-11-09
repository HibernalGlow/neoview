<script lang="ts">
	/**
	 * NeoView - Main App Component
	 * 主应用程序组件
	 */
	import MainLayout from '$lib/components/layout/MainLayout.svelte';
	import ImageViewer from '$lib/components/viewer/ImageViewer.svelte';
	import { Button } from '$lib/components/ui/button';
	import { open } from '@tauri-apps/plugin-dialog';
	import { openBook } from '$lib/stores';
	import { FolderOpen } from '@lucide/svelte';

	let loading = $state(false);

	async function handleOpenFolder() {
		try {
			loading = true;
			const selected = await open({
				directory: true,
				multiple: false,
				title: 'Select a folder to open'
			});

			if (selected) {
				await openBook(selected);
			}
		} catch (error) {
			console.error('Failed to open folder:', error);
		} finally {
			loading = false;
		}
	}
</script>

<MainLayout>
	<div class="h-full w-full flex items-center justify-center">
		<ImageViewer />
		
		<!-- 欢迎界面 (当没有打开书籍时显示) -->
		<!-- <div class="text-center">
			<h1 class="text-4xl font-bold mb-4">NeoView</h1>
			<p class="text-muted-foreground mb-8">Modern Image & Comic Viewer</p>
			<Button onclick={handleOpenFolder} disabled={loading} size="lg">
				<FolderOpen class="mr-2 h-5 w-5" />
				{loading ? 'Opening...' : 'Open Folder'}
			</Button>
		</div> -->
	</div>
</MainLayout>
