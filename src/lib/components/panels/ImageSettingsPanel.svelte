<script lang="ts">
	import { Palette, Image, Video, MousePointer, Check, X, RefreshCw } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import * as Tabs from '$lib/components/ui/tabs';

	let activeTab = $state('image');

	let currentSettings = $state(settingsManager.getSettings());

	settingsManager.addListener((s) => {
		currentSettings = s;
	});

	function toggleFormat(fmt: string) {
		const formats = new Set(currentSettings.image.supportedFormats);
		if (formats.has(fmt)) {
			formats.delete(fmt);
		} else {
			formats.add(fmt);
		}
		settingsManager.updateNestedSettings('image', {
			supportedFormats: Array.from(formats)
		});
	}

	let testStatus = $state<'idle' | 'testing' | 'supported' | 'unsupported'>('idle');

	async function testJxlSupport() {
		testStatus = 'testing';
		const jxl = new Image();
		// 一个最小的合法 JXL (1x1 无损白点)
		jxl.src = 'data:image/jxl;base64,/xl/AAAABQAAABAAAAEBAQA=';
		
		try {
			await new Promise((resolve, reject) => {
				jxl.onload = () => resolve(true);
				jxl.onerror = (e) => reject(e);
				// 3秒超时
				setTimeout(() => reject(new Error('Timeout')), 3000);
			});
			testStatus = 'supported';
		} catch (e) {
			console.error('JXL test failed:', e);
			testStatus = 'unsupported';
		}
	}
</script>

