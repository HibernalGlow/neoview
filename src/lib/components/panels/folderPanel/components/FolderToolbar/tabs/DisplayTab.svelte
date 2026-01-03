<script lang="ts">
/**
 * DisplayTab - 显示设置标签页
 * 包含悬停预览、文件夹预览、缩略图大小等通用显示设置
 * 注意：穿透相关设置（内部文件、媒体文件夹、穿透层数）在 PenetrateSettingsBar 中
 */
import { Eye, Image, Grid3x3, LayoutGrid } from '@lucide/svelte';
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

	<!-- [4图预览功能已禁用]
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
	-->

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
