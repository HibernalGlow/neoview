<script lang="ts">
	/**
	 * Page List Panel
	 * 页面列表面板 - 显示当前书籍的所有页面
	 */
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Image, FileText, Search } from '@lucide/svelte';

	interface PageInfo {
		index: number;
		name: string;
		width: number;E:
        1Hub
        EH
        waittouplooad
        [冬扇草堂 (冬扇)]
        3. 单行本
        选择文件夹
        ←
        
        [2013] もう堕ちるしかない [4K掃圖組].zip
        126.7 MB · 2025/9/26 02:47:32
        
        [2017] もう堕ちるしかない 新装版 [日原版].zip
        113.2 MB · 2025/9/26 02:47:33
        
        [2017] 快楽人形イデオロギー [4K掃圖組].zip
        205.8 MB · 2025/9/26 02:47:30
        
        
        D:
        Comics
        Volume 1
		height: number;
		size: string;
	}

	// 模拟数据 - 实际应从 store 获取
	let pages = $state<PageInfo[]>([
		{ index: 1, name: 'page_001.jpg', width: 1920, height: 1080, size: '2.5 MB' },
		{ index: 2, name: 'page_002.jpg', width: 1920, height: 1080, size: '2.3 MB' },
		{ index: 3, name: 'page_003.jpg', width: 1920, height: 1080, size: '2.8 MB' },
		{ index: 4, name: 'page_004.jpg', width: 1920, height: 1080, size: '2.6 MB' },
		{ index: 5, name: 'page_005.jpg', width: 1920, height: 1080, size: '2.4 MB' }
	]);

	let currentPage = $state(1);
	let searchQuery = $state('');

	// 过滤页面
	const filteredPages = $derived(
		searchQuery.trim()
			? pages.filter(
					(p) =>
						p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
						p.index.toString().includes(searchQuery)
				)
			: pages
	);

	function goToPage(index: number) {
		currentPage = index;
		// TODO: 发送事件到主视图切换页面
		console.log('跳转到页面', index);
	}

	function formatDimensions(width: number, height: number): string {
		return `${width} × ${height}`;
	}
</script>

<div class="h-full flex flex-col bg-background">
	<!-- 头部 -->
	<div class="p-3 border-b">
		<h3 class="text-sm font-semibold mb-2 flex items-center gap-2">
			<FileText class="h-4 w-4" />
			页面列表 ({filteredPages.length}/{pages.length})
		</h3>

		<!-- 搜索栏 -->
		<div class="relative">
			<Search class="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
			<Input
				type="text"
				placeholder="搜索页面..."
				bind:value={searchQuery}
				class="pl-7 h-8 text-sm"
			/>
		</div>
	</div>

	<!-- 页面列表 -->
	<div class="flex-1 overflow-y-auto">
		{#if filteredPages.length === 0}
			<div class="p-4 text-center text-sm text-muted-foreground">未找到匹配的页面</div>
		{:else}
			<div class="p-2 space-y-1">
				{#each filteredPages as page}
					<button
						class="w-full flex items-center gap-3 p-2 rounded-md hover:bg-accent transition-colors text-left {currentPage ===
						page.index
							? 'bg-primary/10 border border-primary/30'
							: ''}"
						onclick={() => goToPage(page.index)}
					>
						<!-- 页面缩略图占位 -->
						<div
							class="w-12 h-16 rounded bg-muted flex items-center justify-center flex-shrink-0"
						>
							<Image class="h-6 w-6 text-muted-foreground" />
						</div>

						<!-- 页面信息 -->
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<span class="text-xs font-mono font-semibold text-primary">#{page.index}</span>
								{#if currentPage === page.index}
									<span
										class="px-1.5 py-0.5 text-[10px] font-semibold bg-primary text-primary-foreground rounded"
									>
										当前
									</span>
								{/if}
							</div>
							<div class="text-xs text-foreground truncate" title={page.name}>
								{page.name}
							</div>
							<div class="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
								<span>{formatDimensions(page.width, page.height)}</span>
								<span>•</span>
								<span>{page.size}</span>
							</div>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- 底部统计 -->
	<div class="p-2 border-t text-[10px] text-muted-foreground text-center">
		{#if currentPage > 0 && currentPage <= pages.length}
			正在查看第 {currentPage} 页，共 {pages.length} 页
		{:else}
			共 {pages.length} 页
		{/if}
	</div>
</div>
