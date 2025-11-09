<script lang="ts">
	/**
	 * Thumbnails Panel
	 * 缩略图面板 - 网格显示所有页面缩略图
	 */
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Image as ImageIcon, Grid3x3, Grid2x2, LayoutGrid } from '@lucide/svelte';

	interface Thumbnail {
		index: number;
		name: string;
		imageUrl: string; // base64 or url
	}

	// 模拟数据 - 实际应从 store 获取并动态生成缩略图
	let thumbnails = $state<Thumbnail[]>(
		Array.from({ length: 20 }, (_, i) => ({
			index: i + 1,
			name: `page_${String(i + 1).padStart(3, '0')}.jpg`,
			imageUrl: '' // 实际应调用 Tauri 命令生成缩略图
		}))
	);

	let currentPage = $state(1);
	let gridSize = $state<'small' | 'medium' | 'large'>('medium');

	// 缩略图尺寸
	const gridSizes = {
		small: 'w-20 h-28',
		medium: 'w-28 h-40',
		large: 'w-36 h-52'
	};

	function goToPage(index: number) {
		currentPage = index;
		// TODO: 发送事件到主视图切换页面
		console.log('跳转到页面', index);
	}

	function setGridSize(size: 'small' | 'medium' | 'large') {
		gridSize = size;
	}
</script>

<div class="h-full flex flex-col bg-background">
	<!-- 头部 -->
	<div class="p-3 border-b space-y-2">
		<div class="flex items-center justify-between">
			<h3 class="text-sm font-semibold flex items-center gap-2">
				<LayoutGrid class="h-4 w-4" />
				缩略图 ({thumbnails.length})
			</h3>
		</div>

		<!-- 网格尺寸控制 -->
		<div class="flex items-center gap-1">
			<Label class="text-[10px] text-muted-foreground mr-1">尺寸</Label>
			<Button
				variant={gridSize === 'small' ? 'default' : 'outline'}
				size="icon"
				class="h-6 w-6"
				onclick={() => setGridSize('small')}
				title="小"
			>
				<Grid3x3 class="h-3 w-3" />
			</Button>
			<Button
				variant={gridSize === 'medium' ? 'default' : 'outline'}
				size="icon"
				class="h-6 w-6"
				onclick={() => setGridSize('medium')}
				title="中"
			>
				<Grid2x2 class="h-3 w-3" />
			</Button>
			<Button
				variant={gridSize === 'large' ? 'default' : 'outline'}
				size="icon"
				class="h-6 w-6"
				onclick={() => setGridSize('large')}
				title="大"
			>
				<LayoutGrid class="h-3 w-3" />
			</Button>
		</div>
	</div>

	<!-- 缩略图网格 -->
	<div class="flex-1 overflow-y-auto p-2">
		<div
			class="grid gap-2 {gridSize === 'small'
				? 'grid-cols-3'
				: gridSize === 'medium'
					? 'grid-cols-2'
					: 'grid-cols-1'}"
		>
			{#each thumbnails as thumb}
				<button
					class="flex flex-col items-center gap-1 p-2 rounded-md hover:bg-accent transition-colors {currentPage ===
					thumb.index
						? 'bg-primary/10 border-2 border-primary'
						: 'border border-transparent'}"
					onclick={() => goToPage(thumb.index)}
				>
					<!-- 缩略图 -->
					<div
						class="{gridSizes[
							gridSize
						]} rounded bg-muted flex items-center justify-center overflow-hidden relative"
					>
						{#if thumb.imageUrl}
							<img 
								src={thumb.imageUrl} 
								alt={thumb.name} 
								class="absolute inset-0 w-full h-full object-contain" 
							/>
						{:else}
							<!-- 占位图标 -->
							<ImageIcon class="h-8 w-8 text-muted-foreground" />
						{/if}
					</div>

					<!-- 页面编号 -->
					<div class="text-[10px] font-mono font-semibold text-primary">#{thumb.index}</div>

					<!-- 文件名（仅大尺寸显示） -->
					{#if gridSize === 'large'}
						<div class="text-[9px] text-muted-foreground truncate w-full text-center">
							{thumb.name}
						</div>
					{/if}

					<!-- 当前页标记 -->
					{#if currentPage === thumb.index}
						<div
							class="absolute top-1 right-1 px-1.5 py-0.5 text-[9px] font-semibold bg-primary text-primary-foreground rounded"
						>
							当前
						</div>
					{/if}
				</button>
			{/each}
		</div>
	</div>

	<!-- 底部提示 -->
	<div class="p-2 border-t text-[10px] text-muted-foreground text-center">
		点击缩略图跳转到对应页面
	</div>
</div>

<style>
	button {
		position: relative;
	}
</style>