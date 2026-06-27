<script lang="ts">
	/**
	 * FileItemListView - 文件项列表视图组件
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
		PanelRight,
		X,
		HardDrive,
		Clock,
		Play,
		Images
	} from '@lucide/svelte';
	import type { FsItem } from '$lib/types';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import FolderRatingBadge from './FolderRatingBadge.svelte';
	import TagChip from '$lib/components/ui/TagChip.svelte';
	import MetadataBadge from '$lib/components/ui/MetadataBadge.svelte';
	import type { EMMTranslationDict } from '$lib/api/emm';
	import {
		hoverPreviewEnabled,
		hoverPreviewDelayMs
	} from '$lib/stores/hoverPreviewSettings.svelte';
	import FileTypeIcon from '$lib/components/ui/FileTypeIcon.svelte';
	import FolderPreviewGrid from './FolderPreviewGrid.svelte';
	import {
		formatDuration,
		formatRelativeTime,
		formatBytes,
		formatSize,
		getFolderSizeDisplay
	} from '$lib/utils/formatters';

	interface Props {
		item: FsItem;
		thumbnail?: string;
		folderThumbnails?: string[];
		folderPreviewGridEnabled?: boolean;
		folderPreviewLoading?: boolean;
		folderPreviewExpectedCount?: number;
		/** 视图模式: list=列表, content=内容, banner=横幅, thumbnail=缩略图 */
		viewMode?: 'list' | 'content' | 'banner' | 'thumbnail';
		isSelected?: boolean;
		isChecked?: boolean;
		isCheckMode?: boolean;
		isDeleteMode?: boolean;
		showReadMark?: boolean;
		showSizeAndModified?: boolean;
		currentPage?: number;
		totalPages?: number;
		videoPosition?: number;
		videoDuration?: number;
		timestamp?: number;
		thumbnailSize?: number;
		// 文件夹总大小（异步加载）
		folderTotalSize?: number | null;
		folderSizeLoading?: boolean;
		// 计算状态
		isBookmarked: boolean;
		isArchive: boolean;
		isReadCompleted: boolean;
		emmMetadata: {
			translatedTitle?: string;
			tags?: Record<string, string[]>;
			rating?: number;
		} | null;
		// 穿透模式：内部压缩包信息列表（支持多个）
		penetrateInfoList?: Array<{
			originalName: string;
			translatedTitle?: string | null;
			isAiTranslated: boolean;
		}>;
		// 穿透模式：纯媒体文件夹（只包含图片/视频/文本，点击直接作为 book 打开）
		isPureMediaFolder?: boolean;
		folderAverageRating: number | null;
		folderManualRating: number | null;
		displayTags: () => {
			tag: string;
			display: string;
			isCollect: boolean;
			color?: string;
			isMixedVariant?: boolean;
			isManual?: boolean;
		}[];
		getEffectiveRating: () => number | null;
		// 预览相关
		showPreview: boolean;
		previewLoading: boolean;
		previewItems: FsItem[];
		previewIconElement?: HTMLElement | null;
		// 事件
		onClick?: () => void;
		onDoubleClick?: () => void;
		onContextMenu?: (e: MouseEvent) => void;
		onToggleSelection?: () => void;
		onDelete?: () => void;
		onOpenAsBook?: () => void;
		onOpenInNewTab?: () => void;
		onSetRating: (rating: number | null) => void;
		onPreviewEnter: () => void;
		onPreviewLeave: () => void;
	}

	let {
		item,
		thumbnail,
		folderThumbnails = [],
		folderPreviewGridEnabled = false,
		folderPreviewLoading = false,
		folderPreviewExpectedCount = 0,
		viewMode = 'list',
		isSelected = false,
		isChecked = false,
		isCheckMode = false,
		isDeleteMode = false,
		showReadMark = false,
		showSizeAndModified = false,
		currentPage,
		totalPages,
		videoPosition,
		videoDuration,
		timestamp,
		thumbnailSize = 48,
		folderTotalSize = null,
		folderSizeLoading = false,
		isBookmarked,
		isArchive,
		isReadCompleted,
		emmMetadata,
		penetrateInfoList = [],
		isPureMediaFolder = false,
		folderAverageRating,
		folderManualRating,
		displayTags,
		getEffectiveRating,
		showPreview,
		previewLoading,
		previewItems,
		previewIconElement = $bindable(),
		onClick,
		onDoubleClick,
		onContextMenu,
		onToggleSelection,
		onDelete,
		onOpenAsBook,
		onOpenInNewTab,
		onSetRating,
		onPreviewEnter,
		onPreviewLeave
	}: Props = $props();

	// 是否为网格布局（banner/thumbnail）
	const isGridLayout = $derived(viewMode === 'banner' || viewMode === 'thumbnail');
	const showFolderPreviewGrid = $derived(
		item.isDir && folderPreviewGridEnabled && (folderPreviewLoading || folderThumbnails.length > 0)
	);

	// 容器样式类
	const containerClass = $derived(
		isGridLayout
			? `border-border group/item relative flex flex-col cursor-pointer rounded-md border overflow-hidden transition-colors ${isSelected ? 'bg-accent text-accent-foreground border-accent' : 'hover:bg-accent/40'}`
			: `border-border group/item relative flex min-h-16 cursor-pointer items-center gap-3 rounded-md border p-2 transition-colors ${isSelected ? 'bg-accent text-accent-foreground border-accent' : 'hover:bg-accent/40'}`
	);
