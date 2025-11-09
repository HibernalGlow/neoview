<script lang="ts">
	/**
	 * NeoView - Info Panel Component
	 * 信息面板 - 显示当前图像/书籍详细信息
	 */
	import { Info, Image as ImageIcon, FileText, Calendar, HardDrive } from '@lucide/svelte';

	interface ImageInfo {
		filename: string;
		format: string;
		width: number;
		height: number;
		fileSize: number;
		colorDepth: number;
		created: Date;
		modified: Date;
	}

	interface BookInfo {
		path: string;
		type: 'folder' | 'archive';
		totalPages: number;
		currentPage: number;
	}

	let imageInfo = $state<ImageInfo | null>(null);
	let bookInfo = $state<BookInfo | null>(null);

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}

	function formatDate(date: Date): string {
		return date.toLocaleString('zh-CN');
	}

	// 示例数据
	$effect(() => {
		imageInfo = {
			filename: 'example.jpg',
			format: 'JPEG',
			width: 1920,
			height: 1080,
			fileSize: 2547890,
			colorDepth: 24,
			created: new Date(2024, 0, 15),
			modified: new Date(2024, 10, 9)
		};

		bookInfo = {
			path: 'C:\\Images\\Manga\\Volume 1',
			type: 'folder',
			totalPages: 200,
			currentPage: 15
		};
	});
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
							<span class="text-muted-foreground">路径:</span>
							<span class="font-mono text-xs truncate max-w-[200px]" title={bookInfo.path}>
								{bookInfo.path}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">类型:</span>
							<span>{bookInfo.type === 'folder' ? '文件夹' : '压缩包'}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">总页数:</span>
							<span>{bookInfo.totalPages}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">当前页:</span>
							<span>{bookInfo.currentPage}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">进度:</span>
							<span>{((bookInfo.currentPage / bookInfo.totalPages) * 100).toFixed(1)}%</span>
						</div>
					</div>
				</div>

				<div class="border-t"></div>
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
							<span class="font-mono text-xs" title={imageInfo.filename}>
								{imageInfo.filename}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">格式:</span>
							<span>{imageInfo.format}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">尺寸:</span>
							<span>{imageInfo.width} × {imageInfo.height}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">文件大小:</span>
							<span>{formatFileSize(imageInfo.fileSize)}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">色深:</span>
							<span>{imageInfo.colorDepth} 位</span>
						</div>
					</div>
				</div>

				<div class="border-t"></div>

				<!-- 时间信息 -->
				<div class="space-y-3">
					<div class="flex items-center gap-2 font-semibold text-sm">
						<Calendar class="h-4 w-4" />
						<span>时间信息</span>
					</div>

					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-muted-foreground">创建时间:</span>
							<span class="text-xs">{formatDate(imageInfo.created)}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">修改时间:</span>
							<span class="text-xs">{formatDate(imageInfo.modified)}</span>
						</div>
					</div>
				</div>
			{:else}
				<div class="text-center py-8 text-muted-foreground">
					<Info class="h-12 w-12 mx-auto mb-2 opacity-50" />
					<p>暂无图像信息</p>
				</div>
			{/if}
		</div>
	</div>
</div>
