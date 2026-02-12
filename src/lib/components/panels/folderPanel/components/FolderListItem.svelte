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
	folderTabActions,
	tabViewStyle,
	tabMultiSelectMode,
	tabDeleteMode,
	tabSelectedItems
} from '../stores/folderTabStore';
import type { FolderViewStyle } from '../stores/folderPanelStore';

// 别名映射
const viewStyle = tabViewStyle;
const multiSelectMode = tabMultiSelectMode;
const deleteMode = tabDeleteMode;
const selectedItems = tabSelectedItems;

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
		folderTabActions.selectItem(item.path, true);
	} else {
		folderTabActions.selectItem(item.path);
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
	folderTabActions.selectItem(item.path, true);
}

function handleDelete(e: MouseEvent) {
	e.stopPropagation();
	onDelete?.(item);
}

async function handleOpenExternal(e: MouseEvent) {
	e.stopPropagation();
	const { open } = await import('@tauri-apps/plugin-shell');
	await open(item.path);
}

// [已移除] 键盘导航现由全局键位绑定系统处理，避免冲突
</script>

{#if $viewStyle === 'list'}
	<!-- 列表视图 -->
	<div
		class="group mx-1 my-0.5 flex min-h-[36px] cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-all duration-150 hover:bg-muted/60 {isSelected ? 'bg-accent ring-1 ring-primary/30 shadow-sm' : ''}"
		onclick={handleClick}
		ondblclick={handleDoubleClick}
		oncontextmenu={handleContextMenu}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				handleClick(e as any);
			}
		}}
		role="button"
		tabindex="0"
	>
		<!-- 选中标记 -->
		<div
			class="bg-primary h-5 w-1 rounded-full transition-all duration-200 {isSelected ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-0'}"
		></div>

		<!-- 多选复选框 -->
		{#if $multiSelectMode}
			<Checkbox checked={isSelected} onCheckedChange={handleCheckboxChange} class="shrink-0" />
		{/if}

		<!-- 删除按钮 -->
		{#if $deleteMode}
			<Button variant="ghost" size="icon" class="h-6 w-6 shrink-0 hover:bg-destructive/10" onclick={handleDelete}>
				<Trash2 class="h-4 w-4 text-destructive" />
			</Button>
		{/if}

		<!-- 文件图标 -->
		<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted/50">
			<FileIcon class="h-4 w-4 text-muted-foreground" />
		</div>

		<!-- 文件名 -->
		<span class="flex-1 truncate text-sm font-medium">{item.name}</span>

		<!-- 媒体播放按钮 -->
		{#if isMediaFile(item)}
			<Button variant="ghost" size="icon" class="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100" onclick={handleOpenExternal}>
				<Play class="h-3.5 w-3.5" />
			</Button>
		{/if}
	</div>
{:else if $viewStyle === 'content'}
	<!-- 内容视图 -->
	<div
		class="group mx-1 my-1 flex cursor-pointer items-center gap-3 rounded-lg border border-border/50 bg-card p-2 transition-all duration-150 hover:bg-muted/50 hover:border-border {isSelected ? 'border-primary/40 bg-accent shadow-sm' : ''}"
		onclick={handleClick}
		ondblclick={handleDoubleClick}
		oncontextmenu={handleContextMenu}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				handleClick(e as any);
			}
		}}
		role="button"
		tabindex="0"
	>
		<!-- 选中标记 -->
		<div
			class="bg-primary h-10 w-1 rounded-full transition-all duration-200 {isSelected ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-0'}"
		></div>

		{#if $multiSelectMode}
			<Checkbox checked={isSelected} onCheckedChange={handleCheckboxChange} class="shrink-0" />
		{/if}

		{#if $deleteMode}
			<Button variant="ghost" size="icon" class="h-6 w-6 shrink-0 hover:bg-destructive/10" onclick={handleDelete}>
				<Trash2 class="h-4 w-4 text-destructive" />
			</Button>
		{/if}

		<!-- 缩略图 -->
		<div class="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted shadow-inner">
			{#if thumbnail}
				<img src={thumbnail} alt={item.name} class="h-full w-full object-cover" />
			{:else}
				<FileIcon class="h-7 w-7 text-muted-foreground" />
			{/if}
		</div>

		<!-- 信息 -->
		<div class="min-w-0 flex-1">
			<div class="truncate text-sm font-medium leading-tight">{item.name}</div>
			<div class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
				<span>{formatDate(item.modified)}</span>
				<span class="h-1 w-1 rounded-full bg-muted-foreground/40"></span>
				<span>{formatSize(item.size)}</span>
			</div>
		</div>

		{#if isMediaFile(item)}
			<Button variant="ghost" size="icon" class="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100" onclick={handleOpenExternal}>
				<Play class="h-4 w-4" />
			</Button>
		{/if}
	</div>
{:else if $viewStyle === 'banner'}
	<!-- 横幅视图 -->
	<div
		class="group mx-1 my-1 flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border/50 bg-card transition-all duration-150 hover:shadow-md hover:border-border {isSelected ? 'border-primary/40 ring-2 ring-primary/20 shadow-sm' : ''}"
		onclick={handleClick}
		ondblclick={handleDoubleClick}
		oncontextmenu={handleContextMenu}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				handleClick(e as any);
			}
		}}
		role="button"
		tabindex="0"
	>
		<!-- 选中标记 -->
		<div
			class="bg-primary h-1 w-full transition-all duration-200 {isSelected ? 'opacity-100' : 'opacity-0'}"
		></div>

		<!-- 横幅图片 -->
		<div class="relative aspect-[3/1] w-full overflow-hidden bg-muted">
			{#if thumbnail}
				<img src={thumbnail} alt={item.name} class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
			{:else}
				<div class="flex h-full w-full items-center justify-center bg-linear-to-br from-muted to-muted/50">
					<FileIcon class="h-12 w-12 text-muted-foreground" />
				</div>
			{/if}

			<!-- 多选/删除覆盖层 -->
			{#if $multiSelectMode || $deleteMode}
				<div class="absolute left-2 top-2 flex gap-1">
					{#if $multiSelectMode}
						<div class="rounded bg-background/90 p-0.5 backdrop-blur-sm">
							<Checkbox checked={isSelected} onCheckedChange={handleCheckboxChange} />
						</div>
					{/if}
					{#if $deleteMode}
						<Button variant="ghost" size="icon" class="h-7 w-7 bg-background/90 backdrop-blur-sm hover:bg-destructive/20" onclick={handleDelete}>
							<Trash2 class="h-4 w-4 text-destructive" />
						</Button>
					{/if}
				</div>
			{/if}
		</div>

		<!-- 文件名 -->
		<div class="flex items-center gap-2 bg-card px-3 py-2">
			<div class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted/50">
				<FileIcon class="h-3.5 w-3.5 text-muted-foreground" />
			</div>
			<span class="flex-1 truncate text-sm font-medium">{item.name}</span>
			{#if isMediaFile(item)}
				<Button variant="ghost" size="icon" class="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100" onclick={handleOpenExternal}>
					<Play class="h-3.5 w-3.5" />
				</Button>
			{/if}
		</div>
	</div>
{:else if $viewStyle === 'thumbnail'}
	<!-- 缩略图视图 -->
	<div
		class="group flex cursor-pointer flex-col items-center rounded-lg p-1.5 transition-all duration-150 hover:bg-muted/50 {isSelected ? 'bg-accent ring-2 ring-primary/20' : ''}"
		onclick={handleClick}
		ondblclick={handleDoubleClick}
		oncontextmenu={handleContextMenu}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				handleClick(e as any);
			}
		}}
		role="button"
		tabindex="0"
	>
		<!-- 缩略图容器 -->
		<div class="relative aspect-square w-full overflow-hidden rounded-md border border-border/50 bg-muted shadow-inner transition-transform duration-200 group-hover:scale-[1.02]">
			{#if thumbnail}
				<img src={thumbnail} alt={item.name} class="h-full w-full object-cover" />
			{:else}
				<div class="flex h-full w-full items-center justify-center bg-linear-to-br from-muted to-muted/50">
					<FileIcon class="h-10 w-10 text-muted-foreground" />
				</div>
			{/if}

			<!-- 覆盖层控件 -->
			<div class="absolute inset-0 flex items-start justify-between p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
				{#if $multiSelectMode}
					<div class="rounded bg-background/90 p-0.5 backdrop-blur-sm">
						<Checkbox checked={isSelected} onCheckedChange={handleCheckboxChange} />
					</div>
				{:else if $deleteMode}
					<Button variant="ghost" size="icon" class="h-7 w-7 bg-background/90 backdrop-blur-sm hover:bg-destructive/20" onclick={handleDelete}>
						<Trash2 class="h-4 w-4 text-destructive" />
					</Button>
				{:else}
					<div></div>
				{/if}

				{#if isMediaFile(item)}
					<Button variant="ghost" size="icon" class="h-7 w-7 bg-background/90 backdrop-blur-sm" onclick={handleOpenExternal}>
						<Play class="h-4 w-4" />
					</Button>
				{/if}
			</div>
			
			<!-- 选中标记 - 底部条 -->
			<div
				class="bg-primary absolute bottom-0 left-0 right-0 h-1 transition-all duration-200 {isSelected ? 'opacity-100' : 'opacity-0'}"
			></div>
		</div>

		<!-- 文件名 -->
		<div class="mt-1.5 w-full px-0.5 text-center">
			<span class="line-clamp-2 text-xs font-medium leading-tight">{item.name}</span>
		</div>
	</div>
{/if}
