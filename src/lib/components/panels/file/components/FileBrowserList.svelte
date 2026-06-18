<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import type { FsItem } from '$lib/types';
	import { enqueueVisible, bumpPriority } from '$lib/utils/thumbnailManager';
	import { Folder, File, Image, FileArchive } from '@lucide/svelte';

	let {
		items = [],
		currentPath = '',
		thumbnails = new Map(),
		selectedIndex = -1,
		isCheckMode = false,
		isDeleteMode = false,
		selectedItems = $bindable(new Set()),
		viewMode = 'list'
	} = $props();

	const dispatch = createEventDispatcher();

	let fileListContainer = $state<HTMLDivElement | undefined>(undefined);
	let visibleRange = $state({ start: 0, end: 30 });
	let itemHeight = 60; // 估计的每个项目高度
	let containerHeight = 600; // 估计的容器高度

	// 计算可见范围
	function updateVisibleRange() {
		if (!fileListContainer) return;

		const scrollTop = fileListContainer.scrollTop;
		const containerHeight = fileListContainer.clientHeight;

		const start = Math.floor(scrollTop / itemHeight);
		const visibleCount = Math.ceil(containerHeight / itemHeight);
		const end = Math.min(start + visibleCount + 5, items.length); // 预加载5个额外的项目

		visibleRange = { start, end };

		// 触发可见范围变化事件
		handleVisibleRangeChange();
	}

	// 处理可见范围变化
	function handleVisibleRangeChange() {
		if (!currentPath || items.length === 0) return;

		const visibleItems = items.slice(visibleRange.start, visibleRange.end);

		// 过滤需要缩略图的项目
		const thumbnailItems = visibleItems.filter(
			(item) =>
				item.isDir ||
				item.isImage ||
				item.name.endsWith('.zip') ||
				item.name.endsWith('.cbz') ||
				item.name.endsWith('.rar') ||
				item.name.endsWith('.cbr')
		);

		// 过滤已有缩略图的项目
		const needThumbnails = thumbnailItems.filter((item) => {
			const key = item.path.replace(/\\/g, '/').split('/').pop() || item.path;
			return !thumbnails.has(key);
		});

		if (needThumbnails.length > 0) {
			console.log(
				`👁️ 可见范围更新: ${visibleRange.start}-${visibleRange.end}, 需要缩略图: ${needThumbnails.length}`
			);
			// 过滤出路径字符串数组
			enqueueVisible(
				needThumbnails.map((t) => t.path),
				currentPath
			);
		}
	}

	// 处理滚动事件
	function handleScroll() {
		updateVisibleRange();
	}

	// 处理项目点击
	function handleItemClick(item: FsItem, index: number) {
		dispatch('itemClick', { item, index });
	}

	// 处理项目右键
	function handleItemContextMenu(event: MouseEvent, item: FsItem) {
		dispatch('itemContextMenu', { event, item });
	}

	// 格式化文件大小
	function formatSize(bytes: number, isDir: boolean): string {
		if (isDir) {
			return bytes === 0 ? '空文件夹' : `${bytes} 项`;
		}
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
		return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
	}

	// 格式化日期
	function formatDate(timestamp?: number): string {
		if (!timestamp) return '-';
		const date = new Date(timestamp * 1000);
		return date.toLocaleString();
	}

	// 切换项目选中状态
	function toggleItemSelection(path: string) {
		if (selectedItems.has(path)) {
			selectedItems.delete(path);
		} else {
			selectedItems.add(path);
		}
		selectedItems = selectedItems; // 触发响应式更新
	}

	// 获取缩略图键
	function getThumbnailKey(item: FsItem): string {
		return item.path.replace(/\\/g, '/').split('/').pop() || item.path;
	}

	// 组件挂载时初始化
	onMount(() => {
		if (fileListContainer) {
			// 更新容器高度
			containerHeight = fileListContainer.clientHeight;
			updateVisibleRange();
		}
	});

	// 监听项目变化
	$effect(() => {
		if (items.length > 0) {
			updateVisibleRange();
		}
	});
</script>

<div
	bind:this={fileListContainer}
	class="file-browser-list flex-1 overflow-y-auto p-2 focus:outline-none"
	onscroll={handleScroll}