</script>

<div
	class={containerClass}
	onclick={(e) => {
		e.stopPropagation();
		onClick?.();
	}}
	ondblclick={(e) => {
		e.stopPropagation();
		onDoubleClick?.();
	}}
	oncontextmenu={onContextMenu}
	role="button"
	tabindex="0"
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onClick?.();
		}
	}}
>
	<!-- 勾选框（勾选模式）- 正方形图标，扩大透明点击区域 -->
	{#if isCheckMode}
		<button
			class="group/checkbox focus-visible:ring-ring flex shrink-0 items-center self-stretch px-2 transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
			onclick={(e) => {
				e.stopPropagation();
				onToggleSelection?.();
			}}
			aria-label={isChecked ? '取消选择' : '选择'}
		>
			<div
				class="flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all duration-200 {isChecked
					? 'border-primary bg-primary text-primary-foreground shadow-md'
					: 'border-input bg-background hover:border-primary hover:bg-accent'}"
			>
				{#if isChecked}
					<Check class="animate-in zoom-in-50 h-3.5 w-3.5 duration-200" />
				{/if}
			</div>
		</button>
	{/if}

	<!-- 删除按钮（删除模式）- 正方形图标，扩大透明点击区域 -->
	{#if isDeleteMode}
		<button
			class="group/delete focus-visible:ring-destructive flex shrink-0 items-center self-stretch px-2 transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
			onclick={(e) => {
				e.stopPropagation();
				onDelete?.();
			}}
			title="删除"
			aria-label="删除"
		>
			<div
				class="bg-destructive text-destructive-foreground hover:bg-destructive/90 flex h-5 w-5 items-center justify-center rounded-md shadow-md transition-all duration-200 hover:shadow-lg"
			>
				<X class="h-3.5 w-3.5" />
			</div>
		</button>
	{/if}

	<!-- 缩略图或图标（带悬停预览） -->
	<Tooltip.Root delayDuration={$hoverPreviewDelayMs}>
		<Tooltip.Trigger>
			<div
				class="relative flex shrink-0 items-center justify-center self-stretch overflow-hidden rounded"
				style="width: {thumbnailSize}px; min-width: {thumbnailSize}px;"
			>
				{#if showFolderPreviewGrid}
					<FolderPreviewGrid
						thumbnails={folderThumbnails}
						folderName={item.name}
						loading={folderPreviewLoading}
						expectedCount={folderPreviewExpectedCount}
					/>
				{:else if thumbnail}
					<img
						src={thumbnail}
						alt={item.name}
						loading="lazy"
						decoding="async"
						class="h-full w-full object-cover transition-transform group-hover/item:scale-105"
					/>
				{:else}
					<!-- 骨架屏占位：缩略图加载中显示动画 -->
					<div class="bg-accent absolute inset-0 animate-pulse rounded"></div>
					<!-- 图标叠加在骨架屏上 -->
					{#if item.isDir}
						<Folder
							class="text-primary/50 group-hover/item:text-primary relative h-8 w-8 transition-colors"
						/>
					{:else if isArchive}
						<FileArchive
							class="text-primary/50 group-hover/item:text-primary relative h-8 w-8 transition-colors"
						/>
					{:else if item.isImage}
						<Image
							class="text-primary/50 group-hover/item:text-primary relative h-8 w-8 transition-colors"
						/>
					{:else}
						<File
							class="text-muted-foreground/50 group-hover/item:text-muted-foreground relative h-8 w-8 transition-colors"
						/>
					{/if}
				{/if}

				<!-- 阅读标记 -->
				{#if showReadMark}
					{#if isReadCompleted}
						<div class="bg-primary absolute top-0 right-0 rounded-full p-0.5">
							<Check class="h-3 w-3 text-white" />
						</div>
					{:else}
						<div
							class="border-primary bg-background/80 absolute top-0 right-0 rounded-full border border-dashed p-0.5"
						>
							<Check class="text-primary h-3 w-3" />
						</div>
					{/if}
				{/if}

				<!-- 收藏标记 -->
				{#if isBookmarked}
					<div class="bg-primary absolute right-0 bottom-0 rounded-full p-0.5">
						<Star class="h-3 w-3 fill-white text-white" />
					</div>
				{/if}
			</div>
		</Tooltip.Trigger>
		<!-- 悬停预览大图（仅在启用时显示） -->
		{#if thumbnail && $hoverPreviewEnabled}
			<Tooltip.Content side="right" class="border-0 bg-transparent p-0 shadow-xl">
				<img
					src={thumbnail}
					alt={item.name}
					class="bg-background max-h-100 max-w-75 rounded-lg border object-contain shadow-lg"
				/>
			</Tooltip.Content>
		{/if}
	</Tooltip.Root>

	<!-- 信息 -->
	<div class="min-w-0 flex-1">
		<!-- 原文件名 -->
		<div class="flex flex-wrap items-center gap-2 font-medium wrap-break-word" title={item.name}>
			<span>{item.name}</span>
			<!-- 文件夹统计信息 -->
			{#if item.isDir}
				<div class="flex items-center gap-1.5 text-xs">
					{#if item.imageCount !== undefined && item.imageCount > 0}
						<Tooltip.Root>
							<Tooltip.Trigger>
								<span
									class="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5"
								>
									<Images class="h-3 w-3" />
									<span class="font-medium">{item.imageCount}</span>
								</span>
							</Tooltip.Trigger>
							<Tooltip.Content><p>图片数量</p></Tooltip.Content>
						</Tooltip.Root>
					{/if}
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
							<Tooltip.Content><p>子文件夹数量</p></Tooltip.Content>
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
							<Tooltip.Content><p>压缩包数量</p></Tooltip.Content>
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
							<Tooltip.Content><p>视频数量</p></Tooltip.Content>
						</Tooltip.Root>
					{/if}
					<!-- 纯媒体文件夹标识（穿透模式下点击直接打开） -->
					{#if isPureMediaFolder}
						<Tooltip.Root>
							<Tooltip.Trigger>
								<span
									class="bg-primary/20 text-primary border-primary/30 inline-flex items-center gap-1 rounded-md border px-2 py-0.5"
								>
									<Image class="h-3 w-3" />
									<span class="text-xs font-medium">媒体</span>
								</span>
							</Tooltip.Trigger>
							<Tooltip.Content><p>纯媒体文件夹，点击直接打开</p></Tooltip.Content>
						</Tooltip.Root>
					{/if}
					{#if getEffectiveRating() !== null || item.isDir}
						<FolderRatingBadge
							effectiveRating={getEffectiveRating()}
							manualRating={folderManualRating}
							averageRating={folderAverageRating}
							size="md"
							{onSetRating}
						/>
					{/if}
					<!-- 预览图标 -->
					<Tooltip.Root>
						<Tooltip.Trigger>
							<button
								bind:this={previewIconElement}
								class="hover:bg-accent inline-flex items-center justify-center rounded-md p-1 transition-colors"
								onmouseenter={onPreviewEnter}
								onmouseleave={onPreviewLeave}
								onclick={(e) => e.stopPropagation()}
							>
								<Eye class="text-muted-foreground h-3.5 w-3.5" />
							</button>
						</Tooltip.Trigger>
						<Tooltip.Content><p>预览文件夹内容</p></Tooltip.Content>
					</Tooltip.Root>
					<!-- 作为书籍打开 -->
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
						<Tooltip.Content><p>作为书籍打开此文件夹</p></Tooltip.Content>
					</Tooltip.Root>
					<!-- 在新标签页打开 -->
					<Tooltip.Root>
						<Tooltip.Trigger>
							<button
								class="hover:bg-accent inline-flex items-center justify-center rounded-md p-1 transition-colors"
								onclick={(e) => {
									e.stopPropagation();
									onOpenInNewTab?.();
								}}
								oncontextmenu={(e) => {
									// 右键穿透：触发父元素的右键菜单，但阻止事件继续冒泡避免重复触发
									e.stopPropagation();
									onContextMenu?.(e);
								}}
							>
								<PanelRight class="text-muted-foreground h-3.5 w-3.5" />
							</button>
						</Tooltip.Trigger>
						<Tooltip.Content><p>在新标签页打开</p></Tooltip.Content>
					</Tooltip.Root>
				</div>
			{/if}
		</div>

		<!-- 预览弹窗 -->
		{#if item.isDir && showPreview}
			<div
				class="border-border bg-popover/80 absolute top-full left-0 z-50 mt-1 w-64 rounded-md border p-2 shadow-lg backdrop-blur-md"
				role="tooltip"
				tabindex="-1"
				onmouseenter={onPreviewEnter}
				onmouseleave={onPreviewLeave}
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
									<Folder class="h-3 w-3 shrink-0 text-blue-500" />
								{:else if previewItem.isImage}
									<Image class="h-3 w-3 shrink-0 text-green-500" />
								{:else if previewItem.name.endsWith('.zip') || previewItem.name.endsWith('.cbz') || previewItem.name.endsWith('.rar') || previewItem.name.endsWith('.cbr')}
									<FileArchive class="h-3 w-3 shrink-0 text-purple-500" />
								{:else}
									<File class="text-muted-foreground h-3 w-3 shrink-0" />
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

		<!-- 翻译标题 -->
		{#if emmMetadata && emmMetadata.translatedTitle && emmMetadata.translatedTitle !== item.name}
			<div class="mt-1">
				<span
					class="border-primary/20 bg-primary/10 text-primary rounded border px-1.5 py-0.5 text-xs wrap-break-word"
					title={emmMetadata.translatedTitle}
				>
					{emmMetadata.translatedTitle}
				</span>
			</div>
		{/if}

		<!-- 穿透模式：内部压缩包信息列表（允许换行显示完整） -->
		{#if penetrateInfoList && penetrateInfoList.length > 0}
			<div class="mt-1 space-y-1">
				{#each penetrateInfoList as info, idx}
					<div class="space-y-0.5 {idx > 0 ? 'border-muted border-t border-dashed pt-0.5' : ''}">
						<div class="flex items-start gap-1">
							<Package class="text-muted-foreground mt-0.5 h-3 w-3 shrink-0" />
							<span class="text-muted-foreground text-xs leading-tight break-all">
								{info.originalName}
							</span>
						</div>
						{#if info.translatedTitle}
							<div class="text-primary pl-4 text-xs leading-tight break-all">
								{info.isAiTranslated ? '🤖 ' : ''}{info.translatedTitle}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<div class="mt-1 flex flex-wrap items-center gap-1.5">
			<!-- 文件类型 icon -->
			<FileTypeIcon name={item.targetPath ?? item.name} isDir={item.isDir} size="sm" />
			<!-- 视频进度信息（时:分:秒格式） -->
			{#if videoPosition !== undefined && videoDuration !== undefined && videoDuration > 0}
				<MetadataBadge
					text="{formatDuration(videoPosition)}/{formatDuration(videoDuration)}"
					icon={Play}
					tooltip="视频进度"
					size="sm"
					variant="primary"
				/>
			{:else if currentPage !== undefined && totalPages !== undefined && totalPages > 0}
				<!-- 非视频进度信息 -->
				<MetadataBadge
					text="{currentPage}/{totalPages}"
					icon={BookOpen}
					tooltip="阅读进度"
					size="sm"
					variant="primary"
				/>
			{/if}
			{#if showSizeAndModified}
				<MetadataBadge
					text={item.isDir
						? getFolderSizeDisplay(folderSizeLoading, folderTotalSize, item.size)
						: formatSize(item.size || 0, false)}
					icon={HardDrive}
					tooltip="文件大小"
					size="sm"
					variant="secondary"
				/>
				{#if timestamp}
					<MetadataBadge
						text={formatRelativeTime(timestamp)}
						icon={Clock}
						tooltip="修改时间"
						size="sm"
						variant="secondary"
					/>
				{/if}
			{:else}
				{#if timestamp}
					<MetadataBadge
						text={formatRelativeTime(timestamp)}
						icon={Clock}
						tooltip="修改时间"
						size="sm"
						variant="secondary"
					/>
				{/if}
				{#if !currentPage && !timestamp}
					<MetadataBadge
						text={item.isDir
							? getFolderSizeDisplay(folderSizeLoading, folderTotalSize, item.size)
							: formatSize(item.size || 0, false)}
						icon={HardDrive}
						tooltip="文件大小"
						size="sm"
						variant="secondary"
					/>
				{/if}
			{/if}
			<!-- 评分放在大小和时间后面 -->
			{#if emmMetadata?.rating !== undefined && emmMetadata.rating > 0}
				<MetadataBadge
					text={emmMetadata.rating.toFixed(1)}
					icon={Star}
					tooltip="评分: {emmMetadata.rating.toFixed(2)}"
					size="sm"
					variant="accent"
				/>
			{/if}
		</div>

		{#if displayTags().length > 0}
			<div class="mt-1 flex flex-wrap items-center gap-1">
				{#each displayTags() as tagInfo}
					<TagChip
						tag={tagInfo.tag}
						display={tagInfo.display}
						color={tagInfo.color}
						isCollect={tagInfo.isCollect}
						isMixedVariant={tagInfo.isMixedVariant}
						isManual={tagInfo.isManual}
						size="md"
					/>
				{/each}
			</div>
		{/if}
	</div>
</div>
