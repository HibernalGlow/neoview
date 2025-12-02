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
		BookOpen
	} from '@lucide/svelte';
	import type { FsItem } from '$lib/types';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import FolderRatingBadge from './FolderRatingBadge.svelte';
	import TagChip from '$lib/components/ui/TagChip.svelte';

	interface Props {
		item: FsItem;
		thumbnail?: string;
		isSelected?: boolean;
		showReadMark?: boolean;
		showSizeAndModified?: boolean;
		currentPage?: number;
		totalPages?: number;
		timestamp?: number;
		// 计算状态
		isBookmarked: boolean;
		isArchive: boolean;
		isReadCompleted: boolean;
		emmMetadata: { translatedTitle?: string; tags?: Record<string, string[]>; rating?: number } | null;
		folderAverageRating: number | null;
		folderManualRating: number | null;
		displayTags: () => { tag: string; display: string; isCollect: boolean; color?: string; isMixedVariant?: boolean }[];
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
		isSelected = false,
		showReadMark = false,
		showSizeAndModified = false,
		currentPage,
		totalPages,
		timestamp,
		isBookmarked,
		isArchive,
		isReadCompleted,
		emmMetadata,
		folderAverageRating,
		folderManualRating,
		displayTags,
		getEffectiveRating,
		onClick,
		onContextMenu,
		onOpenAsBook,
		onSetRating
	}: Props = $props();

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
		if (isDir) return bytes === 0 ? '空文件夹' : `${bytes} 项`;
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
		return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
	}
</script>

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
	<!-- 缩略图区域 - 自动扩展填充可用空间 -->
	<div class="bg-secondary relative w-full flex-1 min-h-20 overflow-hidden">
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
			{item.name}
		</div>

		<!-- 文件夹统计信息 -->
		{#if item.isDir}
			<div class="mt-1 flex flex-wrap items-center gap-1">
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
					<Tooltip.Root>
						<Tooltip.Trigger>
							<span class="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
								<Star class="h-2.5 w-2.5 fill-current" />
								<span class="font-medium">{emmMetadata.rating.toFixed(1)}</span>
							</span>
						</Tooltip.Trigger>
						<Tooltip.Content><p>评分: {emmMetadata.rating.toFixed(2)}</p></Tooltip.Content>
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
					<TagChip
						tag={tagInfo.tag}
						display={tagInfo.display}
						color={tagInfo.color}
						isCollect={tagInfo.isCollect}
						isMixedVariant={tagInfo.isMixedVariant}
						size="sm"
					/>
				{/each}
			</div>
		{/if}
	</div>
</div>
