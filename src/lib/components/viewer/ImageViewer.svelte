<script lang="ts">
	/**
	 * NeoView - Image Viewer Component
	 * 图像查看器主组件
	 */
	import { currentPage, nextPage, previousPage, canNextPage, canPreviousPage } from '$lib/stores';
	import { zoomLevel, zoomIn, zoomOut, resetZoom } from '$lib/stores';
	import {
		keyBindings,
		generateKeyCombo,
		findCommandByKeys
	} from '$lib/stores/keyboard.svelte';
	import { loadImage } from '$lib/api';
	import { Button } from '$lib/components/ui/button';
	import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw } from '@lucide/svelte';

	let imageData = $state<string | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// 监听当前页面变化
	$effect(() => {
		if ($currentPage) {
			loadCurrentImage();
		} else {
			imageData = null;
		}
	});

	async function loadCurrentImage() {
		if (!$currentPage) return;

		loading = true;
		error = null;

		try {
			const data = await loadImage($currentPage.path);
			imageData = data;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load image';
			console.error('Failed to load image:', err);
		} finally {
			loading = false;
		}
	}

	async function handleNextPage() {
		if (!$canNextPage) return;
		try {
			await nextPage();
		} catch (err) {
			console.error('Failed to go to next page:', err);
		}
	}

	async function handlePreviousPage() {
		if (!$canPreviousPage) return;
		try {
			await previousPage();
		} catch (err) {
			console.error('Failed to go to previous page:', err);
		}
	}

	// 执行命令
	function executeCommand(command: string) {
		const commands: Record<string, () => void> = {
			next_page: handleNextPage,
			previous_page: handlePreviousPage,
			zoom_in: zoomIn,
			zoom_out: zoomOut,
			zoom_reset: resetZoom
			// 更多命令可以在这里添加
		};

		const handler = commands[command];
		if (handler) {
			handler();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		// 生成按键组合
		const keyCombo = generateKeyCombo(e);

		// 查找对应的命令
		const command = findCommandByKeys(keyCombo, $keyBindings);

		if (command) {
			e.preventDefault();
			executeCommand(command);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="h-full w-full flex flex-col bg-black">
	<!-- 工具栏 -->
	<div class="bg-secondary/50 p-2 flex items-center justify-center gap-2">
		<Button
			variant="ghost"
			size="icon"
			onclick={handlePreviousPage}
			disabled={!$canPreviousPage}
		>
			<ChevronLeft class="h-5 w-5" />
		</Button>

		<Button variant="ghost" size="icon" onclick={zoomOut}>
			<ZoomOut class="h-5 w-5" />
		</Button>

		<Button variant="ghost" size="icon" onclick={resetZoom}>
			<span class="text-sm font-mono">{($zoomLevel * 100).toFixed(0)}%</span>
		</Button>

		<Button variant="ghost" size="icon" onclick={zoomIn}>
			<ZoomIn class="h-5 w-5" />
		</Button>

		<Button variant="ghost" size="icon" onclick={handleNextPage} disabled={!$canNextPage}>
			<ChevronRight class="h-5 w-5" />
		</Button>
	</div>

	<!-- 图像显示区域 -->
	<div class="flex-1 flex items-center justify-center overflow-auto">
		{#if loading}
			<div class="text-white">Loading...</div>
		{:else if error}
			<div class="text-red-500">Error: {error}</div>
		{:else if imageData}
			<img
				src={imageData}
				alt="Current page"
				class="max-w-full max-h-full object-contain"
				style="transform: scale({$zoomLevel}); transition: transform 0.2s;"
			/>
		{:else}
			<div class="text-white/50">No image to display</div>
		{/if}
	</div>
</div>
