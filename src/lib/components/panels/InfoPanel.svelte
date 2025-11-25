<script lang="ts">
	/**
	 * NeoView - Info Panel Component
	 * 信息面板 - 显示当前图像/书籍详细信息
	 */
	import { Info, Image as ImageIcon, FileText, Calendar, HardDrive, ExternalLink, Copy } from '@lucide/svelte';
	import * as Separator from '$lib/components/ui/separator';
	import { infoPanelStore, type ViewerBookInfo, type ViewerImageInfo } from '$lib/stores/infoPanel.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { FileSystemAPI } from '$lib/api';
	import * as Input from '$lib/components/ui/input';
	import * as Switch from '$lib/components/ui/switch';

	let imageInfo = $state<ViewerImageInfo | null>(null);
	let bookInfo = $state<ViewerBookInfo | null>(null);
	let contextMenu = $state<{ x: number; y: number; open: boolean }>({ x: 0, y: 0, open: false });
	
	let infoOverlayEnabled = $state(false);
	let infoOverlayOpacity = $state(0.85);

	$effect(() => {
		const unsubscribe = infoPanelStore.subscribe((state) => {
			imageInfo = state.imageInfo;
			bookInfo = state.bookInfo;
		});
		return unsubscribe;
	});

	$effect(() => {
		const s = settingsManager.getSettings();
		const overlay = s.view?.infoOverlay;
		infoOverlayEnabled = overlay?.enabled ?? false;
		infoOverlayOpacity = overlay?.opacity ?? 0.85;
	});

	function updateInfoOverlay(partial: { enabled?: boolean; opacity?: number }) {
		const current = settingsManager.getSettings();
		const prev = current.view?.infoOverlay ?? { enabled: false, opacity: 0.85 };
		const next = { ...prev };

		if (partial.enabled !== undefined) {
			next.enabled = partial.enabled;
		}
		if (partial.opacity !== undefined) {
			const raw = partial.opacity;
			const base = Number.isFinite(raw) ? (raw as number) : prev.opacity ?? 0.85;
			const clamped = Math.min(1, Math.max(0, base));
			next.opacity = clamped;
		}

		infoOverlayEnabled = next.enabled;
		infoOverlayOpacity = next.opacity;

		settingsManager.updateNestedSettings('view', {
			infoOverlay: next
		});
	}

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

	// 复制路径
	function copyPath() {
		if (bookInfo?.path) {
			navigator.clipboard.writeText(bookInfo.path);
		} else if (imageInfo?.path) {
			navigator.clipboard.writeText(imageInfo.path);
		}
		hideContextMenu();
	}

	// 在资源管理器中打开
	async function openInExplorer() {
		const path = bookInfo?.path || imageInfo?.path;
		if (path) {
			try {
				await FileSystemAPI.showInFileManager(path);
			} catch (err) {
				console.error('在资源管理器中打开失败:', err);
			}
		}
		hideContextMenu();
	}

	// 显示右键菜单
	function showContextMenu(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		console.log('[InfoPanel] showContextMenu input', {
			clientX: e.clientX,
			clientY: e.clientY,
			targetTag: (e.target as HTMLElement | null)?.tagName,
			bookPath: bookInfo?.path,
			imagePath: imageInfo?.path
		});
		
		let menuX = e.clientX;
		let menuY = e.clientY;
		
		if (menuX === 0 && menuY === 0 && e.target instanceof HTMLElement) {
			const rect = e.target.getBoundingClientRect();
			menuX = rect.left + rect.width / 2;
			menuY = rect.top + rect.height / 2;
		}
		
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		
		const menuWidth = 180;
		if (e.clientX + menuWidth > viewportWidth) {
			menuX = viewportWidth - menuWidth - 10;
		}
		if (menuX < 10) {
			menuX = 10;
		}
		
		const maxMenuHeight = viewportHeight * 0.7;
		if (menuY + maxMenuHeight > viewportHeight) {
			menuY = viewportHeight - maxMenuHeight - 10;
		}
		
		console.log('[InfoPanel] showContextMenu computed', {
			menuX,
			menuY,
			viewportWidth,
			viewportHeight
		});
		
		contextMenu = { x: menuX, y: menuY, open: true };
	}

	// 隐藏右键菜单
	function hideContextMenu() {
		contextMenu = { x: 0, y: 0, open: false };
	}
