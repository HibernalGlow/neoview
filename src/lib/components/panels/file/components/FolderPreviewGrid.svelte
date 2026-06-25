<script lang="ts">
	/**
	 * FolderPreviewGrid - 文件夹多图自适应网格预览组件
	 *
	 * 显示文件夹内任意数量图片的缩略图自适应网格预览（支持 2x2, 3x3 等）
	 */
	import { Folder, Image } from '@lucide/svelte';

	interface Props {
		/** 预览图 URL 数组 */
		thumbnails: string[];
		/** 文件夹名称，用于 alt 属性 */
		folderName?: string;
		/** 是否显示加载骨架屏 */
		loading?: boolean;
	}

	let { thumbnails = [], folderName = '', loading = false }: Props = $props();

	// 动态计算行数、列数 and 总格数，支持任意数量预览
	const gridInfo = $derived.by(() => {
		const len = thumbnails.length;
		if (len <= 1) {
			return { cols: 1, rows: 1, size: 1 };
		}
		if (len <= 4) {
			return { cols: 2, rows: 2, size: 4 };
		}
		if (len <= 9) {
			return { cols: 3, rows: 3, size: 9 };
		}
		// 支持更大网格（如 4x4 等）
		const cols = Math.ceil(Math.sqrt(len));
		return {
			cols,
			rows: cols,
			size: cols * cols
		};
	});
</script>

<div class="relative h-full w-full overflow-hidden">
	{#if loading}
		<!-- 加载中骨架屏 -->
		<div class="bg-accent absolute inset-0 animate-pulse"></div>
		<div class="relative flex h-full w-full items-center justify-center">
			<Folder class="text-primary/50 h-12 w-12" />
		</div>
	{:else if thumbnails.length === 0}
		<!-- 无预览图时显示文件夹图标 -->
		<div class="bg-accent absolute inset-0 animate-pulse"></div>
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
		<!-- 多图自适应网格 -->
		<div
			class="grid h-full w-full gap-0.5"
			style="grid-template-columns: repeat({gridInfo.cols}, minmax(0, 1fr)); grid-template-rows: repeat({gridInfo.rows}, minmax(0, 1fr));"
		>
			{#each Array(gridInfo.size) as _, index}
				<div class="bg-secondary relative overflow-hidden">
					{#if thumbnails[index]}
						<img
							src={thumbnails[index]}
							alt="{folderName} 预览 {index + 1}"
							loading="lazy"
							decoding="async"
							class="h-full w-full object-cover"
						/>
					{:else}
						<!-- 空置预览位占位 -->
						<div class="flex h-full w-full items-center justify-center">
							<Image class="text-primary/30 h-4 w-4" />
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
