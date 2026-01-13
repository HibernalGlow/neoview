<script lang="ts">
	import { Zap, HardDrive, Cpu, Image } from '@lucide/svelte';
	import {
		getPerformanceSettings,
		savePerformanceSettings,
		type PerformanceSettings
	} from '$lib/api/performance';
	import { Switch } from '$lib/components/ui/switch';
	import { Slider } from '$lib/components/ui/slider';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import { showErrorToast } from '$lib/utils/toast';

	let activeTab = $state('cache');

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
			showErrorToast('保存性能设置失败');
		}
	}
</script>

<div class="space-y-3 p-4">
	<div class="space-y-1">
		<h3 class="flex items-center gap-2 text-base font-bold">
			<Zap class="h-4.5 w-4.5" />
			性能设置
		</h3>
		<p class="text-muted-foreground text-[11px]">优化应用性能和资源使用</p>
	</div>

	<Tabs.Root bind:value={activeTab} class="w-full">
		<Tabs.List class="grid h-8 w-full grid-cols-3 p-1">
			<Tabs.Trigger value="cache" class="gap-1.5 text-[10px] py-1">
				<HardDrive class="h-3 w-3" />
				缓存
			</Tabs.Trigger>
			<Tabs.Trigger value="hardware" class="gap-1.5 text-[10px] py-1">
				<Cpu class="h-3 w-3" />
				硬件
			</Tabs.Trigger>
			<Tabs.Trigger value="thumbnail" class="gap-1.5 text-[10px] py-1">
				<Image class="h-3 w-3" />
				缩略图
			</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="cache" class="mt-3 space-y-3">
		<!-- 缓存设置 -->
		<div class="space-y-1.5">
			<h4 class="text-xs font-bold">缓存</h4>
			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<span class="text-xs">图像缓存大小</span>
					<span class="text-muted-foreground text-[10px]">{cacheMemorySize} MB</span>
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
					class="w-full py-2"
				/>
			</div>
		</div>

		<!-- 预加载设置 -->
		<div class="space-y-1.5">
			<h4 class="text-xs font-bold">预加载</h4>
			<label class="flex items-center gap-2">
				<Switch bind:checked={preloadEnabled} class="scale-75" />
				<span class="text-xs">启用页面预加载</span>
			</label>
			{#if preloadEnabled}
				<div class="space-y-1.5">
					<div class="flex items-center justify-between">
						<span class="text-xs">预加载页面数</span>
						<span class="text-muted-foreground text-[10px]">{preloadSize}</span>
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
						class="w-full py-2"
					/>
				</div>
			{/if}
		</div>

		</Tabs.Content>

		<Tabs.Content value="hardware" class="mt-3 space-y-3">
		<!-- GPU 加速 -->
		<div class="space-y-1.5">
			<h4 class="text-xs font-bold">硬件加速</h4>
			<label class="flex items-center gap-2">
				<Switch bind:checked={gpuAcceleration} class="scale-75" />
				<span class="text-xs">启用 GPU 渲染</span>
			</label>
			<label class="flex items-center gap-2">
				<Switch disabled class="scale-75" />
				<span class="text-muted-foreground text-xs">使用硬件解码 (待开发)</span>
			</label>
		</div>

		<!-- 线程设置 -->
		<div class="space-y-1.5">
			<h4 class="text-xs font-bold">多线程</h4>
			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<span class="text-xs">解码线程数</span>
					<span class="text-muted-foreground text-[10px]">{decodingThreads}</span>
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
					class="w-full py-2"
				/>
			</div>
		</div>

		</Tabs.Content>

		<Tabs.Content value="thumbnail" class="mt-3 space-y-3">
		<!-- 缩略图设置 -->
		<div class="space-y-1.5">
			<h4 class="text-xs font-bold">🖼️ 缩略图</h4>
			<div class="space-y-2.5">
				<div class="space-y-1.5">
					<div class="flex items-center justify-between">
						<span class="text-xs">本地文件并发数</span>
						<span class="text-muted-foreground text-[10px]">{thumbnailConcurrentLocal}</span>
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
						class="w-full py-2"
					/>
				</div>
				<div class="space-y-1.5">
					<div class="flex items-center justify-between">
						<span class="text-xs">压缩包并发数</span>
						<span class="text-muted-foreground text-[10px]">{thumbnailConcurrentArchive}</span>
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
						class="w-full py-2"
					/>
				</div>
				<div class="space-y-1.5">
					<div class="flex items-center justify-between">
						<span class="text-xs">视频处理并发数</span>
						<span class="text-muted-foreground text-[10px]">{thumbnailConcurrentVideo}</span>
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
						class="w-full py-2"
					/>
				</div>
				<label class="flex items-center gap-2">
					<Switch bind:checked={enableVideoThumbnail} class="scale-75" />
					<span class="text-xs">启用视频缩略图</span>
				</label>
			</div>
		</div>

		</Tabs.Content>
	</Tabs.Root>

	<!-- 操作区 -->
	<div class="flex items-center justify-between pt-3 border-t border-border/40">
		<p class="text-xs text-muted-foreground">部分设置需重启应用后生效</p>
		<Button variant="default" size="sm" onclick={saveSettings} class="gap-1.5">
			<Zap class="h-3.5 w-3.5" />
			保存设置
		</Button>
	</div>
</div>
