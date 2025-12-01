<script lang="ts">
/**
 * FolderListItem - 文件列表项组件
 * 参考 NeeView 的 FolderListBox 项模板设计
 */
import { Folder, File, FileArchive, Image, Film, Music, FileText, Trash2, Play } from '@lucide/svelte';
import { Checkbox } from '$lib/components/ui/checkbox';
import { Button } from '$lib/components/ui/button';
import type { FsItem } from '$lib/types';
import {
	viewStyle,
	multiSelectMode,
	deleteMode,
	selectedItems,
	folderPanelActions,
	type FolderViewStyle
} from '../stores/folderPanelStore.svelte';

interface Props {
	item: FsItem;
	thumbnail?: string | null;
	onOpen?: (item: FsItem) => void;
	onDelete?: (item: FsItem) => void;
	onContextMenu?: (event: MouseEvent, item: FsItem) => void;
}

let { item, thumbnail = null, onOpen, onDelete, onContextMenu }: Props = $props();

// 获取文件图标
function getFileIcon(item: FsItem) {
	if (item.isDir) return Folder;

	const ext = item.name.split('.').pop()?.toLowerCase() || '';

	// 图片
	if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'].includes(ext)) {
		return Image;
	}

	// 视频
	if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'nov'].includes(ext)) {
		return Film;
	}

	// 音频
	if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) {
		return Music;
	}

	// 压缩包
	if (['zip', 'rar', '7z', 'tar', 'gz', 'cbz', 'cbr'].includes(ext)) {
		return FileArchive;
	}

	// 文本
	if (['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'ini', 'cfg'].includes(ext)) {
		return FileText;
	}

	return File;
}

// 是否为媒体文件（可以用外部程序打开）
function isMediaFile(item: FsItem): boolean {
	if (item.isDir) return false;
	const ext = item.name.split('.').pop()?.toLowerCase() || '';
	return ['mp4', 'mkv', 'avi', 'mov', 'nov', 'wmv', 'flv', 'webm', 'mp3', 'wav', 'flac'].includes(ext);
}

