<script lang="ts">
/**
 * 媒体信息卡片（图片/视频）
 * 从 InfoPanel 提取
 */
import { infoPanelStore, type ViewerImageInfo } from '$lib/stores/infoPanel.svelte';

let imageInfo = $state<ViewerImageInfo | null>(null);

$effect(() => {
	const unsubscribe = infoPanelStore.subscribe((state) => {
		imageInfo = state.imageInfo;
	});
	return unsubscribe;
});

function formatDuration(seconds?: number): string {
	if (seconds == null || seconds <= 0) return '—';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatBitrate(bps?: number): string {
	if (bps == null || bps <= 0) return '—';
	if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
	if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
	return `${bps} bps`;
}

function formatFileSize(bytes?: number): string {
	if (bytes == null || bytes <= 0) return '—';
	if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
	if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
	if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
	return `${bytes} B`;
}
</script>

{#if imageInfo}
	<div class="space-y-2 text-sm">
		<!-- 媒体类型 -->
		<div class="flex justify-between items-center">
			<span class="text-muted-foreground">类型:</span>
			<span class="flex items-center gap-1">
				{#if imageInfo.isVideo}
					<span>🎬</span> 视频
				{:else}
					<span>🖼️</span> 图片
				{/if}
			</span>
		</div>
		
		<!-- 文件名 -->
		<div class="flex justify-between">
			<span class="text-muted-foreground">文件名:</span>
			<span class="font-mono text-xs truncate max-w-[150px]" title={imageInfo.name}>
				{imageInfo.name}
			</span>
		</div>
		
		<!-- 尺寸 -->
		<div class="flex justify-between">
			<span class="text-muted-foreground">尺寸:</span>
			<span>
				{#if imageInfo.width && imageInfo.height}
					{imageInfo.width} × {imageInfo.height}
				{:else}
					—
				{/if}
			</span>
		</div>
		
		{#if imageInfo.isVideo}
			<!-- 视频特有信息 -->
			<div class="flex justify-between">
				<span class="text-muted-foreground">时长:</span>
				<span>{formatDuration(imageInfo.duration)}</span>
			</div>
			{#if imageInfo.frameRate}
				<div class="flex justify-between">
					<span class="text-muted-foreground">帧率:</span>
					<span>{imageInfo.frameRate.toFixed(0)} fps</span>
				</div>
			{/if}
			{#if imageInfo.bitrate}
				<div class="flex justify-between">
					<span class="text-muted-foreground">码率:</span>
					<span>{formatBitrate(imageInfo.bitrate)}</span>
				</div>
			{/if}
			{#if imageInfo.videoCodec}
				<div class="flex justify-between">
					<span class="text-muted-foreground">视频编码:</span>
					<span>{imageInfo.videoCodec}</span>
				</div>
			{/if}
			{#if imageInfo.audioCodec}
				<div class="flex justify-between">
					<span class="text-muted-foreground">音频编码:</span>
					<span>{imageInfo.audioCodec}</span>
				</div>
			{/if}
		{:else}
			<!-- 图片特有信息 -->
			<div class="flex justify-between">
				<span class="text-muted-foreground">格式:</span>
				<span>{imageInfo.format ?? '—'}</span>
			</div>
			{#if imageInfo.fileSize}
				<div class="flex justify-between">
					<span class="text-muted-foreground">大小:</span>
					<span>{formatFileSize(imageInfo.fileSize)}</span>
				</div>
			{/if}
		{/if}
	</div>
{:else}
	<div class="text-sm text-muted-foreground text-center py-2">
		暂无媒体信息
	</div>
{/if}
