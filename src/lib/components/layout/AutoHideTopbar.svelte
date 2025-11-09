<script lang="ts">
	/**
	 * Auto-hide Top Toolbar
	 * 自动隐藏的顶部工具栏：面包屑 + 图片操作控制
	 */
	import { Button } from '$lib/components/ui/button';
	import {
		ChevronRight,
		Home,
		ZoomIn,
		ZoomOut,
		RotateCw,
		Maximize,
		BookOpen,
		Book
	} from '@lucide/svelte';

	let isVisible = $state(false);
	let hideTimer: number | null = null;

	// 面包屑路径（模拟数据）
	let breadcrumbs = $state([
		{ name: 'D:', path: 'D:/' },
		{ name: 'Comics', path: 'D:/Comics' },
		{ name: 'Volume 1', path: 'D:/Comics/Volume1.zip' }
	]);

	// 视图状态
	let viewMode = $state<'single' | 'double'>('single');
	let isFullscreen = $state(false);

	// 鼠标进入顶部区域
	function handleMouseEnter() {
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
		isVisible = true;
	}

	// 鼠标离开顶部区域
	function handleMouseLeave() {
		hideTimer = setTimeout(() => {
			isVisible = false;
		}, 1000) as unknown as number;
	}

	// 切换视图模式
	function toggleViewMode() {
		viewMode = viewMode === 'single' ? 'double' : 'single';
	}

	// 切换全屏
	function toggleFullscreen() {
		isFullscreen = !isFullscreen;
		// TODO: 调用 Tauri API 切换全屏
	}
</script>

<!-- 鼠标触发区域（顶部隐形条） -->
<div
	class="fixed top-0 left-0 right-0 h-2 z-40"
	onmouseenter={handleMouseEnter}
	role="presentation"
></div>

<!-- 工具栏容器 -->
<div
	class="fixed top-0 left-0 right-0 z-50 transition-transform duration-300 {isVisible
		? 'translate-y-0'
		: '-translate-y-full'}"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	role="toolbar"
>
	<div class="bg-background/95 backdrop-blur-sm border-b shadow-lg">
		<div class="h-12 px-4 flex items-center justify-between gap-4">
			<!-- 左侧：面包屑导航 -->
			<div class="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
				<Button variant="ghost" size="icon" class="h-8 w-8 flex-shrink-0">
					<Home class="h-4 w-4" />
				</Button>

				{#each breadcrumbs as crumb, index}
					{#if index > 0}
						<ChevronRight class="h-3 w-3 text-muted-foreground flex-shrink-0" />
					{/if}
					<button
						class="px-2 py-1 text-sm hover:bg-accent rounded transition-colors truncate max-w-[200px] {index ===
						breadcrumbs.length - 1
							? 'font-semibold'
							: 'text-muted-foreground'}"
						title={crumb.path}
					>
						{crumb.name}
					</button>
				{/each}
			</div>

			<!-- 中间：页面信息 -->
			<div class="text-sm text-muted-foreground font-mono flex-shrink-0">
				<span class="font-semibold text-foreground">15</span>
				<span class="mx-1">/</span>
				<span>200</span>
			</div>

			<!-- 右侧：图片操作 -->
			<div class="flex items-center gap-1 flex-shrink-0">
				<!-- 缩放控制 -->
				<Button variant="ghost" size="icon" class="h-8 w-8" title="缩小">
					<ZoomOut class="h-4 w-4" />
				</Button>
				<span class="text-xs text-muted-foreground font-mono w-12 text-center">100%</span>
				<Button variant="ghost" size="icon" class="h-8 w-8" title="放大">
					<ZoomIn class="h-4 w-4" />
				</Button>

				<div class="w-px h-6 bg-border mx-1"></div>

				<!-- 旋转 -->
				<Button variant="ghost" size="icon" class="h-8 w-8" title="旋转">
					<RotateCw class="h-4 w-4" />
				</Button>

				<div class="w-px h-6 bg-border mx-1"></div>

				<!-- 单页/双页切换 -->
				<Button
					variant={viewMode === 'single' ? 'default' : 'ghost'}
					size="icon"
					class="h-8 w-8"
					onclick={toggleViewMode}
					title="单页模式"
				>
					<Book class="h-4 w-4" />
				</Button>
				<Button
					variant={viewMode === 'double' ? 'default' : 'ghost'}
					size="icon"
					class="h-8 w-8"
					onclick={toggleViewMode}
					title="双页模式"
				>
					<BookOpen class="h-4 w-4" />
				</Button>

				<div class="w-px h-6 bg-border mx-1"></div>

				<!-- 全屏 -->
				<Button
					variant={isFullscreen ? 'default' : 'ghost'}
					size="icon"
					class="h-8 w-8"
					onclick={toggleFullscreen}
					title="全屏"
				>
					<Maximize class="h-4 w-4" />
				</Button>
			</div>
		</div>
	</div>
</div>
