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
	type AutoTrimTarget,
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
	settings ? settings.top > 0 || settings.bottom > 0 || settings.left > 0 || settings.right > 0 : false
);
</script>

{#if settings}
	<div class="space-y-3 text-sm">
		<!-- 开关 + 重置 -->
		<div class="flex items-center justify-between">
			<label class="flex items-center gap-2 cursor-pointer">
				<input
					type="checkbox"
					checked={settings.enabled}
					onchange={toggleEnabled}
					class="w-4 h-4 rounded border-border"
				/>
				<span>图像裁剪</span>
			</label>
			<button
				type="button"
				onclick={resetAll}
				class="p-1 hover:bg-accent rounded"
				title="重置所有裁剪"
			>
				<RotateCcw class="w-4 h-4" />
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
							class="p-0.5 hover:bg-accent rounded"
							title={settings.linkVertical ? '取消上下联动' : '上下联动'}
						>
							{#if settings.linkVertical}
								<Link class="w-3 h-3 text-primary" />
							{:else}
								<Unlink class="w-3 h-3 text-muted-foreground" />
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
					class="w-full h-1 accent-primary"
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
					class="w-full h-1 accent-primary"
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
							class="p-0.5 hover:bg-accent rounded"
							title={settings.linkHorizontal ? '取消左右联动' : '左右联动'}
						>
							{#if settings.linkHorizontal}
								<Link class="w-3 h-3 text-primary" />
							{:else}
								<Unlink class="w-3 h-3 text-muted-foreground" />
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
					class="w-full h-1 accent-primary"
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
					class="w-full h-1 accent-primary"
				/>
			</div>

			<!-- 裁剪预览指示 -->
			{#if hasValues}
				<div class="relative w-full aspect-3/4 border border-border rounded overflow-hidden bg-muted/30">
					<!-- 原始区域 -->
					<div class="absolute inset-0 bg-muted/20"></div>
					<!-- 裁剪后的有效区域 -->
					<div
						class="absolute bg-primary/10 border border-primary/30 rounded-sm"
						style="top: {settings.top}%; bottom: {settings.bottom}%; left: {settings.left}%; right: {settings.right}%;"
					></div>
					<!-- 标注 -->
					<div class="absolute inset-0 flex items-center justify-center">
						<span class="text-[10px] text-muted-foreground/60">
							{(100 - settings.top - settings.bottom).toFixed(1)}% × {(100 - settings.left - settings.right).toFixed(1)}%
						</span>
					</div>
				</div>
			{/if}

			<!-- 分隔线 -->
			<div class="border-t border-border"></div>

			<!-- 自动裁剪 -->
			<div class="space-y-2">
				<span class="text-xs text-muted-foreground font-medium">自动裁剪</span>

				<div class="flex gap-1">
					<button
						type="button"
						onclick={runAutoDetect}
						disabled={isAutoDetecting}
						class="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors disabled:opacity-50"
					>
						<Wand2 class="w-3.5 h-3.5" />
						{isAutoDetecting ? '检测中...' : '自动检测'}
					</button>
				</div>

				<div class="flex gap-1">
					<button
						type="button"
						onclick={presetBlack}
						disabled={isAutoDetecting}
						class="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs bg-muted hover:bg-accent rounded transition-colors disabled:opacity-50"
					>
						<Square class="w-3 h-3 fill-current" />
						去黑边
					</button>
					<button
						type="button"
						onclick={presetWhite}
						disabled={isAutoDetecting}
						class="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs bg-muted hover:bg-accent rounded transition-colors disabled:opacity-50"
					>
						<Minus class="w-3 h-3" />
						去白边
					</button>
				</div>

				{#if autoDetectMessage}
					<div class="text-xs text-muted-foreground">{autoDetectMessage}</div>
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
						class="w-full h-1 accent-primary"
					/>
				</div>

				<!-- 目标颜色 -->
				<div class="flex justify-between items-center text-xs">
					<span class="text-muted-foreground">目标颜色</span>
					<select
						value={settings.autoTrimTarget}
						onchange={handleTargetChange}
						class="px-2 py-0.5 text-xs bg-background border border-border rounded"
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
	<div class="text-sm text-muted-foreground text-center py-2">加载中...</div>
{/if}
