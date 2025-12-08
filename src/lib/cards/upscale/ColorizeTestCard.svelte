<script lang="ts">
	/**
	 * 上色测试卡片
	 * 选择压缩包，提取第一张图片进行上色测试
	 * 复用超分的 WIC 转换内存流
	 */
	import { invoke } from '@tauri-apps/api/core';
	import { open } from '@tauri-apps/plugin-dialog';
	import { Palette, FolderOpen, Loader2, Image as ImageIcon, Download } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { colorizationManager } from '$lib/stores/colorization';
	import { settingsManager } from '$lib/settings/settingsManager';

	// 状态
	let isProcessing = $state(false);
	let selectedArchive = $state<string | null>(null);
	let firstImageName = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let processTime = $state<number | null>(null);

	// 预览
	let originalPreview = $state<string | null>(null);
	let colorizedPreview = $state<string | null>(null);

	// 上色设置
	let colorizationSize = $state(576);
	let denoiseSigma = $state(25);
	let autoSkipColor = $state(true); // 自动跳过彩色图
	let isGrayscale = $state<boolean | null>(null); // 检测结果

	/**
	 * 选择压缩包
	 */
	async function selectArchive() {
		try {
			const result = await open({
				multiple: false,
				filters: [
					{
						name: '压缩包',
						extensions: ['zip', 'rar', '7z', 'cbz', 'cbr']
					}
				]
			});

			if (result && typeof result === 'string') {
				selectedArchive = result;
				firstImageName = null;
				originalPreview = null;
				colorizedPreview = null;
				errorMessage = null;
				processTime = null;

				// 获取第一张图片信息
				await loadFirstImage();
			}
		} catch (error) {
			errorMessage = `选择文件失败: ${error}`;
		}
	}

	/**
	 * 加载压缩包第一张图片
	 */
	async function loadFirstImage() {
		if (!selectedArchive) return;

		try {
			// 获取压缩包内容列表
			const contents = await invoke<Array<{ path: string; size: number }>>('list_archive_contents', {
				archivePath: selectedArchive
			});

			// 过滤图片文件
			const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.jxl', '.heic', '.heif'];
			const images = contents.filter((item) =>
				imageExts.some((ext) => item.path.toLowerCase().endsWith(ext))
			);

			if (images.length === 0) {
				errorMessage = '压缩包中没有图片';
				return;
			}

			// 获取第一张图片
			const firstImage = images[0];
			firstImageName = firstImage.path;

			// 加载预览（使用现有的压缩包图片加载命令）
			const imageData = await invoke<number[]>('load_image_from_archive_binary', {
				archivePath: selectedArchive,
				innerPath: firstImage.path
			});

			// 转换为 Blob URL 预览
			const blob = new Blob([new Uint8Array(imageData)], { type: 'image/png' });
			originalPreview = URL.createObjectURL(blob);
		} catch (error) {
			errorMessage = `加载图片失败: ${error}`;
		}
	}

	/**
	 * 执行上色测试
	 */
	async function runColorizeTest() {
		if (!selectedArchive || !firstImageName) {
			errorMessage = '请先选择压缩包';
			return;
		}

		try {
			isProcessing = true;
			errorMessage = null;
			colorizedPreview = null;
			isGrayscale = null;

			const startTime = performance.now();

			// 加载图片数据（复用 WIC 内存流）
			const imageData = await invoke<number[]>('load_image_from_archive_binary', {
				archivePath: selectedArchive,
				innerPath: firstImageName
			});

			console.log('📦 从压缩包提取图片:', imageData.length, 'bytes');

			// 自动跳过彩色图检测
			if (autoSkipColor) {
				try {
					isGrayscale = await invoke<boolean>('check_image_is_grayscale', {
						imageData
					});
					console.log('🔍 灰度检测结果:', isGrayscale ? '灰度图' : '彩色图');

					if (!isGrayscale) {
						const endTime = performance.now();
						processTime = Math.round(endTime - startTime);
						errorMessage = '⏭️ 自动跳过：图片已是彩色';
						return;
					}
				} catch (detectError) {
					console.warn('灰度检测失败，继续上色:', detectError);
				}
			}

			// 初始化上色管理器（如果未初始化）
			if (!colorizationManager.isInitialized()) {
				const globalSettings = settingsManager.getSettings();
				const appDataDir = globalSettings.system?.thumbnailDirectory || 'C:/NeoView/cache';
				const modelDir = `${appDataDir}/colorize-models`;
				await colorizationManager.initialize(modelDir, appDataDir);
			}

			// 设置参数
			colorizationManager.setColorizationSize(colorizationSize);
			colorizationManager.setDenoiseSigma(denoiseSigma);

			// 执行上色
			const colorizedData = await colorizationManager.colorizeImageMemory(new Uint8Array(imageData));

			const endTime = performance.now();
			processTime = Math.round(endTime - startTime);

			// 生成预览
			const blob = new Blob([new Uint8Array(colorizedData)], { type: 'image/webp' });
			colorizedPreview = URL.createObjectURL(blob);

			console.log('✅ 上色完成，耗时:', processTime, 'ms');
		} catch (error) {
			errorMessage = `上色失败: ${error}`;
			console.error('上色测试失败:', error);
		} finally {
			isProcessing = false;
		}
	}

	/**
	 * 下载上色结果
	 */
	function downloadResult() {
		if (!colorizedPreview) return;

		const link = document.createElement('a');
		link.href = colorizedPreview;
		link.download = `colorized_${firstImageName?.replace(/[/\\]/g, '_') || 'image'}.webp`;
		link.click();
	}

	// 清理 Blob URL
	$effect(() => {
		return () => {
			if (originalPreview) URL.revokeObjectURL(originalPreview);
			if (colorizedPreview) URL.revokeObjectURL(colorizedPreview);
		};
	});
