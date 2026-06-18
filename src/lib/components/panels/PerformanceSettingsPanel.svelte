<script lang="ts">
	import { Zap, HardDrive, Cpu, Image, Save } from '@lucide/svelte';
	import {
		getPerformanceSettings,
		savePerformanceSettings,
		type PerformanceSettings
	} from '$lib/api/performance';
	import { Switch } from '$lib/components/ui/switch';
	import { Slider } from '$lib/components/ui/slider';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import { showErrorToast, showSuccessToast } from '$lib/utils/toast';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { historySettingsStore } from '$lib/stores/historySettings.svelte';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';

	let activeTab = $state('cache');

	// 使用独立字段，避免直接在对象属性上双向绑定造成复杂副作用
	// 初始化时直接读取当前设置，避免 $effect 在 mount 时使用默认值覆盖已保存的设置
	// Get current settings first
	const currentSettings = settingsManager.getSettings();

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

	let archiveTempfileThresholdMB = $state(
		currentSettings.performance.archiveTempfileThresholdMB ?? 500
	);
	let directUrlThresholdMB = $state(currentSettings.performance.directUrlThresholdMB ?? 0);
	let protocolDirectEnabled = $state(currentSettings.performance.protocolDirectEnabled ?? true);

	// 从后端加载性能设置
	async function loadPerformanceSettings() {
		try {
			const loaded = await getPerformanceSettings();
			preloadEnabled = loaded.preload_enabled;
			gpuAcceleration = loaded.gpu_acceleration;
			multiThreadedRendering = loaded.multi_threaded_rendering;
			enableVideoThumbnail = loaded.enable_video_thumbnail ?? false;

			cacheMemorySize = loaded.cache_memory_size;
			preloadSize = loaded.preload_size;
			decodingThreads = loaded.decoding_threads;
			thumbnailConcurrentLocal = loaded.thumbnail_concurrent_local ?? 6;
			thumbnailConcurrentArchive = loaded.thumbnail_concurrent_archive ?? 3;
			thumbnailConcurrentVideo = loaded.thumbnail_concurrent_video ?? 2;

			const s = settingsManager.getSettings();
			archiveTempfileThresholdMB =
				s.performance.archiveTempfileThresholdMB ?? loaded.archive_tempfile_threshold_mb ?? 500;
			directUrlThresholdMB =
				s.performance.directUrlThresholdMB ?? loaded.direct_url_threshold_mb ?? 0;
			protocolDirectEnabled = s.performance.protocolDirectEnabled ?? true;
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
				enable_video_thumbnail: enableVideoThumbnail,
				archive_tempfile_threshold_mb: archiveTempfileThresholdMB,
				direct_url_threshold_mb: directUrlThresholdMB
			};
			settingsManager.updateNestedSettings('performance', {
				archiveTempfileThresholdMB: archiveTempfileThresholdMB,
				directUrlThresholdMB: directUrlThresholdMB,
				protocolDirectEnabled: protocolDirectEnabled
			});

			// 先持久化到前端设置，避免“立即重启”导致后续代码来不及执行
			await savePerformanceSettings(settings);
			showSuccessToast('性能设置已保存');
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
		<Tabs.List class="grid h-8 w-full grid-cols-4 p-1">
			<Tabs.Trigger value="cache" class="gap-1.5 py-1 text-[10px]">
				<HardDrive class="h-3 w-3" />
				缓存
			</Tabs.Trigger>
			<Tabs.Trigger value="hardware" class="gap-1.5 py-1 text-[10px]">
				<Cpu class="h-3 w-3" />
				硬件
			</Tabs.Trigger>
			<Tabs.Trigger value="thumbnail" class="gap-1.5 py-1 text-[10px]">
				<Image class="h-3 w-3" />
				缩略图
			</Tabs.Trigger>
			<Tabs.Trigger value="storage" class="gap-1.5 py-1 text-[10px]">
				<Save class="h-3 w-3" />
				存储
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
						bind:value={cacheMemorySize}
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
							bind:value={preloadSize}
							class="w-full py-2"
						/>
					</div>
				{/if}
			</div>

			<!-- 资源加载阈值 -->
			<div class="border-border/40 space-y-1.5 border-t pt-2">
				<h3 class="flex items-center gap-1.5 text-xs font-bold">
					<Zap class="h-3 w-3 text-yellow-500" />
					加载策略
				</h3>
				<p class="text-muted-foreground text-[10px]">控制内存占用与加载速度的平衡</p>

				<div
					class="border-border/50 mt-2 flex items-center justify-between rounded-sm border px-2 py-1.5"
				>
					<div class="space-y-0.5">
						<div class="text-xs">启用协议直连</div>
						<div class="text-muted-foreground text-[9px] italic opacity-70">
							关闭后直接走 IPC，不进行协议探测与直连判断。
						</div>
					</div>
					<Switch bind:checked={protocolDirectEnabled} class="scale-75" />
				</div>

				<div class="mt-2 space-y-3">
					<!-- 后端解压阈值 -->
					<div class="space-y-1.5">
						<div class="flex items-center justify-between">
							<span class="text-xs">压缩包提取阈值</span>
							<span class="text-muted-foreground text-[10px]">{archiveTempfileThresholdMB} MB</span>
						</div>
						<Slider
							min={0}
							max={2000}
							step={100}
							type="single"
							bind:value={archiveTempfileThresholdMB}
							class="w-full py-2"
						/>
						<p class="text-muted-foreground text-[9px] leading-tight italic opacity-70">
							超过此大小的压缩包内容将提取为临时文件而非驻留内存。
						</p>
					</div>

					<!-- 协议直连阈值 -->
					<div class="space-y-1.5">
						<div class="flex items-center justify-between">
							<span class="text-xs">IPC 回退阈值</span>
							<span class="text-muted-foreground text-[10px]"
								>{directUrlThresholdMB === 0 ? '始终直连' : directUrlThresholdMB + ' MB'}</span
							>
						</div>
						<Slider
							min={0}
							max={500}
							step={10}
							type="single"
							bind:value={directUrlThresholdMB}
							class="w-full py-2"
						/>
						<p class="text-muted-foreground text-[9px] leading-tight italic opacity-70">
							图片超过此大小时使用 neoview:// 协议直连（0 = 全部直连）。设大可通过 IPC 加载小文件。
						</p>
					</div>
				</div>
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
						bind:value={decodingThreads}
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
							bind:value={thumbnailConcurrentLocal}
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
							bind:value={thumbnailConcurrentArchive}
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
							bind:value={thumbnailConcurrentVideo}
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

		<Tabs.Content value="storage" class="mt-3 space-y-4">
			<div class="border-border/40 space-y-4 border-t pt-2">
				<div class="flex flex-col gap-1 px-1">
					<h4 class="flex items-center gap-2 text-xs font-bold">
						<Save class="h-3.5 w-3.5" />
						数据保存限制
					</h4>
					<p class="text-muted-foreground text-[10px]">控制历史记录和书签的最大保存数量。</p>
				</div>

				<div class="grid gap-4 px-1">
					<div class="space-y-1.5">
						<Label class="text-[11px]">历史记录保存上限</Label>
						<div class="flex items-center gap-3">
							<Input
								type="number"
								min="0"
								class="h-8 w-28 rounded-lg text-[11px]"
								value={historySettingsStore.maxHistorySize}
								oninput={(e) =>
									historySettingsStore.setMaxHistorySize(parseInt(e.currentTarget.value) || 0)}
							/>
							<span class="text-muted-foreground text-[10px]">
								设为 <code class="bg-muted text-primary rounded px-1">0</code> 无限制
							</span>
						</div>
					</div>

					<div class="space-y-1.5">
						<Label class="text-[11px]">书签保存上限</Label>
						<div class="flex items-center gap-3">
							<Input
								type="number"
								min="0"
								class="h-8 w-28 rounded-lg text-[11px]"
								value={historySettingsStore.maxBookmarkSize}
								oninput={(e) =>
									historySettingsStore.setMaxBookmarkSize(parseInt(e.currentTarget.value) || 0)}
							/>
							<span class="text-muted-foreground text-[10px]">
								设为 <code class="bg-muted text-primary rounded px-1">0</code> 无限制
							</span>
						</div>
					</div>
				</div>

				<div class="mt-2 flex gap-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5 p-2.5">
					<div class="h-fit rounded-md bg-blue-500/10 p-1 text-blue-500">
						<Save class="h-3.5 w-3.5" />
					</div>
					<div class="space-y-0.5">
						<h5 class="text-[10px] font-bold tracking-wider text-blue-500 uppercase">提示</h5>
						<p class="text-muted-foreground text-[9px] leading-relaxed">
							当新条目超过限制时，旧的记录将被自动清理。
						</p>
					</div>
				</div>
			</div>
		</Tabs.Content>
	</Tabs.Root>

	<!-- 操作区 -->
	<div class="border-border/40 flex items-center justify-between border-t pt-3">
		<p class="text-muted-foreground text-xs">部分设置需重启应用后生效</p>
		<Button variant="default" size="sm" onclick={saveSettings} class="gap-1.5">
			<Zap class="h-3.5 w-3.5" />
			保存设置
		</Button>
	</div>
</div>