<div class="space-y-4 p-6">
	<div class="space-y-2">
		<h3 class="flex items-center gap-2 text-lg font-semibold">
			<Palette class="h-5 w-5" />
			影像综合管理
		</h3>
		<p class="text-muted-foreground text-sm">配置全局图片和视频的加载与播放行为</p>
	</div>

	<Tabs.Root bind:value={activeTab} class="w-full">
		<Tabs.List class="grid w-full grid-cols-3">
			<Tabs.Trigger value="image" class="gap-1.5 text-xs">
				<Image class="h-3.5 w-3.5" />
				图片
			</Tabs.Trigger>
			<Tabs.Trigger value="video" class="gap-1.5 text-xs">
				<Video class="h-3.5 w-3.5" />
				视频
			</Tabs.Trigger>
			<Tabs.Trigger value="interaction" class="gap-1.5 text-xs">
				<MousePointer class="h-3.5 w-3.5" />
				交互
			</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="image" class="mt-4 space-y-4">
		<!-- 动画图片（GIF / APNG）自动播放 -->
		<div class="space-y-3">
			<div class="flex items-center justify-between gap-2">
				<Label class="text-sm">自动播放 GIF / APNG</Label>
				<Switch
					checked={currentSettings.image.autoPlayAnimatedImages}
					onCheckedChange={(checked) =>
						settingsManager.updateNestedSettings('image', {
							autoPlayAnimatedImages: !!checked
						})}
				/>
			</div>
			<p class="text-muted-foreground text-xs">
				关闭后，GIF / APNG 等动图将以静态首帧显示，需手动触发播放（实现后）。
			</p>
		</div>

		<!-- 支持的图片格式 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">支持的图片格式</h4>
			<div class="grid gap-2 sm:grid-cols-2">
				<label class="flex items-center gap-2 text-sm">
					<Checkbox
						checked={currentSettings.image.supportedFormats.includes('jpg')}
						on:click={() => toggleFormat('jpg')}
						aria-label="JPG/JPEG"
					/>
					<span>JPG / JPEG</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox
						checked={currentSettings.image.supportedFormats.includes('webp')}
						on:click={() => toggleFormat('webp')}
						aria-label="WebP"
					/>
					<span>WebP</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox
						checked={currentSettings.image.supportedFormats.includes('jxl')}
						on:click={() => toggleFormat('jxl')}
						aria-label="JXL"
					/>
					<span>JXL</span>
				</label>
			</div>
			<p class="text-muted-foreground text-xs">
				控制 NeoView 默认识别为图片的文件扩展名。
			</p>
		</div>

		<!-- 原生 JXL 解码 -->
		<div class="space-y-3">
			<div class="flex items-center justify-between gap-2">
				<div class="flex flex-col gap-0.5">
					<Label class="text-sm">原生 JXL 解码</Label>
					<div class="mt-1 flex items-center gap-2">
						<Button 
							variant="outline" 
							size="sm" 
							class="h-7 px-2 text-[10px]" 
							onclick={testJxlSupport}
							disabled={testStatus === 'testing'}
						>
							{#if testStatus === 'testing'}
								<RefreshCw class="mr-1 h-3 w-3 animate-spin" />
								检测中...
							{:else}
								检测浏览器支持
							{/if}
						</Button>
						
						{#if testStatus === 'supported'}
							<span class="flex items-center gap-1 text-[10px] text-green-500">
								<Check class="h-3 w-3" /> 支持原生解析
							</span>
						{:else if testStatus === 'unsupported'}
							<span class="flex items-center gap-1 text-[10px] text-destructive">
								<X class="h-3 w-3" /> 浏览器不支持
							</span>
						{/if}
					</div>
				</div>
				<Switch
					checked={currentSettings.image.nativeJxl ?? false}
					onCheckedChange={async (checked) => {
						const val = !!checked;
						settingsManager.updateNestedSettings('image', { nativeJxl: val });
						try {
							const { invoke } = await import('@tauri-apps/api/core');
							await invoke('update_startup_config_field', {
								field: 'nativeJxl',
								value: val ? 'true' : null
							});
						} catch (e) {
							console.warn('更新启动配置失败:', e);
						}
					}}
				/>
			</div>
			<p class="text-muted-foreground text-xs">
				使用 WebView2 (Chromium 145+) 内置的 JXL 解码器直接渲染，跳过 Rust 端的 JXL→PNG 转码，性能更优。<br/>
				<span class="font-medium text-yellow-500">⚠ 需要 WebView2 Runtime ≥ 145 / 重启后生效</span>
			</p>
		</div>

		</Tabs.Content>

		<Tabs.Content value="video" class="mt-4 space-y-4">
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">支持的视频格式</h4>
			<input
				type="text"
				class="w-full rounded border bg-background px-2 py-1 text-sm"
				placeholder="mp4, webm, mkv, flv, ..."
				value={currentSettings.image.videoFormats?.join(', ') ?? ''}
				onchange={(event) => {
					const target = event.target as HTMLInputElement;
					const raw = target.value || '';
					const parts = raw
						.split(',')
						.map((s) => s.trim())
						.filter((s) => s.length > 0);
					settingsManager.updateNestedSettings('image', {
						videoFormats: parts
					});
				}}
			/>
			<p class="text-muted-foreground text-xs">
				使用逗号分隔扩展名（不区分大小写，可选带或不带点），用于判断文件是否作为视频打开。
			</p>
		</div>

		<!-- 视频倍速范围 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">视频倍速范围</h4>
			<div class="space-y-2">
				<div class="flex items-center justify-between gap-2">
					<Label class="text-sm">最小倍速</Label>
					<input
						type="number"
						min="0.05"
						step="0.05"
						value={currentSettings.image.videoMinPlaybackRate}
						class="w-24 rounded border bg-background px-2 py-1 text-right text-sm"
						onchange={(event) => {
							const target = event.target as HTMLInputElement;
							const raw = parseFloat(target.value);
							const max = currentSettings.image.videoMaxPlaybackRate;
							const value = Number.isNaN(raw) ? 0.25 : raw;
							const clamped = Math.max(0.05, Math.min(value, max));
							settingsManager.updateNestedSettings('image', {
								videoMinPlaybackRate: clamped
							});
						}}
					/>
				</div>
				<div class="flex items-center justify-between gap-2">
					<Label class="text-sm">最大倍速</Label>
					<input
						type="number"
						min={currentSettings.image.videoMinPlaybackRate}
						step="0.25"
						value={currentSettings.image.videoMaxPlaybackRate}
						class="w-24 rounded border bg-background px-2 py-1 text-right text-sm"
						onchange={(event) => {
							const target = event.target as HTMLInputElement;
							const raw = parseFloat(target.value);
							const min = currentSettings.image.videoMinPlaybackRate;
							const value = Number.isNaN(raw) ? 16 : raw;
							const clamped = Math.max(min, Math.min(value, 64));
							settingsManager.updateNestedSettings('image', {
								videoMaxPlaybackRate: clamped
							});
						}}
					/>
				</div>
				<div class="flex items-center justify-between gap-2">
					<Label class="text-sm">调节步长</Label>
					<input
						type="number"
						min="0.01"
						step="0.01"
						value={currentSettings.image.videoPlaybackRateStep}
						class="w-24 rounded border bg-background px-2 py-1 text-right text-sm"
						onchange={(event) => {
							const target = event.target as HTMLInputElement;
							const raw = parseFloat(target.value);
							const value = Number.isNaN(raw) ? 0.25 : raw;
							const clamped = Math.max(0.01, Math.min(value, 4));
							settingsManager.updateNestedSettings('image', {
								videoPlaybackRateStep: clamped
							});
						}}
					/>
				</div>
			</div>
		</div>

		</Tabs.Content>

		<Tabs.Content value="interaction" class="mt-4 space-y-4">
		<!-- 悬停滚动倍率 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">悬停滚动倍率</h4>
			<div class="flex items-center justify-between gap-2">
				<Label class="text-sm">滚动速度</Label>
				<input
					type="number"
					min="0.5"
					max="10"
					step="0.5"
					value={currentSettings.image.hoverScrollSpeed ?? 2.0}
					class="w-24 rounded border bg-background px-2 py-1 text-right text-sm"
					onchange={(event) => {
						const target = event.target as HTMLInputElement;
						const raw = parseFloat(target.value);
						const value = Number.isNaN(raw) ? 2.0 : raw;
						const clamped = Math.max(0.5, Math.min(value, 10));
						settingsManager.updateNestedSettings('image', {
							hoverScrollSpeed: clamped
						});
					}}
				/>
			</div>
			<p class="text-muted-foreground text-xs">
				控制鼠标悬停滚动的速度倍率（0.5-10），数值越大滚动越快。
			</p>
		</div>
		</Tabs.Content>
	</Tabs.Root>
</div>