// 格式化文件大小
function formatSize(bytes?: number): string {
	if (bytes === undefined || bytes === null) return '';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// 格式化日期
function formatDate(timestamp?: number): string {
	if (!timestamp) return '';
	const date = new Date(timestamp * 1000);
	return date.toLocaleDateString();
}

let isSelected = $derived($selectedItems.has(item.path));
let FileIcon = $derived(getFileIcon(item));

function handleClick(e: MouseEvent) {
	if ($multiSelectMode) {
		folderPanelActions.selectItem(item.path, true);
	} else {
		folderPanelActions.selectItem(item.path);
	}
}

function handleDoubleClick(e: MouseEvent) {
	onOpen?.(item);
}

function handleContextMenu(e: MouseEvent) {
	e.preventDefault();
	onContextMenu?.(e, item);
}

function handleCheckboxChange(checked: boolean) {
	folderPanelActions.selectItem(item.path, true);
}

function handleDelete(e: MouseEvent) {
	e.stopPropagation();
	onDelete?.(item);
}

function handleOpenExternal(e: MouseEvent) {
	e.stopPropagation();
	// TODO: 实现外部程序打开
}

function handleKeyDown(e: KeyboardEvent) {
	if (e.key === 'Enter' || e.key === ' ') {
		e.preventDefault();
		if (e.key === 'Enter') {
			onOpen?.(item);
		} else {
			handleClick(e as unknown as MouseEvent);
		}
	}
}
</script>

{#if $viewStyle === 'list'}
	<!-- 列表视图 -->
	<div
		class="hover:bg-accent/50 flex min-h-[32px] cursor-pointer items-center gap-2 px-2 py-1 transition-colors"
		class:bg-accent={isSelected}
		onclick={handleClick}
		ondblclick={handleDoubleClick}
		oncontextmenu={handleContextMenu}
		onkeydown={handleKeyDown}
		role="button"
		tabindex="0"
	>
		<!-- 选中标记 -->
		<div
			class="bg-primary h-full w-1 rounded-full transition-opacity"
			class:opacity-0={!isSelected}
			class:opacity-100={isSelected}
		></div>

		<!-- 多选复选框 -->
		{#if $multiSelectMode}
			<Checkbox checked={isSelected} onCheckedChange={handleCheckboxChange} />
		{/if}

		<!-- 删除按钮 -->
		{#if $deleteMode}
			<Button variant="ghost" size="icon" class="h-6 w-6" onclick={handleDelete}>
				<Trash2 class="h-4 w-4 text-destructive" />
			</Button>
		{/if}

		<!-- 文件图标 -->
		<FileIcon class="text-muted-foreground h-4 w-4 shrink-0" />

		<!-- 文件名 -->
		<span class="flex-1 truncate text-sm">{item.name}</span>

		<!-- 媒体播放按钮 -->
		{#if isMediaFile(item)}
			<Button variant="ghost" size="icon" class="h-6 w-6" onclick={handleOpenExternal}>
				<Play class="h-3.5 w-3.5" />
			</Button>
		{/if}
	</div>
{:else if $viewStyle === 'content'}
	<!-- 内容视图 -->
	<div
		class="hover:bg-accent/50 flex cursor-pointer items-center gap-3 border-b px-2 py-2 transition-colors"
		class:bg-accent={isSelected}
		onclick={handleClick}
		ondblclick={handleDoubleClick}
		oncontextmenu={handleContextMenu}
		onkeydown={handleKeyDown}
		role="button"
		tabindex="0"
	>
		<!-- 选中标记 -->
		<div
			class="bg-primary h-full w-1 rounded-full transition-opacity"
			class:opacity-0={!isSelected}
			class:opacity-100={isSelected}
		></div>

		{#if $multiSelectMode}
			<Checkbox checked={isSelected} onCheckedChange={handleCheckboxChange} />
		{/if}

		{#if $deleteMode}
			<Button variant="ghost" size="icon" class="h-6 w-6" onclick={handleDelete}>
				<Trash2 class="h-4 w-4 text-destructive" />
			</Button>
		{/if}

		<!-- 缩略图 -->
		<div class="bg-muted flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded">
			{#if thumbnail}
				<img src={thumbnail} alt={item.name} class="h-full w-full object-cover" />
			{:else}
				<FileIcon class="text-muted-foreground h-6 w-6" />
			{/if}
		</div>

		<!-- 信息 -->
		<div class="min-w-0 flex-1">
			<div class="text-muted-foreground text-xs">
				{formatDate(item.modified)} · {formatSize(item.size)}
			</div>
			<div class="truncate text-sm font-medium">{item.name}</div>
		</div>

		{#if isMediaFile(item)}
			<Button variant="ghost" size="icon" class="h-6 w-6" onclick={handleOpenExternal}>
				<Play class="h-3.5 w-3.5" />
			</Button>
		{/if}
	</div>
{:else if $viewStyle === 'banner'}
	<!-- 横幅视图 -->
	<div
		class="hover:bg-accent/50 flex cursor-pointer flex-col border-b transition-colors"
		class:bg-accent={isSelected}
		onclick={handleClick}
		ondblclick={handleDoubleClick}
		oncontextmenu={handleContextMenu}
		onkeydown={handleKeyDown}
		role="button"
		tabindex="0"
	>
		<!-- 选中标记 -->
		<div
			class="bg-primary h-1 w-full transition-opacity"
			class:opacity-0={!isSelected}
			class:opacity-100={isSelected}
		></div>

		<!-- 横幅图片 -->
		<div class="bg-muted relative aspect-[3/1] w-full overflow-hidden">
			{#if thumbnail}
				<img src={thumbnail} alt={item.name} class="h-full w-full object-cover" />
			{:else}
				<div class="flex h-full w-full items-center justify-center">
					<FileIcon class="text-muted-foreground h-12 w-12" />
				</div>
			{/if}

			<!-- 多选/删除覆盖层 -->
			{#if $multiSelectMode || $deleteMode}
				<div class="absolute left-2 top-2 flex gap-1">
					{#if $multiSelectMode}
						<Checkbox checked={isSelected} onCheckedChange={handleCheckboxChange} />
					{/if}
					{#if $deleteMode}
						<Button variant="ghost" size="icon" class="h-6 w-6 bg-background/80" onclick={handleDelete}>
							<Trash2 class="h-4 w-4 text-destructive" />
						</Button>
					{/if}
				</div>
			{/if}
		</div>

		<!-- 文件名 -->
		<div class="flex items-center gap-2 px-2 py-1.5">
			<FileIcon class="text-muted-foreground h-4 w-4 shrink-0" />
			<span class="flex-1 truncate text-sm">{item.name}</span>
			{#if isMediaFile(item)}
				<Button variant="ghost" size="icon" class="h-6 w-6" onclick={handleOpenExternal}>
					<Play class="h-3.5 w-3.5" />
				</Button>
			{/if}
		</div>
	</div>
{:else if $viewStyle === 'thumbnail'}
	<!-- 缩略图视图 -->
	<div
		class="hover:bg-accent/50 flex cursor-pointer flex-col items-center p-2 transition-colors"
		class:bg-accent={isSelected}
		onclick={handleClick}
		ondblclick={handleDoubleClick}
		oncontextmenu={handleContextMenu}
		onkeydown={handleKeyDown}
		role="button"
		tabindex="0"
	>
		<!-- 缩略图容器 -->
		<div class="bg-muted relative aspect-square w-full overflow-hidden rounded">
			{#if thumbnail}
				<img src={thumbnail} alt={item.name} class="h-full w-full object-cover" />
			{:else}
				<div class="flex h-full w-full items-center justify-center">
					<FileIcon class="text-muted-foreground h-10 w-10" />
				</div>
			{/if}

			<!-- 覆盖层控件 -->
			<div class="absolute inset-0 flex items-start justify-between p-1">
				{#if $multiSelectMode}
					<Checkbox checked={isSelected} onCheckedChange={handleCheckboxChange} />
				{:else if $deleteMode}
					<Button variant="ghost" size="icon" class="h-6 w-6 bg-background/80" onclick={handleDelete}>
						<Trash2 class="h-4 w-4 text-destructive" />
					</Button>
				{:else}
					<div></div>
				{/if}

				{#if isMediaFile(item)}
					<Button variant="ghost" size="icon" class="h-6 w-6 bg-background/80" onclick={handleOpenExternal}>
						<Play class="h-3.5 w-3.5" />
					</Button>
				{/if}
			</div>
		</div>

		<!-- 选中标记 -->
		<div
			class="bg-primary mt-1 h-1 w-full rounded-full transition-opacity"
			class:opacity-0={!isSelected}
			class:opacity-100={isSelected}
		></div>

		<!-- 文件名 -->
		<div class="mt-1 w-full text-center">
			<span class="line-clamp-2 text-xs">{item.name}</span>
		</div>
	</div>
{/if}
