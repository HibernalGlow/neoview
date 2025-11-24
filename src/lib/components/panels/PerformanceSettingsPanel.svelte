<script lang="ts">
	import { Zap } from '@lucide/svelte';
	import {
		getPerformanceSettings,
		savePerformanceSettings,
		type PerformanceSettings
	} from '$lib/api/performance';
	import { Switch } from '$lib/components/ui/switch';
	import { Slider } from '$lib/components/ui/slider';
	import { Button } from '$lib/components/ui/button';

	// 使用独立字段，避免直接在对象属性上双向绑定造成复杂副作用
	let cacheMemorySize = $state(512);
	let preloadEnabled = $state(true);
	let preloadSize = $state(3);
	let gpuAcceleration = $state(true);
	let multiThreadedRendering = $state(true);
	let decodingThreads = $state(4);
	let thumbnailConcurrentLocal = $state(6);
	let thumbnailConcurrentArchive = $state(3);
	let thumbnailConcurrentVideo = $state(2);
	let enableVideoThumbnail = $state(false);

	// 从后端加载性能设置
	async function loadPerformanceSettings() {
		try {
			const loaded = await getPerformanceSettings();
			cacheMemorySize = loaded.cache_memory_size;
			preloadEnabled = loaded.preload_enabled;
			preloadSize = loaded.preload_size;
			gpuAcceleration = loaded.gpu_acceleration;
			multiThreadedRendering = loaded.multi_threaded_rendering;
			decodingThreads = loaded.decoding_threads;
			thumbnailConcurrentLocal = loaded.thumbnail_concurrent_local ?? 6;
			thumbnailConcurrentArchive = loaded.thumbnail_concurrent_archive ?? 3;
			thumbnailConcurrentVideo = loaded.thumbnail_concurrent_video ?? 2;
			enableVideoThumbnail = loaded.enable_video_thumbnail ?? false;
		} catch (err) {
			console.error('Failed to load performance settings:', err);
		}
	}

	loadPerformanceSettings();

	export async function saveSettings() {
		try {
			const settings: PerformanceSettings = {
				cache_memory_size: cacheMemorySize ?? 512,
				preload_enabled: preloadEnabled,
				preload_size: preloadSize ?? 3,
				gpu_acceleration: gpuAcceleration,
				multi_threaded_rendering: multiThreadedRendering,
				decoding_threads: decodingThreads ?? 4,
				thumbnail_concurrent_local: thumbnailConcurrentLocal ?? 6,
				thumbnail_concurrent_archive: thumbnailConcurrentArchive ?? 3,
				thumbnail_concurrent_video: thumbnailConcurrentVideo ?? 2,
				enable_video_thumbnail: enableVideoThumbnail
			};
			await savePerformanceSettings(settings);
		} catch (err) {
			console.error('Failed to save performance settings:', err);
			alert('保存性能设置失败');
		}
	}
</script>

<div class="space-y-6 p-6">
	<div class="space-y-2">
		<h3 class="flex items-center gap-2 text-lg font-semibold">
			<Zap class="h-5 w-5" />
			性能设置
		</h3>
		<p class="text-muted-foreground text-sm">优化应用性能和资源使用</p>
	</div>

	<div class="space-y-4">
		<!-- 缓存设置 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">缓存</h4>
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<span class="text-sm">图像缓存大小</span>
					<span class="text-muted-foreground text-xs">{cacheMemorySize} MB</span>
				</div>
				<Slider
					min={128}
					max={2048}
					step={128}
					type="single"
					value={[cacheMemorySize]}
					onValueChange={(vals) => {
						const v = vals[0];
						if (typeof v === 'number') cacheMemorySize = v;
					}}
					class="w-full"
				/>
			</div>
		</div>

		<!-- 预加载设置 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">预加载</h4>
			<label class="flex items-center gap-2">
				<Switch bind:checked={preloadEnabled} />
				<span class="text-sm">启用页面预加载</span>
			</label>
			{#if preloadEnabled}
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-sm">预加载页面数</span>
						<span class="text-muted-foreground text-xs">{preloadSize}</span>
					</div>
					<Slider
						min={1}
						max={20}
						step={1}
						type="single"
						value={[preloadSize]}
						onValueChange={(vals) => {
							const v = vals[0];
							if (typeof v === 'number') preloadSize = Math.round(v);
						}}
						class="w-full"
					/>
				</div>
			{/if}
		</div>

		<!-- GPU 加速 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">硬件加速</h4>
			<label class="flex items-center gap-2">
				<Switch bind:checked={gpuAcceleration} />
				<span class="text-sm">启用 GPU 渲染</span>
			</label>
			<label class="flex items-center gap-2">
				<Switch disabled />
				<span class="text-muted-foreground text-sm">使用硬件解码（暂未实现）</span>
			</label>
		</div>

		<!-- 线程设置 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">多线程</h4>
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<span class="text-sm">解码线程数</span>
					<span class="text-muted-foreground text-xs">{decodingThreads}</span>
				</div>
				<Slider
					min={1}
					max={16}
					step={1}
					type="single"
					value={[decodingThreads]}
					onValueChange={(vals) => {
						const v = vals[0];
						if (typeof v === 'number') decodingThreads = Math.round(v);
					}}
					class="w-full"
				/>
				<p class="text-muted-foreground text-xs">
					{multiThreadedRendering ? '多线程解码已启用' : '单线程解码'}
				</p>
			</div>
		</div>

		<!-- 缩略图设置 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">🖼️ 缩略图</h4>
			<div class="space-y-3">
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-sm">本地文件并发数</span>
						<span class="text-muted-foreground text-xs">{thumbnailConcurrentLocal}</span>
					</div>
					<Slider
						min={1}
						max={16}
						step={1}
						type="single"
						value={[thumbnailConcurrentLocal]}
						onValueChange={(vals) => {
							const v = vals[0];
							if (typeof v === 'number') thumbnailConcurrentLocal = Math.round(v);
						}}
						class="w-full"
					/>
				</div>
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-sm">压缩包并发数</span>
						<span class="text-muted-foreground text-xs">{thumbnailConcurrentArchive}</span>
					</div>
					<Slider
						min={1}
						max={8}
						step={1}
						type="single"
						value={[thumbnailConcurrentArchive]}
						onValueChange={(vals) => {
							const v = vals[0];
							if (typeof v === 'number') thumbnailConcurrentArchive = Math.round(v);
						}}
						class="w-full"
					/>
				</div>
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-sm">视频处理并发数</span>
						<span class="text-muted-foreground text-xs">{thumbnailConcurrentVideo}</span>
					</div>
					<Slider
						min={1}
						max={4}
						step={1}
						type="single"
						value={[thumbnailConcurrentVideo]}
						onValueChange={(vals) => {
							const v = vals[0];
							if (typeof v === 'number') thumbnailConcurrentVideo = Math.round(v);
						}}
						class="w-full"
					/>
				</div>
				<label class="flex items-center gap-2">
					<Switch bind:checked={enableVideoThumbnail} />
					<span class="text-sm">启用视频缩略图</span>
				</label>
			</div>
		</div>

		<!-- 操作区（底部固定） -->
		<div
			class="sticky bottom-0 flex justify-end pt-2 border-t mt-2 border-border/60 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80"
		>
			<Button variant="outline" size="sm" onclick={saveSettings}>
				保存性能设置（需重启）
			</Button>
		</div>
	</div>
</div>
