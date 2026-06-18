<script lang="ts">
	/**
	 * 图像裁剪设置卡片
	 *
	 * 参考 NeeView ImageTrimConfig + OpenComic readingImageClip
	 * 提供四方向百分比裁剪、联动锁定、自动裁剪（去黑边/白边）
	 */
	import { onMount, onDestroy } from 'svelte';
	import {
		imageTrimStore,
		type ImageTrimSettings,
		type AutoTrimTarget
	} from '$lib/stores/imageTrimStore.svelte';
	import { RotateCcw, Link, Unlink, Wand2, Minus, Square } from '@lucide/svelte';

	let settings = $state<ImageTrimSettings | null>(null);
	let isAutoDetecting = $state(false);
	let autoDetectMessage = $state('');
	let unsubscribe: (() => void) | null = null;

	onMount(() => {
		unsubscribe = imageTrimStore.subscribe((s) => {
			settings = s;
		});
	});

	onDestroy(() => {
		unsubscribe?.();
	});

	function toggleEnabled() {
		imageTrimStore.toggleEnabled();
	}

	function handleTop(e: Event) {
		imageTrimStore.setTop(Number((e.target as HTMLInputElement).value));
	}

	function handleBottom(e: Event) {
		imageTrimStore.setBottom(Number((e.target as HTMLInputElement).value));
	}

	function handleLeft(e: Event) {
		imageTrimStore.setLeft(Number((e.target as HTMLInputElement).value));
	}

	function handleRight(e: Event) {
		imageTrimStore.setRight(Number((e.target as HTMLInputElement).value));
	}

	function handleThreshold(e: Event) {
		imageTrimStore.setAutoTrimThreshold(Number((e.target as HTMLInputElement).value));
	}

	function handleTargetChange(e: Event) {
		imageTrimStore.setAutoTrimTarget((e.target as HTMLSelectElement).value as AutoTrimTarget);
	}

	async function runAutoDetect() {
		isAutoDetecting = true;
		autoDetectMessage = '';
		try {
			// 获取当前显示图片的 URL
			const currentImg = document.querySelector<HTMLImageElement>(
				'[data-layer="CurrentFrameLayer"] img.frame-image, [data-layer="CurrentFrameLayer"] img'
			);
			if (!currentImg?.src) {
				autoDetectMessage = '未找到当前图片';
				return;
			}
			const result = await imageTrimStore.autoDetectAndApply(currentImg.src);
			if (result.top === 0 && result.bottom === 0 && result.left === 0 && result.right === 0) {
				autoDetectMessage = '未检测到明显边框';
			} else {
				autoDetectMessage = `检测完成: ↑${result.top.toFixed(1)}% ↓${result.bottom.toFixed(1)}% ←${result.left.toFixed(1)}% →${result.right.toFixed(1)}%`;
			}
		} catch {
			autoDetectMessage = '检测失败';
		} finally {
			isAutoDetecting = false;
		}
	}

	async function presetBlack() {
		isAutoDetecting = true;
		autoDetectMessage = '';
		try {
			const currentImg = document.querySelector<HTMLImageElement>(
				'[data-layer="CurrentFrameLayer"] img.frame-image, [data-layer="CurrentFrameLayer"] img'
			);
			if (!currentImg?.src) {
				autoDetectMessage = '未找到当前图片';
				return;
			}
			await imageTrimStore.presetBlackBorder(currentImg.src);
			autoDetectMessage = '已应用去黑边';
		} catch {
			autoDetectMessage = '检测失败';
		} finally {
			isAutoDetecting = false;
		}
	}

	async function presetWhite() {
		isAutoDetecting = true;
		autoDetectMessage = '';
		try {
			const currentImg = document.querySelector<HTMLImageElement>(
				'[data-layer="CurrentFrameLayer"] img.frame-image, [data-layer="CurrentFrameLayer"] img'
			);
			if (!currentImg?.src) {
				autoDetectMessage = '未找到当前图片';
				return;
			}
			await imageTrimStore.presetWhiteBorder(currentImg.src);
			autoDetectMessage = '已应用去白边';
		} catch {
			autoDetectMessage = '检测失败';
		} finally {
			isAutoDetecting = false;
		}
	}

	function resetAll() {
		imageTrimStore.reset();
		autoDetectMessage = '';
	}

	/** 是否有实际裁剪值 */
	let hasValues = $derived(
		settings
			? settings.top > 0 || settings.bottom > 0 || settings.left > 0 || settings.right > 0
			: false
	);
</script>

