<script lang="ts">
	/**
	 * Image Properties Panel
	 * 图片属性面板 - 显示当前图片的详细信息
	 */
	import { Info, FileImage, Palette, Calendar, HardDrive } from '@lucide/svelte';

	interface ImageProperties {
		// 文件信息
		path: string;
		name: string;
		size: string;
		format: string;
		// 图片信息
		width: number;
		height: number;
		colorDepth: string;
		colorSpace: string;
		// EXIF 信息
		camera?: string;
		lens?: string;
		iso?: string;
		shutterSpeed?: string;
		aperture?: string;
		focalLength?: string;
		dateTaken?: string;
		// 元数据
		dpi?: number;
		compression?: string;
	}

	// 模拟数据 - 实际应从 Tauri 后端获取
	let properties = $state<ImageProperties>({
		path: 'D:/Photos/sample.jpg',
		name: 'sample.jpg',
		size: '2.8 MB',
		format: 'JPEG',
		width: 3840,
		height: 2160,
		colorDepth: '24-bit',
		colorSpace: 'sRGB',
		camera: 'Canon EOS R5',
		lens: 'RF 24-105mm F4 L IS USM',
		iso: '400',
		shutterSpeed: '1/250',
		aperture: 'f/5.6',
		focalLength: '85mm',
		dateTaken: '2024-03-15 14:30:25',
		dpi: 300,
		compression: 'Quality 95%'
	});

	function formatDimensions(width: number, height: number): string {
		return `${width} × ${height} px`;
	}

	function formatAspectRatio(width: number, height: number): string {
		const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
		const divisor = gcd(width, height);
		return `${width / divisor}:${height / divisor}`;
	}

	function formatMegapixels(width: number, height: number): string {
		return `${((width * height) / 1000000).toFixed(1)} MP`;
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
		// TODO: 显示复制成功提示
	}
</script>

<div class="h-full flex flex-col bg-background overflow-y-auto">
	<!-- 头部 -->
	<div class="p-3 border-b sticky top-0 bg-background z-10">
		<h3 class="text-sm font-semibold flex items-center gap-2">
			<Info class="h-4 w-4" />
			图片属性
		</h3>
	</div>

	<!-- 属性内容 -->
	<div class="p-3 space-y-4">
		<!-- 文件信息 -->
		<div class="space-y-2">
			<h4 class="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
				<FileImage class="h-3 w-3" />
				文件信息
			</h4>
			<div class="space-y-1.5 pl-5">
				<div class="flex flex-col gap-0.5">
					<span class="text-[10px] text-muted-foreground">文件名</span>
					<button
						class="text-xs text-left hover:text-primary transition-colors"
						onclick={() => copyToClipboard(properties.name)}
						title="点击复制"
					>
						{properties.name}
					</button>
				</div>
				<div class="flex flex-col gap-0.5">
					<span class="text-[10px] text-muted-foreground">路径</span>
					<button
						class="text-xs text-left hover:text-primary transition-colors truncate w-full"
						onclick={() => copyToClipboard(properties.path)}
						title={properties.path}
					>
						{properties.path}
					</button>
				</div>
				<div class="flex justify-between items-center">
					<span class="text-[10px] text-muted-foreground">大小</span>
					<span class="text-xs font-mono">{properties.size}</span>
				</div>
				<div class="flex justify-between items-center">
					<span class="text-[10px] text-muted-foreground">格式</span>
					<span class="text-xs font-mono font-semibold text-primary">{properties.format}</span>
				</div>
			</div>
		</div>

		<!-- 图片信息 -->
		<div class="space-y-2">
			<h4 class="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
				<Palette class="h-3 w-3" />
				图片信息
			</h4>
			<div class="space-y-1.5 pl-5">
				<div class="flex justify-between items-center">
					<span class="text-[10px] text-muted-foreground">尺寸</span>
					<span class="text-xs font-mono"
						>{formatDimensions(properties.width, properties.height)}</span
					>
				</div>
				<div class="flex justify-between items-center">
					<span class="text-[10px] text-muted-foreground">宽高比</span>
					<span class="text-xs font-mono"
						>{formatAspectRatio(properties.width, properties.height)}</span
					>
				</div>
				<div class="flex justify-between items-center">
					<span class="text-[10px] text-muted-foreground">分辨率</span>
					<span class="text-xs font-mono"
						>{formatMegapixels(properties.width, properties.height)}</span
					>
				</div>
				<div class="flex justify-between items-center">
					<span class="text-[10px] text-muted-foreground">色深</span>
					<span class="text-xs font-mono">{properties.colorDepth}</span>
				</div>
				<div class="flex justify-between items-center">
					<span class="text-[10px] text-muted-foreground">色彩空间</span>
					<span class="text-xs font-mono">{properties.colorSpace}</span>
				</div>
				{#if properties.dpi}
					<div class="flex justify-between items-center">
						<span class="text-[10px] text-muted-foreground">DPI</span>
						<span class="text-xs font-mono">{properties.dpi}</span>
					</div>
				{/if}
				{#if properties.compression}
					<div class="flex justify-between items-center">
						<span class="text-[10px] text-muted-foreground">压缩</span>
						<span class="text-xs">{properties.compression}</span>
					</div>
				{/if}
			</div>
		</div>

		<!-- EXIF 信息 -->
		{#if properties.camera || properties.dateTaken}
			<div class="space-y-2">
				<h4 class="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
					<Calendar class="h-3 w-3" />
					EXIF 信息
				</h4>
				<div class="space-y-1.5 pl-5">
					{#if properties.dateTaken}
						<div class="flex justify-between items-center">
							<span class="text-[10px] text-muted-foreground">拍摄时间</span>
							<span class="text-xs">{properties.dateTaken}</span>
						</div>
					{/if}
					{#if properties.camera}
						<div class="flex flex-col gap-0.5">
							<span class="text-[10px] text-muted-foreground">相机</span>
							<span class="text-xs">{properties.camera}</span>
						</div>
					{/if}
					{#if properties.lens}
						<div class="flex flex-col gap-0.5">
							<span class="text-[10px] text-muted-foreground">镜头</span>
							<span class="text-xs">{properties.lens}</span>
						</div>
					{/if}
					{#if properties.iso}
						<div class="flex justify-between items-center">
							<span class="text-[10px] text-muted-foreground">ISO</span>
							<span class="text-xs font-mono">{properties.iso}</span>
						</div>
					{/if}
					{#if properties.shutterSpeed}
						<div class="flex justify-between items-center">
							<span class="text-[10px] text-muted-foreground">快门速度</span>
							<span class="text-xs font-mono">{properties.shutterSpeed}</span>
						</div>
					{/if}
					{#if properties.aperture}
						<div class="flex justify-between items-center">
							<span class="text-[10px] text-muted-foreground">光圈</span>
							<span class="text-xs font-mono">{properties.aperture}</span>
						</div>
					{/if}
					{#if properties.focalLength}
						<div class="flex justify-between items-center">
							<span class="text-[10px] text-muted-foreground">焦距</span>
							<span class="text-xs font-mono">{properties.focalLength}</span>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- 提示 -->
		<div class="pt-2 border-t">
			<p class="text-[10px] text-muted-foreground text-center">点击文本可复制到剪贴板</p>
		</div>
	</div>
</div>
