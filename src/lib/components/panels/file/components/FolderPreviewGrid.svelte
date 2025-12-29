<script lang="ts">
	/**
	 * FolderPreviewGrid - 文件夹 2x2 预览网格组件
	 * 
	 * 显示文件夹内前 4 张图片的缩略图预览
	 * 参考 OpenComic 的文件夹预览实现
	 */
	import { Folder, Image } from '@lucide/svelte';

	interface Props {
		/** 预览图 URL 数组，最多 4 个 */
		thumbnails: string[];
		/** 文件夹名称，用于 alt 属性 */
		folderName?: string;
		/** 是否显示加载骨架屏 */
		loading?: boolean;
	}

	let { thumbnails = [], folderName = '', loading = false }: Props = $props();

	// 计算网格布局：1 张图占满，2-4 张图为 2x2 网格
	const gridClass = $derived(() => {
		if (thumbnails.length === 1) {
			return 'grid-cols-1 grid-rows-1';
		}
		return 'grid-cols-2 grid-rows-2';
	});
</script>

<div class="relative h-full w-full overflow-hidden">
	{#if loading}
		<!-- 加载中骨架屏 -->
		<div class="absolute inset-0 animate-pulse bg-accent"></div>
		<div class="relative flex h-full w-full items-center justify-center">
			<Folder class="text-primary/50 h-12 w-12" />
		</div>
	{:else if thumbnails.length === 0}
		<!-- 无预览图时显示文件夹图标 -->
		<div class="absolute inset-0 animate-pulse bg-accent"></div>
		<div class="relative flex h-full w-full items-center justify-center">
			<Folder class="text-primary/50 h-16 w-16" />
		</div>
	{:else if thumbnails.length === 1}
		<!-- 单图（封面或只有一张图）占满 -->
		<img
			src={thumbnails[0]}
			alt={folderName}
			loading="lazy"
			decoding="async"
			class="h-full w-full object-cover"
		/>
	{:else}
		<!-- 2-4 张图显示为 2x2 网格 -->
		<div class="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
			{#each [0, 1, 2, 3] as index}
				<div class="relative overflow-hidden bg-secondary">
					{#if thumbnails[index]}
						<img
							src={thumbnails[index]}
							alt="{folderName} 预览 {index + 1}"
							loading="lazy"
							decoding="async"
							class="h-full w-full object-cover"
						/>
					{:else}
						<!-- 不足 4 张时显示占位 -->
						<div class="flex h-full w-full items-center justify-center">
							<Image class="text-primary/30 h-6 w-6" />
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