{#if settings}
	<div class="space-y-3 text-sm">
		<!-- 开关 + 重置 -->
		<div class="flex items-center justify-between">
			<label class="flex cursor-pointer items-center gap-2">
				<input
					type="checkbox"
					checked={settings.enabled}
					onchange={toggleEnabled}
					class="border-border h-4 w-4 rounded"
				/>
				<span>图像裁剪</span>
			</label>
			<button
				type="button"
				onclick={resetAll}
				class="hover:bg-accent rounded p-1"
				title="重置所有裁剪"
			>
				<RotateCcw class="h-4 w-4" />
			</button>
		</div>

		{#if settings.enabled}
			<!-- 上裁剪 -->
			<div class="space-y-1">
				<div class="flex justify-between text-xs">
					<div class="flex items-center gap-1">
						<span class="text-muted-foreground">上</span>
						<button
							type="button"
							onclick={() => imageTrimStore.toggleLinkVertical()}
							class="hover:bg-accent rounded p-0.5"
							title={settings.linkVertical ? '取消上下联动' : '上下联动'}
						>
							{#if settings.linkVertical}
								<Link class="text-primary h-3 w-3" />
							{:else}
								<Unlink class="text-muted-foreground h-3 w-3" />
							{/if}
						</button>
					</div>
					<span>{settings.top}%</span>
				</div>
				<input
					type="range"
					min="0"
					max="45"
					step="0.5"
					value={settings.top}
					oninput={handleTop}
					class="accent-primary h-1 w-full"
				/>
			</div>

			<!-- 下裁剪 -->
			<div class="space-y-1">
				<div class="flex justify-between text-xs">
					<span class="text-muted-foreground">下</span>
					<span>{settings.bottom}%</span>
				</div>
				<input
					type="range"
					min="0"
					max="45"
					step="0.5"
					value={settings.bottom}
					oninput={handleBottom}
					class="accent-primary h-1 w-full"
				/>
			</div>

			<!-- 左裁剪 -->
			<div class="space-y-1">
				<div class="flex justify-between text-xs">
					<div class="flex items-center gap-1">
						<span class="text-muted-foreground">左</span>
						<button
							type="button"
							onclick={() => imageTrimStore.toggleLinkHorizontal()}
							class="hover:bg-accent rounded p-0.5"
							title={settings.linkHorizontal ? '取消左右联动' : '左右联动'}
						>
							{#if settings.linkHorizontal}
								<Link class="text-primary h-3 w-3" />
							{:else}
								<Unlink class="text-muted-foreground h-3 w-3" />
							{/if}
						</button>
					</div>
					<span>{settings.left}%</span>
				</div>
				<input
					type="range"
					min="0"
					max="45"
					step="0.5"
					value={settings.left}
					oninput={handleLeft}
					class="accent-primary h-1 w-full"
				/>
			</div>

			<!-- 右裁剪 -->
			<div class="space-y-1">
				<div class="flex justify-between text-xs">
					<span class="text-muted-foreground">右</span>
					<span>{settings.right}%</span>
				</div>
				<input
					type="range"
					min="0"
					max="45"
					step="0.5"
					value={settings.right}
					oninput={handleRight}
					class="accent-primary h-1 w-full"
				/>
			</div>

			<!-- 裁剪预览指示 -->
			{#if hasValues}
				<div
					class="border-border bg-muted/30 relative aspect-3/4 w-full overflow-hidden rounded border"
				>
					<!-- 原始区域 -->
					<div class="bg-muted/20 absolute inset-0"></div>
					<!-- 裁剪后的有效区域 -->
					<div
						class="bg-primary/10 border-primary/30 absolute rounded-sm border"
						style="top: {settings.top}%; bottom: {settings.bottom}%; left: {settings.left}%; right: {settings.right}%;"
					></div>
					<!-- 标注 -->
					<div class="absolute inset-0 flex items-center justify-center">
						<span class="text-muted-foreground/60 text-[10px]">
							{(100 - settings.top - settings.bottom).toFixed(1)}% × {(
								100 -
								settings.left -
								settings.right
							).toFixed(1)}%
						</span>
					</div>
				</div>
			{/if}

			<!-- 分隔线 -->
			<div class="border-border border-t"></div>

			<!-- 自动裁剪 -->
			<div class="space-y-2">
				<span class="text-muted-foreground text-xs font-medium">自动裁剪</span>

				<div class="flex gap-1">
					<button
						type="button"
						onclick={runAutoDetect}
						disabled={isAutoDetecting}
						class="bg-primary/10 hover:bg-primary/20 text-primary flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs transition-colors disabled:opacity-50"
					>
						<Wand2 class="h-3.5 w-3.5" />
						{isAutoDetecting ? '检测中...' : '自动检测'}
					</button>
				</div>

				<div class="flex gap-1">
					<button
						type="button"
						onclick={presetBlack}
						disabled={isAutoDetecting}
						class="bg-muted hover:bg-accent flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-50"
					>
						<Square class="h-3 w-3 fill-current" />
						去黑边
					</button>
					<button
						type="button"
						onclick={presetWhite}
						disabled={isAutoDetecting}
						class="bg-muted hover:bg-accent flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-50"
					>
						<Minus class="h-3 w-3" />
						去白边
					</button>
				</div>

				{#if autoDetectMessage}
					<div class="text-muted-foreground text-xs">{autoDetectMessage}</div>
				{/if}

				<!-- 容差 -->
				<div class="space-y-1">
					<div class="flex justify-between text-xs">
						<span class="text-muted-foreground">容差</span>
						<span>{settings.autoTrimThreshold}</span>
					</div>
					<input
						type="range"
						min="5"
						max="100"
						step="5"
						value={settings.autoTrimThreshold}
						oninput={handleThreshold}
						class="accent-primary h-1 w-full"
					/>
				</div>

				<!-- 目标颜色 -->
				<div class="flex items-center justify-between text-xs">
					<span class="text-muted-foreground">目标颜色</span>
					<select
						value={settings.autoTrimTarget}
						onchange={handleTargetChange}
						class="bg-background border-border rounded border px-2 py-0.5 text-xs"
					>
						<option value="auto">自动</option>
						<option value="black">黑色</option>
						<option value="white">白色</option>
					</select>
				</div>
			</div>
		{/if}
	</div>
{:else}
	<div class="text-muted-foreground py-2 text-center text-sm">加载中...</div>
{/if}
