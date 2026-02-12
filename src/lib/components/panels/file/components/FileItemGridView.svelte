<script lang="ts">
	/**
	 * FileItemGridView - 文件项网格视图组件
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
		BookOpen,
		HardDrive,
		Clock,
		Play
	} from '@lucide/svelte';
	import type { FsItem } from '$lib/types';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import FolderRatingBadge from './FolderRatingBadge.svelte';
	import TagChip from '$lib/components/ui/TagChip.svelte';
	import MetadataBadge from '$lib/components/ui/MetadataBadge.svelte';
	import FileTypeIcon from '$lib/components/ui/FileTypeIcon.svelte';
	// [4图预览功能已禁用] import FolderPreviewGrid from './FolderPreviewGrid.svelte';
	import { formatDuration, formatRelativeTime, formatBytes, formatSize, getFolderSizeDisplay } from '$lib/utils/formatters';

	interface Props {
		item: FsItem;
		thumbnail?: string;
		// [4图预览功能已禁用] folderThumbnails?: string[];
		// [4图预览功能已禁用] folderPreviewGridEnabled?: boolean;
		isSelected?: boolean;
		showReadMark?: boolean;
		showSizeAndModified?: boolean;
		currentPage?: number;
		totalPages?: number;
		videoPosition?: number;
		videoDuration?: number;
		timestamp?: number;
		// 文件夹总大小（异步加载）
		folderTotalSize?: number | null;
		folderSizeLoading?: boolean;
		// 计算状态
		isBookmarked: boolean;
		isArchive: boolean;
		isReadCompleted: boolean;
		emmMetadata: { translatedTitle?: string; tags?: Record<string, string[]>; rating?: number } | null;
		// 穿透模式：纯媒体文件夹（只包含图片/视频/文本，点击直接作为 book 打开）
		isPureMediaFolder?: boolean;
		folderAverageRating: number | null;
		folderManualRating: number | null;
		displayTags: () => { tag: string; display: string; isCollect: boolean; color?: string; isMixedVariant?: boolean; isManual?: boolean }[];
		getEffectiveRating: () => number | null;
		// 事件
		onClick?: () => void;
		onContextMenu?: (e: MouseEvent) => void;
		onOpenAsBook?: () => void;
		onSetRating: (rating: number | null) => void;
	}

	let {
		item,
		thumbnail,
		// [4图预览功能已禁用] folderThumbnails = [],
		// [4图预览功能已禁用] folderPreviewGridEnabled = false,
		isSelected = false,
		showReadMark = false,
		showSizeAndModified = false,
		currentPage,
		totalPages,
		videoPosition,
		videoDuration,
		timestamp,
		folderTotalSize = null,
		folderSizeLoading = false,
		isBookmarked,
		isArchive,
		isReadCompleted,
		emmMetadata,
		isPureMediaFolder = false,
		folderAverageRating,
		folderManualRating,
		displayTags,
		getEffectiveRating,
		onClick,
		onContextMenu,
		onOpenAsBook,
		onSetRating
	}: Props = $props();

	// [4图预览功能已禁用]
	const showFolderPreviewGrid = false;
	/* const showFolderPreviewGrid = $derived(
		item.isDir && folderPreviewGridEnabled && folderThumbnails.length > 0
	); */
</script>