>
	{#if viewMode === 'list'}
		<!-- 列表视图 -->
		<div class="grid grid-cols-1 gap-2" style="min-height: {items.length * itemHeight}px;">
			{#each items as item, index (item.path)}
				{#if index >= visibleRange.start - 5 && index <= visibleRange.end + 5}
					<!-- 渲染可见项目及少量额外项目 -->
					<div
						class="group flex cursor-pointer items-center gap-3 rounded border p-2 transition-colors {selectedIndex ===
						index
							? 'bg-primary/10 border-primary'
							: 'hover:bg-accent/50 border-border'}"
						style="height: {itemHeight}px;"
						onclick={() => handleItemClick(item, index)}
						oncontextmenu={(e) => handleItemContextMenu(e, item)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								handleItemClick(item, index);
							}
						}}
						role="button"
						tabindex="0"
					>
						<!-- 勾选框（勾选模式） -->
						{#if isCheckMode}
							<button
								class="shrink-0"
								onclick={(e) => {
									e.stopPropagation();
									toggleItemSelection(item.path);
								}}
							>
								<div
									class="flex h-5 w-5 items-center justify-center rounded border-2 transition-colors {selectedItems.has(
										item.path
									)
										? 'bg-primary border-primary'
										: 'border-input hover:border-primary'}"
								>
									{#if selectedItems.has(item.path)}
										<svg
											class="h-3 w-3 text-white"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="3"
												d="M5 13l4 4L19 7"
											></path>
										</svg>
									{/if}
								</div>
							</button>
						{/if}

						<!-- 删除按钮（删除模式） -->
						{#if isDeleteMode}
							<button
								class="shrink-0"
								onclick={(e) => {
									e.stopPropagation();
									dispatch('deleteItem', { item });
								}}
								title="删除"
							>
								<div
									class="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 transition-colors hover:bg-red-600"
								>
									<svg
										class="h-3 w-3 text-white"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
										></path>
									</svg>
								</div>
							</button>
						{/if}

						<!-- 图标或缩略图 -->
						<div
							class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded"
						>
							{#if thumbnails.has(getThumbnailKey(item))}
								<!-- 显示缩略图 -->
								<img
									src={thumbnails.get(getThumbnailKey(item))}
									alt={item.name}
									class="h-full w-full object-cover transition-transform group-hover:scale-105"
								/>
							{:else if item.is_dir}
								<Folder class="text-primary group-hover:text-primary h-8 w-8 transition-colors" />
							{:else if item.name.endsWith('.zip') || item.name.endsWith('.cbz')}
								<FileArchive
									class="text-primary group-hover:text-primary h-8 w-8 transition-colors"
								/>
							{:else if item.isImage}
								<Image class="text-primary group-hover:text-primary h-8 w-8 transition-colors" />
							{:else}
								<File
									class="text-muted-foreground group-hover:text-muted-foreground/80 h-8 w-8 transition-colors"
								/>
							{/if}
						</div>

						<!-- 信息 -->
						<div class="min-w-0 flex-1">
							<div class="truncate font-medium">{item.name}</div>
							<div class="text-muted-foreground text-xs">
								{formatSize(item.size, item.isDir)} · {formatDate(item.modified)}
							</div>
						</div>
					</div>
				{:else}
					<!-- 占位符 -->
					<div style="height: {itemHeight}px;"></div>
				{/if}
			{/each}
		</div>
	{:else}
		<!-- 缩略图网格视图 -->
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
			{#each items as item, index (item.path)}
				<div
					class="group flex cursor-pointer flex-col items-center gap-2 rounded border p-2 transition-colors {selectedIndex ===
					index
						? 'bg-primary/10 border-primary'
						: 'hover:bg-accent/50 border-border'}"
					onclick={() => handleItemClick(item, index)}
					oncontextmenu={(e) => handleItemContextMenu(e, item)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							handleItemClick(item, index);
						}
					}}
					role="button"
					tabindex="0"
				>
					<!-- 勾选框（勾选模式） -->
					{#if isCheckMode}
						<button
							class="self-start"
							onclick={(e) => {
								e.stopPropagation();
								toggleItemSelection(item.path);
							}}
						>
							<div
								class="flex h-5 w-5 items-center justify-center rounded border-2 transition-colors {selectedItems.has(
									item.path
								)
									? 'bg-primary border-primary'
									: 'border-input hover:border-primary'}"
							>
								{#if selectedItems.has(item.path)}
									<svg
										class="h-3 w-3 text-white"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="3"
											d="M5 13l4 4L19 7"
										></path>
									</svg>
								{/if}
							</div>
						</button>
					{/if}

					<!-- 缩略图容器 -->
					<div
						class="bg-muted flex aspect-square w-full items-center justify-center overflow-hidden rounded"
					>
						{#if thumbnails.has(getThumbnailKey(item))}
							<!-- 显示缩略图 -->
							<img
								src={thumbnails.get(getThumbnailKey(item))}
								alt={item.name}
								class="h-full w-full object-cover transition-transform group-hover:scale-105"
							/>
						{:else if item.isDir}
							<Folder class="text-primary h-12 w-12" />
						{:else if item.name.endsWith('.zip') || item.name.endsWith('.cbz')}
							<FileArchive class="text-primary h-12 w-12" />
						{:else if item.isImage}
							<Image class="text-primary h-12 w-12" />
						{:else}
							<File class="text-muted-foreground h-12 w-12" />
						{/if}
					</div>

					<!-- 文件名 -->
					<div class="w-full text-center">
						<div class="truncate text-sm font-medium">{item.name}</div>
						<div class="text-muted-foreground text-xs">
							{formatSize(item.size, item.isDir)}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.file-browser-list {
		/* 确保滚动容器有明确的高度 */
		height: 100%;
		overflow-y: auto;
	}
</style>
