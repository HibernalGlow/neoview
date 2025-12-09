<script lang="ts">
	/**
	 * FileTypeIcon - 根据文件类型显示对应图标
	 */
	import {
		Folder,
		File,
		Image,
		FileArchive,
		Video,
		Play,
		FileText
	} from '@lucide/svelte';

	interface Props {
		/** 文件名（用于判断类型） */
		name: string;
		/** 是否为目录 */
		isDir?: boolean;
		/** 图标大小类名 */
		size?: 'xs' | 'sm' | 'md';
	}

	let { name, isDir = false, size = 'sm' }: Props = $props();

	// 文件类型检测
	const fileType = $derived.by(() => {
		if (isDir) return 'folder';
		const ext = name.split('.').pop()?.toLowerCase() || '';
		// 压缩包
		if (['zip', 'cbz', 'rar', 'cbr', '7z', 'cb7', 'tar', 'gz'].includes(ext)) return 'archive';
		// 图片
		if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif', 'heic', 'heif', 'jxl'].includes(ext)) return 'image';
		// 视频
		if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'ts'].includes(ext)) return 'video';
		// 音频
		if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a'].includes(ext)) return 'audio';
		// 文档
		if (['pdf', 'doc', 'docx', 'txt', 'md', 'epub', 'mobi'].includes(ext)) return 'document';
		return 'file';
	});

	// 大小类名
	const sizeClass = $derived({
		xs: 'h-3 w-3',
		sm: 'h-3.5 w-3.5',
		md: 'h-4 w-4'
	}[size]);
</script>

{#if fileType === 'folder'}
	<Folder class="{sizeClass} shrink-0 text-amber-500" />
{:else if fileType === 'archive'}
	<FileArchive class="{sizeClass} shrink-0 text-purple-500" />
{:else if fileType === 'image'}
	<Image class="{sizeClass} shrink-0 text-green-500" />
{:else if fileType === 'video'}
	<Video class="{sizeClass} shrink-0 text-red-500" />
{:else if fileType === 'audio'}
	<Play class="{sizeClass} shrink-0 text-blue-500" />
{:else if fileType === 'document'}
	<FileText class="{sizeClass} shrink-0 text-orange-500" />
{:else}
	<File class="{sizeClass} shrink-0 text-gray-500" />
{/if}