<div
	class="border-border group/card relative flex cursor-pointer flex-col overflow-hidden rounded border transition-all hover:shadow-md {isSelected
		? 'border-primary ring-2'
		: ''}"
	onclick={(e) => {
		e.stopPropagation();
		onClick?.();
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
	<!-- 缩略图区域 - 自动扩展填充可用空间 -->
	<div class="bg-secondary relative w-full flex-1 min-h-20 overflow-hidden">
		{#if false /* [4图预览功能已禁用] showFolderPreviewGrid */}
			<!-- 文件夹 4 图预览模式 -->
			<!-- <FolderPreviewGrid thumbnails={folderThumbnails} folderName={item.name} /> -->
		{:else if thumbnail}
			<img
				src={thumbnail}
				alt={item.name}
				loading="lazy"
				decoding="async"
				class="h-full w-full object-cover transition-transform group-hover/card:scale-105"
			/>
		{:else}
			<!-- 骨架屏占位：缩略图加载中显示动画 -->
			<div class="absolute inset-0 bg-accent animate-pulse"></div>
			<!-- 图标叠加在骨架屏上 -->
			{#if item.isDir}
				<div class="relative flex h-full w-full items-center justify-center">
					<Folder class="text-primary/50 h-16 w-16" />
				</div>
			{:else if isArchive}
				<div class="relative flex h-full w-full items-center justify-center">
					<FileArchive class="text-primary/50 h-16 w-16" />
				</div>
			{:else if item.isImage}
				<div class="relative flex h-full w-full items-center justify-center">
					<Image class="text-primary/50 h-16 w-16" />
				</div>
			{:else}
				<div class="relative flex h-full w-full items-center justify-center">
					<File class="h-16 w-16 text-muted-foreground/50" />
				</div>
			{/if}
		{/if}

		<!-- 阅读标记 -->
		{#if showReadMark}
			{#if isReadCompleted}
				<div class="bg-primary absolute right-2 top-2 rounded-full p-1">
					<Check class="h-4 w-4 text-white" />
				</div>
			{:else}
				<div class="border-primary bg-background/80 absolute right-2 top-2 rounded-full border border-dashed p-1">
					<Check class="text-primary h-4 w-4" />
				</div>
			{/if}
		{/if}

		<!-- 收藏标记 -->
		{#if isBookmarked}
			<div class="bg-primary absolute left-2 top-2 rounded-full p-1">
				<Star class="h-4 w-4 fill-white text-white" />
			</div>
		{/if}

		<!-- 进度条 -->
		{#if currentPage !== undefined && totalPages !== undefined && totalPages > 0}
			<div class="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
				<div class="bg-primary h-full transition-all" style="width: {(currentPage / totalPages) * 100}%"></div>
			</div>
		{/if}
	</div>

	<!-- 信息区域 -->
	<div class="bg-background p-2">
		<!-- 原文件名 -->
		<div class="wrap-break-word text-sm font-medium" title={item.name}>
			<span class="truncate">{item.name}</span>
		</div>

		<!-- 文件夹统计信息 -->
		{#if item.isDir}
			<div class="mt-1 flex flex-wrap items-center gap-1">
				{#if item.imageCount !== undefined && item.imageCount > 0}
					<Tooltip.Root>
						<Tooltip.Trigger>
							<span class="bg-secondary text-secondary-foreground inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px]">
								<Image class="h-2.5 w-2.5" />
								<span class="font-medium">{item.imageCount}</span>
							</span>
						</Tooltip.Trigger>
						<Tooltip.Content><p>图片数量</p></Tooltip.Content>
					</Tooltip.Root>
				{/if}
				{#if item.folderCount !== undefined && item.folderCount > 0}
					<Tooltip.Root>
						<Tooltip.Trigger>
							<span class="bg-secondary text-secondary-foreground inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px]">
								<FolderOpen class="h-2.5 w-2.5" />
								<span class="font-medium">{item.folderCount}</span>
							</span>
						</Tooltip.Trigger>
						<Tooltip.Content><p>子文件夹数量</p></Tooltip.Content>
					</Tooltip.Root>
				{/if}
				{#if item.archiveCount !== undefined && item.archiveCount > 0}
					<Tooltip.Root>
						<Tooltip.Trigger>
							<span class="bg-secondary text-secondary-foreground inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px]">
								<Package class="h-2.5 w-2.5" />
								<span class="font-medium">{item.archiveCount}</span>
							</span>
						</Tooltip.Trigger>
						<Tooltip.Content><p>压缩包数量</p></Tooltip.Content>
					</Tooltip.Root>
				{/if}
				{#if item.videoCount !== undefined && item.videoCount > 0}
					<Tooltip.Root>
						<Tooltip.Trigger>
							<span class="bg-secondary text-secondary-foreground inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px]">
								<Video class="h-2.5 w-2.5" />
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
							<span class="bg-primary/20 text-primary inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] border border-primary/30">
								<Image class="h-2.5 w-2.5" />
								<span class="font-medium">媒体</span>
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
						size="sm"
						onSetRating={onSetRating}
					/>
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
						<Tooltip.Content><p>作为书籍打开此文件夹</p></Tooltip.Content>
					</Tooltip.Root>
				{/if}
			</div>
		{/if}

		<!-- 翻译标题和评分 -->
		{#if emmMetadata && (emmMetadata.translatedTitle || emmMetadata.rating !== undefined)}
			<div class="mt-1 flex flex-wrap items-center gap-1">
				{#if emmMetadata.translatedTitle && emmMetadata.translatedTitle !== item.name}
					<span
						class="border-primary/20 bg-primary/10 text-primary wrap-break-word rounded border px-1 py-0.5 text-[10px]"
						title={emmMetadata.translatedTitle}
					>
						{emmMetadata.translatedTitle}
					</span>
				{/if}
				{#if emmMetadata.rating !== undefined && emmMetadata.rating > 0}
					<MetadataBadge
						text={emmMetadata.rating.toFixed(1)}
						icon={Star}
						tooltip="评分: {emmMetadata.rating.toFixed(2)}"
						size="xs"
						variant="accent"
					/>
				{/if}
			</div>
		{/if}

		<div class="mt-1 flex flex-wrap items-center gap-1">
			<!-- 文件类型 icon -->
			<FileTypeIcon name={item.targetPath ?? item.name} isDir={item.isDir} size="xs" />
			<!-- 视频进度信息（时:分:秒格式） -->
			{#if videoPosition !== undefined && videoDuration !== undefined && videoDuration > 0}
				<MetadataBadge
					text="{formatDuration(videoPosition)}/{formatDuration(videoDuration)}"
					icon={Play}
					tooltip="视频进度"
					size="xs"
					variant="primary"
				/>
			{:else if currentPage !== undefined && totalPages !== undefined && totalPages > 0}
				<MetadataBadge
					text="{currentPage}/{totalPages}"
					icon={BookOpen}
					tooltip="阅读进度"
					size="xs"
					variant="primary"
				/>
			{/if}
			{#if showSizeAndModified}
				<MetadataBadge
					text={item.isDir ? getFolderSizeDisplay(folderSizeLoading, folderTotalSize, item.size) : formatSize(item.size || 0, false)}
					icon={HardDrive}
					tooltip="文件大小"
					size="xs"
					variant="secondary"
				/>
				{#if timestamp}
					<MetadataBadge
						text={formatRelativeTime(timestamp)}
						icon={Clock}
						tooltip="修改时间"
						size="xs"
						variant="secondary"
					/>
				{/if}
			{:else if timestamp}
				<MetadataBadge
					text={formatRelativeTime(timestamp)}
					icon={Clock}
					tooltip="修改时间"
					size="xs"
					variant="secondary"
				/>
			{:else if !(currentPage !== undefined && totalPages !== undefined && totalPages > 0)}
				<MetadataBadge
					text={item.isDir ? getFolderSizeDisplay(folderSizeLoading, folderTotalSize, item.size) : formatSize(item.size || 0, false)}
					icon={HardDrive}
					tooltip="文件大小"
					size="xs"
					variant="secondary"
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
						size="sm"
					/>
				{/each}
			</div>
		{/if}
	</div>
</div>