</script>

<div class="space-y-3">
	<!-- 标题 -->
	<div class="flex items-center gap-2">
		<Palette class="h-4 w-4 text-purple-500" />
		<span class="text-sm font-medium">上色测试</span>
	</div>

	<!-- 选择压缩包 -->
	<div class="space-y-1">
		<Button variant="outline" size="sm" class="w-full text-xs" onclick={selectArchive} disabled={isProcessing}>
			<FolderOpen class="mr-1 h-3 w-3" />
			选择压缩包
		</Button>
		{#if selectedArchive}
			<p class="truncate text-[10px] text-muted-foreground" title={selectedArchive}>
				{selectedArchive.split(/[/\\]/).pop()}
			</p>
		{/if}
	</div>

	<!-- 第一张图片信息 -->
	{#if firstImageName}
		<div class="rounded bg-muted/50 px-2 py-1">
			<div class="flex items-center gap-1">
				<ImageIcon class="h-3 w-3 text-muted-foreground" />
				<span class="truncate text-[10px]" title={firstImageName}>
					{firstImageName}
				</span>
			</div>
		</div>
	{/if}

	<!-- 参数设置 -->
	<div class="space-y-2">
		<!-- 自动跳过彩色图开关 -->
		<div class="flex items-center justify-between">
			<Label for="auto-skip" class="text-xs">自动跳过彩色图</Label>
			<Switch
				id="auto-skip"
				checked={autoSkipColor}
				onCheckedChange={(v) => (autoSkipColor = v)}
				disabled={isProcessing}
			/>
		</div>
		<p class="text-[10px] text-muted-foreground">WIC 快速检测，跳过已是彩色的图片</p>

		<!-- 检测结果显示 -->
		{#if isGrayscale !== null}
			<div class="rounded px-2 py-1 text-xs {isGrayscale ? 'bg-green-500/10 text-green-600' : 'bg-yellow-500/10 text-yellow-600'}">
				{isGrayscale ? '✓ 灰度图 (黑白漫画)' : '⚠ 彩色图'}
			</div>
		{/if}

		<div class="flex items-center justify-between">
			<Label class="text-xs">上色尺寸</Label>
			<span class="text-xs text-muted-foreground">{colorizationSize}px</span>
		</div>
		<input
			type="range"
			min={128}
			max={1024}
			step={32}
			bind:value={colorizationSize}
			disabled={isProcessing}
			class="w-full h-1.5 rounded-full appearance-none bg-muted cursor-pointer accent-primary disabled:opacity-50"
		/>

		<div class="flex items-center justify-between">
			<Label class="text-xs">降噪强度</Label>
			<span class="text-xs text-muted-foreground">{denoiseSigma}</span>
		</div>
		<input
			type="range"
			min={0}
			max={100}
			step={5}
			bind:value={denoiseSigma}
			disabled={isProcessing}
			class="w-full h-1.5 rounded-full appearance-none bg-muted cursor-pointer accent-primary disabled:opacity-50"
		/>
	</div>

	<!-- 执行按钮 -->
	<Button
		variant="default"
		size="sm"
		class="w-full"
		onclick={runColorizeTest}
		disabled={!firstImageName || isProcessing}
	>
		{#if isProcessing}
			<Loader2 class="mr-1 h-3 w-3 animate-spin" />
			处理中...
		{:else}
			<Palette class="mr-1 h-3 w-3" />
			开始上色
		{/if}
	</Button>

	<!-- 错误信息 -->
	{#if errorMessage}
		<div class="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
			{errorMessage}
		</div>
	{/if}

	<!-- 处理时间 -->
	{#if processTime !== null}
		<div class="text-center text-xs text-muted-foreground">
			处理耗时: {processTime}ms
		</div>
	{/if}

	<!-- 预览对比 -->
	{#if originalPreview || colorizedPreview}
		<div class="grid grid-cols-2 gap-2">
			{#if originalPreview}
				<div class="space-y-1">
					<p class="text-[10px] text-center text-muted-foreground">原图</p>
					<div class="aspect-square overflow-hidden rounded border bg-muted/30">
						<img src={originalPreview} alt="原图" class="h-full w-full object-contain" />
					</div>
				</div>
			{/if}
			{#if colorizedPreview}
				<div class="space-y-1">
					<p class="text-[10px] text-center text-muted-foreground">上色后</p>
					<div class="aspect-square overflow-hidden rounded border bg-muted/30">
						<img src={colorizedPreview} alt="上色后" class="h-full w-full object-contain" />
					</div>
				</div>
			{/if}
		</div>

		<!-- 下载按钮 -->
		{#if colorizedPreview}
			<Button variant="outline" size="sm" class="w-full text-xs" onclick={downloadResult}>
				<Download class="mr-1 h-3 w-3" />
				下载结果
			</Button>
		{/if}
	{/if}
</div>
