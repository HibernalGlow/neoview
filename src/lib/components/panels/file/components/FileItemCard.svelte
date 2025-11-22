<script lang="ts">
	/**
	 * FileItemCard - 共用的文件项展示组件
	 * 支持列表视图和网格视图，显示缩略图、名称、信息等
	 * 用于 FileBrowser、HistoryPanel、BookmarkPanel
	 */
	import { Folder, File, Image, FileArchive, Check, Star } from '@lucide/svelte';
	import type { FsItem } from '$lib/types';
	import { bookmarkStore } from '$lib/stores/bookmark.svelte';
	import {
		emmMetadataStore,
		isCollectTagHelper,
		collectTagMap,
		emmTranslationStore
	} from '$lib/stores/emmMetadata.svelte';
	import type { EMMCollectTag, EMMTranslationDict } from '$lib/api/emm';

	let {
		item,
		thumbnail = undefined,
		viewMode = 'list' as 'list' | 'grid',
		isSelected = false,
		isCheckMode = false,
		isDeleteMode = false,
		showReadMark = false,
		showBookmarkMark = true,
		currentPage = undefined,
		totalPages = undefined,
		timestamp = undefined,
		onClick = undefined,
		onDoubleClick = undefined,
		onContextMenu = undefined,
		onToggleSelection = undefined,
		onDelete = undefined
	}: {
		item: FsItem;
		thumbnail?: string;
		viewMode?: 'list' | 'grid';
		isSelected?: boolean;
		isCheckMode?: boolean;
		isDeleteMode?: boolean;
		showReadMark?: boolean;
		showBookmarkMark?: boolean;
		currentPage?: number;
		totalPages?: number;
		timestamp?: number;
		onClick?: () => void;
		onDoubleClick?: () => void;
		onContextMenu?: (e: MouseEvent) => void;
		onToggleSelection?: () => void;
		onDelete?: () => void;
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
	let emmMetadata = $state<{ translatedTitle?: string; tags?: Record<string, string[]> } | null>(
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
							tags: metadata.tags
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
</script>

{#if viewMode === 'list'}
	<!-- 列表视图 -->
	<div
		class="border-border group flex cursor-pointer items-center gap-3 rounded border p-2 transition-colors {isSelected
			? 'bg-primary/10 border-primary'
			: 'hover:bg-accent/10'}"
		onclick={onClick}
		ondblclick={onDoubleClick}
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
				class="flex-shrink-0"
				onclick={(e) => {
					e.stopPropagation();
					onToggleSelection?.();
				}}
			>
				<div
					class="flex h-5 w-5 items-center justify-center rounded border-2 transition-colors {isSelected
						? 'bg-primary border-primary'
						: 'border-border hover:border-primary'}"
				>
					{#if isSelected}
						<Check class="h-3 w-3 text-white" />
					{/if}
				</div>
			</button>
		{/if}

		<!-- 删除按钮（删除模式） -->
		{#if isDeleteMode}
			<button
				class="flex-shrink-0"
				onclick={(e) => {
					e.stopPropagation();
					onDelete?.();
				}}
				title="删除"
			>
				<div
					class="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 transition-colors hover:bg-red-600"
				>
					<svg class="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						></path>
					</svg>
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
				<Folder class="h-8 w-8 text-blue-500 transition-colors group-hover:text-blue-600" />
			{:else if isArchive}
				<FileArchive
					class="h-8 w-8 text-purple-500 transition-colors group-hover:text-purple-600"
				/>
			{:else if item.isImage}
				<Image class="h-8 w-8 text-green-500 transition-colors group-hover:text-green-600" />
			{:else}
				<File class="h-8 w-8 text-gray-400 transition-colors group-hover:text-gray-500" />
			{/if}

			<!-- 阅读标记（对勾） -->
			{#if showReadMark}
				<div class="absolute right-0 top-0 rounded-full bg-green-500 p-0.5">
					<Check class="h-3 w-3 text-white" />
				</div>
			{/if}

			<!-- 收藏标记（星标） -->
			{#if isBookmarked}
				<div class="absolute bottom-0 right-0 rounded-full bg-yellow-500 p-0.5">
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
					<div class="text-muted-foreground flex items-center gap-1.5 text-xs">
						{#if item.folderCount !== undefined && item.folderCount > 0}
							<span class="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700" title="子文件夹数量">
								📁 {item.folderCount}
							</span>
						{/if}
						{#if item.archiveCount !== undefined && item.archiveCount > 0}
							<span class="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700" title="压缩包数量">
								📦 {item.archiveCount}
							</span>
						{/if}
						{#if item.videoCount !== undefined && item.videoCount > 0}
							<span class="rounded bg-green-100 px-1.5 py-0.5 text-green-700" title="视频数量">
								🎬 {item.videoCount}
							</span>
						{/if}
					</div>
				{/if}
			</div>
			<!-- 翻译标题 -->
			{#if emmMetadata?.translatedTitle && emmMetadata.translatedTitle !== item.name}
				<div class="mt-1">
					<span
						class="break-words rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600"
						title={emmMetadata.translatedTitle}
					>
						{emmMetadata.translatedTitle}
					</span>
				</div>
			{/if}
			<div class="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
				{#if currentPage !== undefined && totalPages !== undefined}
					<span>页码: {currentPage}/{totalPages}</span>
				{/if}
				{#if timestamp}
					<span>{formatTime(timestamp)}</span>
				{/if}
				{#if !currentPage && !timestamp}
					<span>{formatSize(item.size || 0, item.isDir || false)}</span>
				{/if}
			</div>
			{#if displayTags().length > 0}
				<div class="mt-1 flex flex-wrap items-center gap-1">
					{#each displayTags() as tagInfo}
						<span
							class="rounded px-1.5 py-0.5 text-xs {tagInfo.isCollect ? 'font-semibold' : ''}"
							style="background-color: {tagInfo.isCollect
								? (tagInfo.color || '#409EFF') + '20'
								: 'rgba(0,0,0,0.05)'}; color: {tagInfo.isCollect
								? tagInfo.color || '#409EFF'
								: 'inherit'}; border: 1px solid {tagInfo.isCollect
								? (tagInfo.color || '#409EFF') + '40'
								: 'transparent'};"
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
		onclick={onClick}
		ondblclick={onDoubleClick}
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
					<Folder class="h-16 w-16 text-blue-500" />
				</div>
			{:else if isArchive}
				<div class="flex h-full w-full items-center justify-center">
					<FileArchive class="h-16 w-16 text-purple-500" />
				</div>
			{:else if item.isImage}
				<div class="flex h-full w-full items-center justify-center">
					<Image class="h-16 w-16 text-green-500" />
				</div>
			{:else}
				<div class="flex h-full w-full items-center justify-center">
					<File class="h-16 w-16 text-gray-400" />
				</div>
			{/if}

			<!-- 阅读标记（对勾） -->
			{#if showReadMark}
				<div class="absolute right-2 top-2 rounded-full bg-green-500 p-1">
					<Check class="h-4 w-4 text-white" />
				</div>
			{/if}

			<!-- 收藏标记（星标） -->
			{#if isBookmarked}
				<div class="absolute left-2 top-2 rounded-full bg-yellow-500 p-1">
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
						<span
							class="rounded bg-blue-100 px-1 py-0.5 text-[10px] text-blue-700"
							title="子文件夹数量"
						>
							📁 {item.folderCount}
						</span>
					{/if}
					{#if item.archiveCount !== undefined && item.archiveCount > 0}
						<span
							class="rounded bg-purple-100 px-1 py-0.5 text-[10px] text-purple-700"
							title="压缩包数量"
						>
							📦 {item.archiveCount}
						</span>
					{/if}
					{#if item.videoCount !== undefined && item.videoCount > 0}
						<span
							class="rounded bg-green-100 px-1 py-0.5 text-[10px] text-green-700"
							title="视频数量"
						>
							🎬 {item.videoCount}
						</span>
					{/if}
				</div>
			{/if}
			<!-- 翻译标题 -->
			{#if emmMetadata?.translatedTitle && emmMetadata.translatedTitle !== item.name}
				<div class="mt-1">
					<span
						class="break-words rounded border border-blue-100 bg-blue-50 px-1 py-0.5 text-[10px] text-blue-600"
						title={emmMetadata.translatedTitle}
					>
						{emmMetadata.translatedTitle}
					</span>
				</div>
			{/if}
			<div class="text-muted-foreground mt-1 text-xs">
				{#if currentPage !== undefined && totalPages !== undefined}
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
							class="rounded px-1 py-0.5 text-[10px] {tagInfo.isCollect ? 'font-semibold' : ''}"
							style="background-color: {tagInfo.isCollect
								? (tagInfo.color || '#409EFF') + '20'
								: 'rgba(0,0,0,0.05)'}; color: {tagInfo.isCollect
								? tagInfo.color || '#409EFF'
								: 'inherit'}; border: 1px solid {tagInfo.isCollect
								? (tagInfo.color || '#409EFF') + '40'
								: 'transparent'};"
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
