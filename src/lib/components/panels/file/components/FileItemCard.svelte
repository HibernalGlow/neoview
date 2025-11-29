<script lang="ts">
	/**
	 * FileItemCard - 共用的文件项展示组件
	 * 支持列表视图和网格视图，显示缩略图、名称、信息等
	 * 用于 FileBrowser、HistoryPanel、BookmarkPanel
	 */
	import {
		Folder,
		File,
		Image,
		FileArchive,
		Check,
		Star,
		FolderOpen,
		Package,
		Video,
		Eye,
		BookOpen,
		X
	} from '@lucide/svelte';
	import type { FsItem } from '$lib/types';
	import { bookmarkStore } from '$lib/stores/bookmark.svelte';
	import {
		emmMetadataStore,
		isCollectTagHelper,
		collectTagMap,
		emmTranslationStore
	} from '$lib/stores/emmMetadata.svelte';
	import type { EMMCollectTag, EMMTranslationDict } from '$lib/api/emm';
	import { getFileMetadata } from '$lib/api';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let {
		item,
		thumbnail = undefined,
		viewMode = 'list' as 'list' | 'grid',
		isSelected = false,
		isCheckMode = false,
		isDeleteMode = false,
		isChecked = false,
		showReadMark = false,
		showBookmarkMark = true,
		showSizeAndModified = false,
		currentPage = undefined,
		totalPages = undefined,
		timestamp = undefined,
		onClick = undefined,
		onDoubleClick = undefined,
		onContextMenu = undefined,
		onToggleSelection = undefined,
		onDelete = undefined,
		onOpenAsBook = undefined
	}: {
		item: FsItem;
		thumbnail?: string;
		viewMode?: 'list' | 'grid';
		isSelected?: boolean;
		isChecked?: boolean;
		isCheckMode?: boolean;
		isDeleteMode?: boolean;
		showReadMark?: boolean;
		showBookmarkMark?: boolean;
		showSizeAndModified?: boolean;
		currentPage?: number;
		totalPages?: number;
		timestamp?: number;
		onClick?: () => void;
		onDoubleClick?: () => void;
		onContextMenu?: (e: MouseEvent) => void;
		onToggleSelection?: () => void;
		onDelete?: () => void;
		onOpenAsBook?: () => void;
	} = $props();

	// 检查是否为收藏（使用 $derived 避免在每次渲染时调用）
	const isBookmarked = $derived.by(() => {
		if (!showBookmarkMark) return false;
		try {
			const bookmarks = bookmarkStore.getAll();
			return bookmarks.some((b) => b.path === item.path);
		} catch (err) {
			console.debug('检查收藏状态失败:', err);
			return false;
		}
	});

	// 判断文件类型
	const isArchive = $derived(
		item.name.endsWith('.zip') ||
			item.name.endsWith('.cbz') ||
			item.name.endsWith('.rar') ||
			item.name.endsWith('.cbr') ||
			item.name.endsWith('.7z') ||
			item.name.endsWith('.cb7')
	);

	// EMM 元数据
	let emmMetadata = $state<{ translatedTitle?: string; tags?: Record<string, string[]>; rating?: number } | null>(
		null
	);
	// let collectTags = $state<EMMCollectTag[]>([]); // No longer needed locally
	let metadataLoading = $state(false);
	let lastLoadedPath = $state<string | null>(null);

	// 订阅全局 EMM 设置
	let enableEMM = $state(true);
	let fileListTagDisplayMode = $state<'all' | 'collect' | 'none'>('collect');
	let translationDict = $state<EMMTranslationDict | undefined>(undefined);

	$effect(() => {
		const unsubscribe = emmMetadataStore.subscribe((state) => {
			enableEMM = state.enableEMM;
			fileListTagDisplayMode = state.fileListTagDisplayMode;
			translationDict = state.translationDict;
		});
		return unsubscribe;
	});

	// 文件夹平均评分
	let folderAverageRating = $state<number | null>(null);

	// 加载文件夹平均评分（仅针对文件夹）
	$effect(() => {
		if (enableEMM && item.isDir && item.path) {
			import('$lib/stores/emm/folderRating').then(({ folderRatingStore }) => {
				const entry = folderRatingStore.getFolderRating(item.path);
				folderAverageRating = entry?.averageRating ?? null;
			});
		} else {
			folderAverageRating = null;
		}
	});

	// 加载 EMM 元数据（仅针对压缩包，且路径变化时加载）
	$effect(() => {
		if (
			enableEMM &&
			isArchive &&
			item.path &&
			!item.isDir &&
			item.path !== lastLoadedPath &&
			!metadataLoading
		) {
			metadataLoading = true;
			lastLoadedPath = item.path;

			// console.debug('[FileItemCard] 开始加载 EMM 元数据 (Archive):', item.name);

			// 立即加载，不使用随机延迟
			emmMetadataStore
				.loadMetadataByPath(item.path)
				.then((metadata) => {
					if (metadata && item.path === lastLoadedPath) {
						emmMetadata = {
							translatedTitle: metadata.translated_title,
							tags: metadata.tags,
							rating: metadata.rating
						};
						// console.debug('[FileItemCard] EMM 元数据加载成功:', item.name);
					}
					metadataLoading = false;
				})
				.catch((err) => {
					console.error('[FileItemCard] EMM 元数据加载失败:', item.name, err);
					metadataLoading = false;
				});

			return () => {
				metadataLoading = false;
			};
		} else if (!enableEMM) {
			// 如果禁用了 EMM，清除元数据
			emmMetadata = null;
			lastLoadedPath = null;
		}
	});

	// 获取显示的标签（前3个，高亮收藏的）
	const displayTags = $derived(() => {
		if (!emmMetadata?.tags || fileListTagDisplayMode === 'none') return [];

		const map = $collectTagMap; // Use the shared map
		const normalize = (s: string) => s.trim().toLowerCase();

		const allTags: Array<{ tag: string; isCollect: boolean; color?: string; display?: string }> =
			[];

		for (const [category, tags] of Object.entries(emmMetadata.tags)) {
			for (const tag of tags) {
				// 尝试多种组合查找
				const fullTagKey = normalize(`${category}:${tag}`);
				let collectTag = map.get(fullTagKey);

				if (!collectTag) {
					collectTag = map.get(normalize(tag));
				}

				const isCollect = !!collectTag;

				// 根据显示模式过滤
				if (fileListTagDisplayMode === 'collect' && !isCollect) {
					continue;
				}

				// 翻译和缩写
				const translatedTag = emmTranslationStore.translateTag(tag, category, translationDict);
				const shortCategory = emmTranslationStore.getShortNamespace(category);
				const displayStr = `${shortCategory}:${translatedTag}`;

				allTags.push({
					tag: `${category}:${tag}`,
					isCollect,
					color: collectTag?.color,
					display: displayStr // 使用翻译后的显示
				});
			}
		}

		// 收藏标签优先显示
		const collectTagsList = allTags.filter((t) => t.isCollect);
		const normalTagsList = allTags.filter((t) => !t.isCollect);

		// 如果有收藏标签，优先展示收藏标签；否则展示普通标签
		// 不限制数量，显示完整
		return [...collectTagsList, ...normalTagsList];
	});

	// 文件夹预览相关
	let showPreview = $state(false);
	let previewItems = $state<FsItem[]>([]);
	let previewLoading = $state(false);
	let previewIconElement = $state<HTMLElement | null>(null);
	let folderTotalSize = $state<number | null>(null);
	let folderSizeLoading = $state(false);

	// 加载文件夹预览内容
	async function loadFolderPreview() {
		if (!item.isDir || previewLoading) return;

		previewLoading = true;
		try {
			const { invoke } = await import('@tauri-apps/api/core');
			const items = await invoke<FsItem[]>('read_directory', { path: item.path });
			// 只取前10个项目作为预览
			previewItems = items.slice(0, 10);
		} catch (error) {
			console.error('加载文件夹预览失败:', error);
			previewItems = [];
		} finally {
			previewLoading = false;
		}
	}

	// 异步加载目录总字节大小（仅在需要显示大小+时间时，对目录生效）
	$effect(() => {
		if (!showSizeAndModified) return;
		if (!item.isDir) return;
		if (folderTotalSize !== null || folderSizeLoading) return;

		folderSizeLoading = true;
		getFileMetadata(item.path)
			.then((meta) => {
				folderTotalSize = meta.size ?? 0;
			})
			.catch((err) => {
				console.debug('获取文件夹总大小失败:', item.path, err);
			})
			.finally(() => {
				folderSizeLoading = false;
			});
	});

	// 格式化时间
	function formatTime(ts?: number): string {
		if (!ts) return '';
		const now = Date.now();
		const diff = now - ts;
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return '刚刚';
		if (minutes < 60) return `${minutes}分钟前`;
		if (hours < 24) return `${hours}小时前`;
		if (days < 7) return `${days}天前`;
		return new Date(ts).toLocaleDateString();
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

	const isReadCompleted = $derived(
		currentPage !== undefined &&
			totalPages !== undefined &&
			totalPages > 0 &&
			currentPage >= totalPages - 1
	);
</script>

{#if viewMode === 'list'}
	<!-- 列表视图 -->
	<div
		class="border-border group relative flex cursor-pointer items-center gap-3 rounded-md border p-2 transition-colors {isSelected
			? 'bg-accent text-accent-foreground border-accent'
			: 'hover:bg-accent/40'}"
		onclick={(e) => {
			e.stopPropagation();
			onClick?.();
		}}
		oncontextmenu={onContextMenu}
		onkeydown={(e) => {
			if ((e.key === 'Enter' || e.key === ' ') && onClick) {
				e.preventDefault();
				onClick();
			}
		}}
		role="button"
		tabindex="0"
	>
		<!-- 勾选框（勾选模式） -->
		{#if isCheckMode}
			<button
				class="group/checkbox flex-shrink-0 rounded-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				onclick={(e) => {
					e.stopPropagation();
					onToggleSelection?.();
				}}
				aria-label={isChecked ? '取消选择' : '选择'}
			>
				<div
					class="flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all duration-200 {isChecked
						? 'border-primary bg-primary text-primary-foreground shadow-md scale-105'
						: 'border-input bg-background hover:border-primary hover:bg-accent group-hover/checkbox:scale-110'}"
				>
					{#if isChecked}
						<Check class="h-3.5 w-3.5 animate-in zoom-in-50 duration-200" />
					{/if}
				</div>
			</button>
		{/if}

		<!-- 删除按钮（删除模式） -->
		{#if isDeleteMode}
			<button
				class="group/delete flex-shrink-0 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
				onclick={(e) => {
					e.stopPropagation();
					onDelete?.();
				}}
				title="删除"
				aria-label="删除"
			>
				<div
					class="flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md transition-all duration-200 hover:bg-destructive/90 hover:shadow-lg group-hover/delete:scale-110"
				>
					<X class="h-3.5 w-3.5" />
				</div>
			</button>
		{/if}

		<!-- 缩略图或图标 -->
		<div
			class="relative flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded"
		>
			{#if thumbnail}
				<img
					src={thumbnail}
					alt={item.name}
					class="h-full w-full object-cover transition-transform group-hover:scale-105"
				/>
			{:else if item.isDir}
				<Folder class="text-primary group-hover:text-primary h-8 w-8 transition-colors" />
			{:else if isArchive}
				<FileArchive class="text-primary group-hover:text-primary h-8 w-8 transition-colors" />
			{:else if item.isImage}
				<Image class="text-primary group-hover:text-primary h-8 w-8 transition-colors" />
			{:else}
				<File class="h-8 w-8 text-gray-400 transition-colors group-hover:text-gray-500" />
			{/if}

			<!-- 阅读标记（对勾） -->
			{#if showReadMark}
				{#if isReadCompleted}
					<div class="bg-primary absolute right-0 top-0 rounded-full p-0.5">
						<Check class="h-3 w-3 text-white" />
					</div>
				{:else}
					<div
						class="border-primary bg-background/80 absolute right-0 top-0 rounded-full border border-dashed p-0.5"
					>
						<Check class="text-primary h-3 w-3" />
					</div>
				{/if}
			{/if}

			<!-- 收藏标记（星标） -->
			{#if isBookmarked}
				<div class="bg-primary absolute bottom-0 right-0 rounded-full p-0.5">
					<Star class="h-3 w-3 fill-white text-white" />
				</div>
			{/if}
		</div>

		<!-- 信息 -->
		<div class="min-w-0 flex-1">
			<!-- 原文件名 -->
			<div class="flex flex-wrap items-center gap-2 break-words font-medium" title={item.name}>
				<span>{item.name}</span>
				<!-- 文件夹统计信息 -->
				{#if item.isDir}
					<div class="flex items-center gap-1.5 text-xs">
						{#if item.folderCount !== undefined && item.folderCount > 0}
							<Tooltip.Root>
								<Tooltip.Trigger>
									<span
										class="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5"
									>
										<FolderOpen class="h-3 w-3" />
										<span class="font-medium">{item.folderCount}</span>
									</span>
								</Tooltip.Trigger>
								<Tooltip.Content>
									<p>子文件夹数量</p>
								</Tooltip.Content>
							</Tooltip.Root>
						{/if}
						{#if item.archiveCount !== undefined && item.archiveCount > 0}
							<Tooltip.Root>
								<Tooltip.Trigger>
									<span
										class="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5"
									>
										<Package class="h-3 w-3" />
										<span class="font-medium">{item.archiveCount}</span>
									</span>
								</Tooltip.Trigger>
								<Tooltip.Content>
									<p>压缩包数量</p>
								</Tooltip.Content>
							</Tooltip.Root>
						{/if}
						{#if item.videoCount !== undefined && item.videoCount > 0}
							<Tooltip.Root>
								<Tooltip.Trigger>
									<span
										class="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5"
									>
										<Video class="h-3 w-3" />
										<span class="font-medium">{item.videoCount}</span>
									</span>
								</Tooltip.Trigger>
								<Tooltip.Content>
									<p>视频数量</p>
								</Tooltip.Content>
							</Tooltip.Root>
						{/if}
						{#if folderAverageRating !== null}
							<Tooltip.Root>
								<Tooltip.Trigger>
									<span class="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-600 dark:text-amber-400">
										<Star class="h-3 w-3 fill-current" />
										<span class="font-medium">{folderAverageRating.toFixed(1)}</span>
									</span>
								</Tooltip.Trigger>
								<Tooltip.Content>
									<p>平均评分: {folderAverageRating.toFixed(2)}</p>
								</Tooltip.Content>
							</Tooltip.Root>
						{/if}
						<!-- 预览图标 -->
						<Tooltip.Root>
							<Tooltip.Trigger>
								<button
									bind:this={previewIconElement}
									class="hover:bg-accent inline-flex items-center justify-center rounded-md p-1 transition-colors"
									onmouseenter={() => {
										showPreview = true;
										loadFolderPreview();
									}}
									onmouseleave={() => {
										showPreview = false;
									}}
									onclick={(e) => {
										e.stopPropagation();
									}}
								>
									<Eye class="text-muted-foreground h-3.5 w-3.5" />
								</button>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>预览文件夹内容</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<!-- 作为书籍打开图标 -->
						<Tooltip.Root>
							<Tooltip.Trigger>
								<button
									class="hover:bg-accent inline-flex items-center justify-center rounded-md p-1 transition-colors"
									onclick={(e) => {
										e.stopPropagation();
										onOpenAsBook?.();
									}}
								>
									<BookOpen class="text-muted-foreground h-3.5 w-3.5" />
								</button>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>作为书籍打开此文件夹</p>
							</Tooltip.Content>
						</Tooltip.Root>
					</div>
				{/if}
			</div>

			<!-- 预览弹窗 -->
			{#if item.isDir && showPreview}
				<div
					class="border-border bg-popover absolute left-0 top-full z-50 mt-1 w-64 rounded-md border p-2 shadow-lg"
					role="tooltip"
					tabindex="-1"
					onmouseenter={() => {
						showPreview = true;
					}}
					onmouseleave={() => {
						showPreview = false;
					}}
				>
					<div class="text-popover-foreground mb-2 text-xs font-medium">文件夹预览</div>
					{#if previewLoading}
						<div class="text-muted-foreground py-2 text-center text-xs">加载中...</div>
					{:else if previewItems.length === 0}
						<div class="text-muted-foreground py-2 text-center text-xs">空文件夹</div>
					{:else}
						<div class="max-h-64 space-y-1 overflow-y-auto">
							{#each previewItems as previewItem}
								<div class="hover:bg-accent flex items-center gap-2 rounded px-2 py-1 text-xs">
									{#if previewItem.isDir}
										<Folder class="h-3 w-3 flex-shrink-0 text-blue-500" />
									{:else if previewItem.isImage}
										<Image class="h-3 w-3 flex-shrink-0 text-green-500" />
									{:else if previewItem.name.endsWith('.zip') || previewItem.name.endsWith('.cbz') || previewItem.name.endsWith('.rar') || previewItem.name.endsWith('.cbr')}
										<FileArchive class="h-3 w-3 flex-shrink-0 text-purple-500" />
									{:else}
										<File class="h-3 w-3 flex-shrink-0 text-gray-400" />
									{/if}
									<span class="text-foreground truncate">{previewItem.name}</span>
								</div>
							{/each}
							{#if item.size > 10}
								<div
									class="text-muted-foreground border-border mt-1 border-t px-2 py-1 text-center text-xs"
								>
									还有 {item.size - 10} 个项目...
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
			<!-- 翻译标题和评分 -->
			{#if emmMetadata && (emmMetadata.translatedTitle || emmMetadata.rating !== undefined)}
				<div class="mt-1 flex flex-wrap items-center gap-2">
					{#if emmMetadata.translatedTitle && emmMetadata.translatedTitle !== item.name}
						<span
							class="border-primary/20 bg-primary/10 text-primary break-words rounded border px-1.5 py-0.5 text-xs"
							title={emmMetadata.translatedTitle}
						>
							{emmMetadata.translatedTitle}
						</span>
					{/if}
					{#if emmMetadata.rating !== undefined && emmMetadata.rating > 0}
						<Tooltip.Root>
							<Tooltip.Trigger>
								<span class="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600 dark:text-amber-400">
									<Star class="h-3 w-3 fill-current" />
									<span class="font-medium">{emmMetadata.rating.toFixed(1)}</span>
								</span>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>评分: {emmMetadata.rating.toFixed(2)}</p>
							</Tooltip.Content>
						</Tooltip.Root>
					{/if}
				</div>
			{/if}
			<div class="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
				{#if showSizeAndModified}
					<span>{formatSize(item.size || 0, item.isDir || false)}</span>
					{#if timestamp}
						<span>· {formatTime(timestamp)}</span>
					{/if}
					{#if item.isDir && folderTotalSize !== null}
						<span>· {formatSize(folderTotalSize || 0, false)}</span>
					{/if}
				{:else}
					{#if currentPage !== undefined && totalPages !== undefined}
						<span>页码: {currentPage}/{totalPages}</span>
					{/if}
					{#if timestamp}
						<span>{formatTime(timestamp)}</span>
					{/if}
					{#if !currentPage && !timestamp}
						<span>{formatSize(item.size || 0, item.isDir || false)}</span>
					{/if}
				{/if}
			</div>
			{#if displayTags().length > 0}
				<div class="mt-1 flex flex-wrap items-center gap-1">
					{#each displayTags() as tagInfo}
						<span
							class="inline-flex items-center rounded border px-1.5 py-0.5 text-xs {tagInfo.isCollect
								? 'font-semibold'
								: 'bg-muted border-border/60 text-muted-foreground'}"
							style={tagInfo.isCollect
								? `background-color: ${tagInfo.color || '#409EFF'}20; border-color: ${tagInfo.color || '#409EFF'}40; color: ${tagInfo.color || '#409EFF'};`
								: ''}
							title={tagInfo.tag}
						>
							{tagInfo.display}
						</span>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{:else}
	<!-- 网格视图 -->
	<div
		class="border-border group relative flex cursor-pointer flex-col overflow-hidden rounded border transition-all hover:shadow-md {isSelected
			? 'border-primary ring-2'
			: ''}"
		onclick={(e) => {
			e.stopPropagation();
			onClick?.();
		}}
		oncontextmenu={onContextMenu}
		onkeydown={(e) => {
			if ((e.key === 'Enter' || e.key === ' ') && onClick) {
				e.preventDefault();
				onClick();
			}
		}}
		role="button"
		tabindex="0"
	>
		<!-- 缩略图区域 -->
		<div class="bg-secondary relative aspect-[3/4] w-full overflow-hidden">
			{#if thumbnail}
				<img
					src={thumbnail}
					alt={item.name}
					class="h-full w-full object-cover transition-transform group-hover:scale-105"
				/>
			{:else if item.isDir}
				<div class="flex h-full w-full items-center justify-center">
					<Folder class="text-primary h-16 w-16" />
				</div>
			{:else if isArchive}
				<div class="flex h-full w-full items-center justify-center">
					<FileArchive class="text-primary h-16 w-16" />
				</div>
			{:else if item.isImage}
				<div class="flex h-full w-full items-center justify-center">
					<Image class="text-primary h-16 w-16" />
				</div>
			{:else}
				<div class="flex h-full w-full items-center justify-center">
					<File class="h-16 w-16 text-gray-400" />
				</div>
			{/if}

			<!-- 阅读标记（对勾） -->
			{#if showReadMark}
				{#if isReadCompleted}
					<div class="bg-primary absolute right-2 top-2 rounded-full p-1">
						<Check class="h-4 w-4 text-white" />
					</div>
				{:else}
					<div
						class="border-primary bg-background/80 absolute right-2 top-2 rounded-full border border-dashed p-1"
					>
						<Check class="text-primary h-4 w-4" />
					</div>
				{/if}
			{/if}

			<!-- 收藏标记（星标） -->
			{#if isBookmarked}
				<div class="bg-primary absolute left-2 top-2 rounded-full p-1">
					<Star class="h-4 w-4 fill-white text-white" />
				</div>
			{/if}

			<!-- 进度条（历史记录） -->
			{#if currentPage !== undefined && totalPages !== undefined && totalPages > 0}
				<div class="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
					<div
						class="bg-primary h-full transition-all"
						style="width: {(currentPage / totalPages) * 100}%"
					></div>
				</div>
			{/if}
		</div>

		<!-- 信息区域 -->
		<div class="bg-background p-2">
			<!-- 原文件名 -->
			<div class="break-words text-sm font-medium" title={item.name}>
				{item.name}
			</div>
			<!-- 文件夹统计信息 -->
			{#if item.isDir}
				<div class="mt-1 flex flex-wrap items-center gap-1">
					{#if item.folderCount !== undefined && item.folderCount > 0}
						<Tooltip.Root>
							<Tooltip.Trigger>
								<span
									class="bg-secondary text-secondary-foreground inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px]"
								>
									<FolderOpen class="h-2.5 w-2.5" />
									<span class="font-medium">{item.folderCount}</span>
								</span>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>子文件夹数量</p>
							</Tooltip.Content>
						</Tooltip.Root>
					{/if}
					{#if item.archiveCount !== undefined && item.archiveCount > 0}
						<Tooltip.Root>
							<Tooltip.Trigger>
								<span
									class="bg-secondary text-secondary-foreground inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px]"
								>
									<Package class="h-2.5 w-2.5" />
									<span class="font-medium">{item.archiveCount}</span>
								</span>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>压缩包数量</p>
							</Tooltip.Content>
						</Tooltip.Root>
					{/if}
					{#if item.videoCount !== undefined && item.videoCount > 0}
						<Tooltip.Root>
							<Tooltip.Trigger>
								<span
									class="bg-secondary text-secondary-foreground inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px]"
								>
									<Video class="h-2.5 w-2.5" />
									<span class="font-medium">{item.videoCount}</span>
								</span>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>视频数量</p>
							</Tooltip.Content>
						</Tooltip.Root>
					{/if}
					{#if folderAverageRating !== null}
						<Tooltip.Root>
							<Tooltip.Trigger>
								<span class="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
									<Star class="h-2.5 w-2.5 fill-current" />
									<span class="font-medium">{folderAverageRating.toFixed(1)}</span>
								</span>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>平均评分: {folderAverageRating.toFixed(2)}</p>
							</Tooltip.Content>
						</Tooltip.Root>
					{/if}
					{#if onOpenAsBook}
						<Tooltip.Root>
							<Tooltip.Trigger>
								<button
									class="hover:bg-accent inline-flex items-center justify-center rounded-md p-1 text-[10px] transition-colors"
									onclick={(e) => {
										e.stopPropagation();
										onOpenAsBook?.();
									}}
								>
									<BookOpen class="text-muted-foreground h-3 w-3" />
								</button>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>作为书籍打开此文件夹</p>
							</Tooltip.Content>
						</Tooltip.Root>
					{/if}
				</div>
			{/if}
			<!-- 翻译标题和评分 -->
			{#if emmMetadata && (emmMetadata.translatedTitle || emmMetadata.rating !== undefined)}
				<div class="mt-1 flex flex-wrap items-center gap-1">
					{#if emmMetadata.translatedTitle && emmMetadata.translatedTitle !== item.name}
						<span
							class="border-primary/20 bg-primary/10 text-primary break-words rounded border px-1 py-0.5 text-[10px]"
							title={emmMetadata.translatedTitle}
						>
							{emmMetadata.translatedTitle}
						</span>
					{/if}
					{#if emmMetadata.rating !== undefined && emmMetadata.rating > 0}
						<Tooltip.Root>
							<Tooltip.Trigger>
								<span class="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
									<Star class="h-2.5 w-2.5 fill-current" />
									<span class="font-medium">{emmMetadata.rating.toFixed(1)}</span>
								</span>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>评分: {emmMetadata.rating.toFixed(2)}</p>
							</Tooltip.Content>
						</Tooltip.Root>
					{/if}
				</div>
			{/if}
			<div class="text-muted-foreground mt-1 text-xs">
				{#if showSizeAndModified}
					<span>{formatSize(item.size || 0, item.isDir || false)}</span>
					{#if timestamp}
						<span>· {formatTime(timestamp)}</span>
					{/if}
					{#if item.isDir && folderTotalSize !== null}
						<span>· {formatSize(folderTotalSize || 0, false)}</span>
					{/if}
				{:else if currentPage !== undefined && totalPages !== undefined}
					<span>{currentPage}/{totalPages}</span>
				{:else if timestamp}
					<span>{formatTime(timestamp)}</span>
				{:else}
					<span>{formatSize(item.size || 0, item.isDir || false)}</span>
				{/if}
			</div>
			{#if displayTags().length > 0}
				<div class="mt-1 flex flex-wrap items-center gap-1">
					{#each displayTags() as tagInfo}
						<span
							class="inline-flex items-center rounded border px-1 py-0.5 text-[10px] {tagInfo.isCollect
								? 'font-semibold'
								: 'bg-muted border-border/60 text-muted-foreground'}"
							style={tagInfo.isCollect
								? `background-color: ${tagInfo.color || '#409EFF'}20; border-color: ${tagInfo.color || '#409EFF'}40; color: ${tagInfo.color || '#409EFF'};`
								: ''}
							title={tagInfo.tag}
						>
							{tagInfo.display}
						</span>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}
