<script lang="ts">
	import { Zap } from '@lucide/svelte';
	import {
		getPerformanceSettings,
		savePerformanceSettings,
		type PerformanceSettings
	} from '$lib/api/performance';

	let performanceSettings = $state<PerformanceSettings>({
		cache_memory_size: 512,
		preload_enabled: true,
		preload_size: 3,
		gpu_acceleration: true,
		multi_threaded_rendering: true,
		decoding_threads: 4
	});

	// 加载性能设置
	async function loadPerformanceSettings() {
		try {
			performanceSettings = await getPerformanceSettings();
		} catch (err) {
			console.error('Failed to load performance settings:', err);
		}
	}

	// 组件挂载时加载性能设置
	loadPerformanceSettings();

	export async function saveSettings() {
		try {
			await savePerformanceSettings(performanceSettings);
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
					<span class="text-muted-foreground text-xs"
						>{performanceSettings.cache_memory_size} MB</span
					>
				</div>
				<input
					type="range"
					min="128"
					max="2048"
					step="128"
					bind:value={performanceSettings.cache_memory_size}
					class="w-full"
					aria-label="图像缓存大小"
				/>
			</div>
		</div>

		<!-- 预加载设置 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">预加载</h4>
			<label class="flex items-center gap-2">
				<input type="checkbox" class="rounded" bind:checked={performanceSettings.preload_enabled} />
				<span class="text-sm">启用页面预加载</span>
			</label>
			{#if performanceSettings.preload_enabled}
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-sm">预加载页面数</span>
						<span class="text-muted-foreground text-xs">{performanceSettings.preload_size}</span>
					</div>
					<input
						type="range"
						min="1"
						max="20"
						bind:value={performanceSettings.preload_size}
						class="w-full"
						aria-label="预加载页面数"
					/>
				</div>
			{/if}
		</div>

		<!-- GPU 加速 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">硬件加速</h4>
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					class="rounded"
					bind:checked={performanceSettings.gpu_acceleration}
				/>
				<span class="text-sm">启用 GPU 渲染</span>
			</label>
			<label class="flex items-center gap-2">
				<input type="checkbox" class="rounded" disabled />
				<span class="text-muted-foreground text-sm">使用硬件解码（暂未实现）</span>
			</label>
		</div>

		<!-- 线程设置 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">多线程</h4>
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<span class="text-sm">解码线程数</span>
					<span class="text-muted-foreground text-xs">{performanceSettings.decoding_threads}</span>
				</div>
				<input
					type="range"
					min="1"
					max="16"
					bind:value={performanceSettings.decoding_threads}
					class="w-full"
				/>
				<p class="text-muted-foreground text-xs">
					{performanceSettings.multi_threaded_rendering ? '多线程解码已启用' : '单线程解码'}
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
						<span class="text-muted-foreground text-xs"
							>{performanceSettings.thumbnail_concurrent_local || 6}</span
						>
					</div>
					<input
						type="range"
						min="1"
						max="16"
						bind:value={performanceSettings.thumbnail_concurrent_local}
						class="w-full"
						aria-label="本地文件并发数"
					/>
				</div>
				<div class="space-y-2">
					<label class="flex items-center justify-between">
						<span class="text-sm">压缩包并发数</span>
						<span class="text-muted-foreground text-xs"
							>{performanceSettings.thumbnail_concurrent_archive || 3}</span
						>
					</label>
					<input
						type="range"
						min="1"
						max="8"
						bind:value={performanceSettings.thumbnail_concurrent_archive}
						class="w-full"
						aria-label="压缩包并发数"
					/>
				</div>
				<div class="space-y-2">
					<label class="flex items-center justify-between">
						<span class="text-sm">视频处理并发数</span>
						<span class="text-muted-foreground text-xs"
							>{performanceSettings.thumbnail_concurrent_video || 2}</span
						>
					</label>
					<input
						type="range"
						min="1"
						max="4"
						bind:value={performanceSettings.thumbnail_concurrent_video}
						class="w-full"
						aria-label="视频处理并发数"
					/>
				</div>
				<label class="flex items-center gap-2">
					<input
						type="checkbox"
						class="rounded"
						bind:checked={performanceSettings.enable_video_thumbnail}
					/>
					<span class="text-sm">启用视频缩略图</span>
				</label>
			</div>
		</div>
	</div>
</div>