</script>

<div 
	class="h-full flex flex-col bg-background"
	oncontextmenu={showContextMenu}
	role="region"
	aria-label="信息面板"
>
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
							<span
								class={bookInfo.emmMetadata?.translatedTitle && bookInfo.emmMetadata.translatedTitle !== bookInfo.name
									? 'break-words max-w-[200px] rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-xs text-primary text-right'
									: 'font-medium break-words max-w-[200px]'}
								title={bookInfo.emmMetadata?.translatedTitle || bookInfo.name}
							>
								{bookInfo.emmMetadata?.translatedTitle || bookInfo.name}
							</span>
						</div>
						{#if bookInfo.emmMetadata?.translatedTitle && bookInfo.emmMetadata.translatedTitle !== bookInfo.name}
							<div class="flex justify-between">
								<span class="text-muted-foreground">原名:</span>
								<span class="font-mono text-xs break-words max-w-[200px]" title={bookInfo.name}>
									{bookInfo.name}
								</span>
							</div>
						{/if}
						<div class="flex justify-between">
							<span class="text-muted-foreground">路径:</span>
							<span class="font-mono text-xs break-words max-w-[200px]" title={bookInfo.path}>
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

				<!-- 信息悬浮窗 -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2 font-semibold text-sm">
							<Info class="h-4 w-4" />
							<span>信息悬浮窗</span>
						</div>
						<Switch.Root
							checked={infoOverlayEnabled}
							onCheckedChange={(v) => updateInfoOverlay({ enabled: v })}
							class="scale-75"
						/>
					</div>
					<div class="space-y-2 text-xs text-muted-foreground">
						<div class="flex items-center justify-between gap-2">
							<span>透明度</span>
							<div class="flex items-center gap-2">
								<Input.Root
									type="number"
									min="0"
									max="100"
									step="5"
									class="h-7 w-20 px-2 text-xs"
									value={Math.round(infoOverlayOpacity * 100).toString()}
									oninput={(e) => {
										const target = e.currentTarget as HTMLInputElement;
										const v = parseFloat(target.value);
										if (!Number.isNaN(v)) {
											updateInfoOverlay({ opacity: v / 100 });
										}
									}}
								/>
								<span class="text-[11px]">{Math.round(infoOverlayOpacity * 100)}%</span>
						</div>
						</div>
						<p>调节悬浮信息窗的背景透明度（0% - 100%，0% 为仅文字无底色）。</p>
					</div>
				</div>

				<Separator.Root />
			{/if}
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
							<span class="font-mono text-xs break-words max-w-[200px]" title={imageInfo.path}>
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

	<!-- 右键菜单 -->
	{#if contextMenu.open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="context-menu fixed z-50 max-h-(--bits-context-menu-content-available-height) origin-(--bits-context-menu-content-transform-origin) min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground p-1 shadow-md"
			style={`left: ${contextMenu.x}px; top: ${contextMenu.y}px;`}
			role="menu"
			tabindex="-1"
			onmousedown={(e: MouseEvent) => e.stopPropagation()}
		>
			<button
				type="button"
				class="flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
				onclick={copyPath}
			>
				<Copy class="h-4 w-4 mr-2" />
				<span>复制路径</span>
			</button>
			<hr class="bg-border -mx-1 my-1 h-px border-0" />
			<button
				type="button"
				class="flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
				onclick={openInExplorer}
				disabled={!bookInfo?.path && !imageInfo?.path}
			>
				<ExternalLink class="h-4 w-4 mr-2" />
				<span>在资源管理器中打开</span>
			</button>
		</div>
	{/if}
</div>
