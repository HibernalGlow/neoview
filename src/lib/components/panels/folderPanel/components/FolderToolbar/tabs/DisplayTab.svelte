<script lang="ts">
/**
 * DisplayTab - 显示设置标签页
 * 包含悬停预览、内部文件显示、缩略图大小等设置
 */
import { Eye, Package, Image, Grid3x3, LayoutGrid } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { hoverPreviewSettings, hoverPreviewEnabled, hoverPreviewDelayMs } from '$lib/stores/hoverPreviewSettings.svelte';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';

interface Props {
	/** 缩略图宽度百分比 */
	thumbnailWidthPercent: number;
	/** 横幅宽度百分比 */
	bannerWidthPercent: number;
	/** 回调函数 */
	onSetThumbnailWidthPercent: (value: number) => void;
	onSetBannerWidthPercent: (value: number) => void;
}

let {
	thumbnailWidthPercent,
	bannerWidthPercent,
	onSetThumbnailWidthPercent,
	onSetBannerWidthPercent
}: Props = $props();
</script>

<div class="flex flex-wrap items-center gap-4 text-xs">
	<!-- 悬停预览 -->
	<div class="flex items-center gap-2">
		<Eye class="h-3.5 w-3.5 text-muted-foreground" />
		<span class="text-muted-foreground">预览:</span>
		<Button 
			variant={$hoverPreviewEnabled ? 'default' : 'outline'} 
			size="sm" 
			class="h-6 text-xs px-2"
			onclick={() => hoverPreviewSettings.toggle()}
		>
			{$hoverPreviewEnabled ? '开' : '关'}
		</Button>
		{#if $hoverPreviewEnabled}
			<select 
				class="h-6 bg-background border rounded text-xs px-1"
				value={$hoverPreviewDelayMs}
				onchange={(e) => hoverPreviewSettings.setDelayMs(parseInt((e.target as HTMLSelectElement).value))}
			>
				<option value="200">200ms</option>
				<option value="500">500ms</option>
				<option value="800">800ms</option>
				<option value="1200">1200ms</option>
			</select>
		{/if}
	</div>

	<!-- 穿透内部显示 -->
	<div class="flex items-center gap-2">
		<Package class="h-3.5 w-3.5 text-muted-foreground" />
		<span class="text-muted-foreground">内部文件:</span>
		<select 
			class="h-6 bg-background border rounded text-xs px-1"
			value={$fileBrowserStore.penetrateShowInnerFile}
			onchange={(e) => fileBrowserStore.setPenetrateShowInnerFile((e.target as HTMLSelectElement).value as 'none' | 'penetrate' | 'always')}
		>
			<option value="none">不显示</option>
			<option value="penetrate">穿透时</option>
			<option value="always">始终</option>
		</select>
		<select 
			class="h-6 bg-background border rounded text-xs px-1"
			value={$fileBrowserStore.penetrateInnerFileCount}
			onchange={(e) => fileBrowserStore.setPenetrateInnerFileCount((e.target as HTMLSelectElement).value as 'single' | 'all')}
		>
			<option value="single">单文件</option>
			<option value="all">多文件</option>
		</select>
	</div>

	<!-- 纯媒体文件夹点击直接打开 -->
	<div class="flex items-center gap-2">
		<Image class="h-3.5 w-3.5 text-muted-foreground" />
		<span class="text-muted-foreground">媒体文件夹:</span>
		<Button 
			variant={$fileBrowserStore.penetratePureMediaFolderOpen ? 'default' : 'outline'} 
			size="sm" 
			class="h-6 text-xs"
			onclick={() => fileBrowserStore.setPenetratePureMediaFolderOpen(!$fileBrowserStore.penetratePureMediaFolderOpen)}
		>
			{$fileBrowserStore.penetratePureMediaFolderOpen ? '点击打开' : '点击进入'}
		</Button>
	</div>

	<!-- 文件夹 4 图预览 -->
	<div class="flex items-center gap-2">
		<LayoutGrid class="h-3.5 w-3.5 text-muted-foreground" />
		<span class="text-muted-foreground">文件夹预览:</span>
		<Button 
			variant={$fileBrowserStore.folderPreviewGrid ? 'default' : 'outline'} 
			size="sm" 
			class="h-6 text-xs px-2"
			onclick={() => fileBrowserStore.setFolderPreviewGrid(!$fileBrowserStore.folderPreviewGrid)}
		>
			{$fileBrowserStore.folderPreviewGrid ? '4图' : '单图'}
		</Button>
	</div>

	<!-- 缩略图大小 -->
	<div class="flex items-center gap-2">
		<Grid3x3 class="h-3.5 w-3.5 text-muted-foreground" />
		<span class="text-muted-foreground">缩略图:</span>
		<input
			type="range"
			min="10"
			max="90"
			value={thumbnailWidthPercent}
			oninput={(e) => onSetThumbnailWidthPercent(parseInt((e.target as HTMLInputElement).value))}
			class="w-20 h-4 accent-primary"
		/>
		<span class="text-muted-foreground w-10">{Math.round(48 + (thumbnailWidthPercent - 10) * 3)}px</span>
	</div>

	<!-- 横幅大小 -->
	<div class="flex items-center gap-2">
		<Image class="h-3.5 w-3.5 text-muted-foreground" />
		<span class="text-muted-foreground">横幅:</span>
		<input
			type="range"
			min="20"
			max="100"
			step="10"
			value={bannerWidthPercent}
			oninput={(e) => onSetBannerWidthPercent(parseInt((e.target as HTMLInputElement).value))}
			class="w-20 h-4 accent-primary"
		/>
		<span class="text-muted-foreground w-10">{Math.floor(100 / bannerWidthPercent)}列</span>
	</div>
</div>
