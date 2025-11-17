<script lang="ts">
	/**
	 * NeoView - Info Panel Component
	 * 信息面板 - 显示当前图像/书籍详细信息
	 */
	import { Info, Image as ImageIcon, FileText, Calendar, HardDrive } from '@lucide/svelte';
	import * as Separator from '$lib/components/ui/separator';
	import { infoPanelStore, type ViewerBookInfo, type ViewerImageInfo } from '$lib/stores/infoPanel.svelte';

	let imageInfo = $state<ViewerImageInfo | null>(null);
	let bookInfo = $state<ViewerBookInfo | null>(null);

	$effect(() => {
		const unsubscribe = infoPanelStore.subscribe((state) => {
			imageInfo = state.imageInfo;
			bookInfo = state.bookInfo;
		});
		return unsubscribe;
	});

	function formatFileSize(bytes?: number): string {
		if (bytes === undefined) return '—';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}

	function formatDate(date?: string): string {
		if (!date) return '—';
		const parsed = new Date(date);
		if (Number.isNaN(parsed.getTime())) {
			return date;
		}
		return parsed.toLocaleString('zh-CN');
	}

	function formatBookType(type?: string): string {
		if (!type) return '未知';
		switch (type.toLowerCase()) {
			case 'folder':
				return '文件夹';
			case 'archive':
				return '压缩包';
			case 'pdf':
				return 'PDF';
			case 'media':
				return '媒体';
			default:
				return type;
		}
	}
</script>

<div class="h-full flex flex-col bg-background">
	<!-- 标题栏 -->
	<div class="p-4 border-b">
		<div class="flex items-center gap-2">
			<Info class="h-5 w-5" />
			<h3 class="font-semibold">详细信息</h3>
		</div>
	</div>

	<div class="flex-1 overflow-auto">
		<div class="p-4 space-y-6">
			<!-- 书籍信息 -->
			{#if bookInfo}
				<div class="space-y-3">
					<div class="flex items-center gap-2 font-semibold text-sm">
						<FileText class="h-4 w-4" />
						<span>书籍信息</span>
					</div>

					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-muted-foreground">名称:</span>
							<span class="font-medium truncate max-w-[200px]" title={bookInfo.name}>
								{bookInfo.name}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">路径:</span>
							<span class="font-mono text-xs truncate max-w-[200px]" title={bookInfo.path}>
								{bookInfo.path}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">类型:</span>
							<span>{formatBookType(bookInfo.type)}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">页码:</span>
							<span>
								{bookInfo.currentPage} / {bookInfo.totalPages}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">进度:</span>
							<span>
								{#if bookInfo.totalPages > 0}
									{(
										(Math.min(bookInfo.currentPage, bookInfo.totalPages) / bookInfo.totalPages) *
										100
									).toFixed(1)}%
								{:else}
									—
								{/if}
							</span>
						</div>
					</div>
				</div>

				<Separator.Root />
			{/if}

			<!-- 图像信息 -->
			{#if imageInfo}
				<div class="space-y-3">
					<div class="flex items-center gap-2 font-semibold text-sm">
						<ImageIcon class="h-4 w-4" />
						<span>图像信息</span>
					</div>

					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-muted-foreground">文件名:</span>
							<span class="font-mono text-xs" title={imageInfo.name}>
								{imageInfo.name}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">格式:</span>
							<span>{imageInfo.format ?? '—'}</span>
						</div>
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
						<div class="flex justify-between">
							<span class="text-muted-foreground">色深:</span>
							<span>{imageInfo.colorDepth ?? '—'}</span>
						</div>
					</div>
				</div>

				<Separator.Root />

				<div class="space-y-3">
					<div class="flex items-center gap-2 font-semibold text-sm">
						<HardDrive class="h-4 w-4" />
						<span>存储信息</span>
					</div>

					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-muted-foreground">路径:</span>
							<span class="font-mono text-xs truncate max-w-[200px]" title={imageInfo.path}>
								{imageInfo.path ?? '—'}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">大小:</span>
							<span>{formatFileSize(imageInfo.fileSize)}</span>
						</div>
					</div>
				</div>

				<Separator.Root />

				<!-- 时间信息 -->
				<div class="space-y-3">
					<div class="flex items-center gap-2 font-semibold text-sm">
						<Calendar class="h-4 w-4" />
						<span>时间信息</span>
					</div>

					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-muted-foreground">创建时间:</span>
							<span class="text-xs">{formatDate(imageInfo.createdAt)}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">修改时间:</span>
							<span class="text-xs">{formatDate(imageInfo.modifiedAt)}</span>
						</div>
					</div>
				</div>
			{:else}
				<div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
					<div class="relative mb-4">
						<Info class="h-16 w-16 opacity-30" />
						<div class="absolute inset-0 flex items-center justify-center">
							<div class="h-2 w-2 bg-muted-foreground rounded-full animate-pulse"></div>
						</div>
					</div>
					<div class="text-center space-y-2">
						<p class="text-lg font-medium">暂无图像信息</p>
						<p class="text-sm opacity-70">打开图像文件后查看详细信息</p>
						<div class="mt-4 p-3 bg-muted/50 rounded-lg text-xs space-y-1">
							<p class="font-medium text-foreground">支持格式：</p>
							<p>• 图像：JPG, PNG, GIF, WebP, AVIF</p>
							<p>• 文档：PDF, CBZ, CBR</p>
							<p>• 视频：MP4, WebM (缩略图)</p>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
