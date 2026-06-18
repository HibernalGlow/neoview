<script lang="ts">
	/**
	 * 动态背景设置卡片
	 * 提供流光溢彩、极光、聚光灯等动画背景效果的控制界面
	 */
	import { onMount } from 'svelte';
	import { settingsManager, type NeoViewSettings } from '$lib/settings/settingsManager';
	import { RotateCcw } from '@lucide/svelte';

	// 流光样式选项
	const ambientStyleOptions = [
		{ value: 'gentle', label: '柔和', desc: '缓慢轻微的移动' },
		{ value: 'vibrant', label: '鲜艳', desc: '类似灵动岛效果' },
		{ value: 'dynamic', label: '动感', desc: '快速大幅的移动' }
	] as const;

	// 背景模式选项
	const modeOptions = [
		{ value: 'solid', label: '固定颜色', icon: '🎨', desc: '使用设置的背景颜色' },
		{ value: 'auto', label: '自动匹配', icon: '🖼️', desc: '从图片边缘提取主色调' },
		{ value: 'ambient', label: '流光溢彩', icon: '✨', desc: '类似灵动岛的流动渐变' },
		{ value: 'aurora', label: '极光', icon: '🌌', desc: '北极光波动效果' },
		{ value: 'spotlight', label: '聚光灯', icon: '💡', desc: '舞台聚光灯效果' }
	] as const;

	// 聚光灯颜色选项
	const spotlightColors = [
		{ value: 'white', label: '白色', color: '#ffffff' },
		{ value: '#3b82f6', label: '蓝色', color: '#3b82f6' },
		{ value: '#8b5cf6', label: '紫色', color: '#8b5cf6' },
		{ value: '#ec4899', label: '粉色', color: '#ec4899' },
		{ value: '#22c55e', label: '绿色', color: '#22c55e' },
		{ value: '#f97316', label: '橙色', color: '#f97316' }
	] as const;

	let settings = $state<NeoViewSettings | null>(null);

	onMount(() => {
		settings = settingsManager.getSettings();
		const unsubscribe = settingsManager.addListener((s: NeoViewSettings) => {
			settings = s;
		});
		return unsubscribe;
	});

	// 当前背景模式
	let backgroundMode = $derived(settings?.view.backgroundMode ?? 'solid');
	let isEffectEnabled = $derived(['ambient', 'aurora', 'spotlight'].includes(backgroundMode));

	// ambient 设置
	let ambientStyle = $derived(settings?.view.ambient?.style ?? 'vibrant');
	let ambientSpeed = $derived(settings?.view.ambient?.speed ?? 8);
	let ambientBlur = $derived(settings?.view.ambient?.blur ?? 80);
	let ambientOpacity = $derived(settings?.view.ambient?.opacity ?? 0.8);

	// aurora 设置
	let auroraShowRadialGradient = $derived(settings?.view.aurora?.showRadialGradient ?? true);

	// spotlight 设置
	let spotlightColor = $derived(settings?.view.spotlight?.color ?? 'white');

	// 切换效果
	function toggleEffect() {
		if (!settings) return;
		const newMode = isEffectEnabled ? 'solid' : 'ambient';
		settingsManager.updateNestedSettings('view', {
			backgroundMode: newMode
		});
	}

	// 更新背景模式
	function updateMode(mode: 'solid' | 'auto' | 'ambient' | 'aurora' | 'spotlight') {
		settingsManager.updateNestedSettings('view', {
			backgroundMode: mode
		});
	}

	// 更新 ambient 设置
	function updateAmbient(
		updates: Partial<{
			style: 'gentle' | 'vibrant' | 'dynamic';
			speed: number;
			blur: number;
			opacity: number;
		}>
	) {
		if (!settings) return;
		settingsManager.updateNestedSettings('view', {
			ambient: {
				style: settings.view.ambient?.style ?? 'vibrant',
				speed: settings.view.ambient?.speed ?? 8,
				blur: settings.view.ambient?.blur ?? 80,
				opacity: settings.view.ambient?.opacity ?? 0.8,
				...updates
			}
		});
	}

	// 更新 aurora 设置
	function updateAurora(showRadialGradient: boolean) {
		settingsManager.updateNestedSettings('view', {
			aurora: { showRadialGradient }
		});
	}

	// 更新 spotlight 设置
	function updateSpotlight(color: string) {
		settingsManager.updateNestedSettings('view', {
			spotlight: { color }
		});
	}

	// 重置设置
	function resetSettings() {
		settingsManager.updateNestedSettings('view', {
			backgroundMode: 'solid',
			ambient: {
				speed: 8,
				blur: 80,
				opacity: 0.8,
				style: 'vibrant'
			},
			aurora: {
				showRadialGradient: true
			},
			spotlight: {
				color: 'white'
			}
		});
	}
</script>

{#if settings}
	<div class="space-y-3 text-sm">
		<!-- 标题栏 -->
		<div class="flex items-center justify-between">
			<label class="flex cursor-pointer items-center gap-2">
				<input
					type="checkbox"
					checked={isEffectEnabled}
					onchange={toggleEffect}
					class="border-border h-4 w-4 rounded"
				/>
				<span>启用动态背景</span>
			</label>
			<button
				type="button"
				onclick={resetSettings}
				class="hover:bg-accent rounded p-1"
				title="重置设置"
			>
				<RotateCcw class="h-4 w-4" />
			</button>
		</div>

		<!-- 背景模式选择 -->
		<div class="space-y-1">
			<span class="text-muted-foreground text-xs">背景模式</span>
			<div class="grid grid-cols-2 gap-1">
				{#each modeOptions as option}
					<button
						type="button"
						class="flex items-center gap-1.5 rounded border px-2 py-1.5 text-left text-xs transition-colors {backgroundMode ===
						option.value
							? 'bg-primary text-primary-foreground border-primary'
							: 'bg-background border-border hover:bg-accent'}"
						onclick={() => updateMode(option.value)}
						title={option.desc}
					>
						<span>{option.icon}</span>
						<span>{option.label}</span>
					</button>
				{/each}
			</div>
			<p class="text-muted-foreground text-[10px]">
				{modeOptions.find((o) => o.value === backgroundMode)?.desc}
			</p>
		</div>

		<!-- 流光溢彩设置 -->
		{#if backgroundMode === 'ambient'}
			<div class="bg-muted/20 space-y-2 rounded-lg border p-2">
				<span class="text-xs font-medium">✨ 流光溢彩设置</span>

				<!-- 动画样式 -->
				<div class="space-y-1">
					<span class="text-muted-foreground text-xs">动画样式</span>
					<div class="grid grid-cols-3 gap-1">
						{#each ambientStyleOptions as option}
							<button
								type="button"
								class="rounded border px-2 py-1 text-xs transition-colors {ambientStyle ===
								option.value
									? 'bg-primary text-primary-foreground border-primary'
									: 'bg-background border-border hover:bg-accent'}"
								onclick={() => updateAmbient({ style: option.value })}
								title={option.desc}
							>
								{option.label}
							</button>
						{/each}
					</div>
				</div>

				<!-- 动画速度 -->
				<div class="space-y-1">
					<div class="flex justify-between text-xs">
						<span class="text-muted-foreground">动画速度</span>
						<span>{ambientSpeed}s</span>
					</div>
					<input
						type="range"
						min="2"
						max="20"
						step="1"
						value={ambientSpeed}
						oninput={(e) => updateAmbient({ speed: Number(e.currentTarget.value) })}
						class="accent-primary h-1 w-full"
					/>
				</div>

				<!-- 模糊程度 -->
				<div class="space-y-1">
					<div class="flex justify-between text-xs">
						<span class="text-muted-foreground">模糊程度</span>
						<span>{ambientBlur}px</span>
					</div>
					<input
						type="range"
						min="20"
						max="150"
						step="10"
						value={ambientBlur}
						oninput={(e) => updateAmbient({ blur: Number(e.currentTarget.value) })}
						class="accent-primary h-1 w-full"
					/>
				</div>

				<!-- 效果强度 -->
				<div class="space-y-1">
					<div class="flex justify-between text-xs">
						<span class="text-muted-foreground">效果强度</span>
						<span>{Math.round(ambientOpacity * 100)}%</span>
					</div>
					<input
						type="range"
						min="0.3"
						max="1"
						step="0.05"
						value={ambientOpacity}
						oninput={(e) => updateAmbient({ opacity: Number(e.currentTarget.value) })}
						class="accent-primary h-1 w-full"
					/>
				</div>

				<!-- 预览 -->
				<div class="relative mt-2 h-16 overflow-hidden rounded bg-black">
					<div
						class="ambient-preview absolute inset-0"
						style="--preview-speed: {ambientSpeed}s; --preview-blur: {Math.min(
							ambientBlur / 4,
							20
						)}px; --preview-opacity: {ambientOpacity};"
						class:preview-gentle={ambientStyle === 'gentle'}
						class:preview-vibrant={ambientStyle === 'vibrant'}
						class:preview-dynamic={ambientStyle === 'dynamic'}
					>
						<div class="preview-blob blob-1"></div>
						<div class="preview-blob blob-2"></div>
						<div class="preview-blob blob-3"></div>
					</div>
				</div>
			</div>
		{/if}

		<!-- 极光设置 -->
		{#if backgroundMode === 'aurora'}
			<div class="bg-muted/20 space-y-2 rounded-lg border p-2">
				<span class="text-xs font-medium">🌌 极光设置</span>

				<label class="flex cursor-pointer items-center justify-between gap-2">
					<span class="text-xs">显示径向渐变遮罩</span>
					<input
						type="checkbox"
						checked={auroraShowRadialGradient}
						onchange={(e) => updateAurora(e.currentTarget.checked)}
						class="border-border h-4 w-4 rounded"
					/>
				</label>
				<p class="text-muted-foreground text-[10px]">开启后极光会从角落渐隐，关闭则全屏显示</p>

				<!-- 预览 -->
				<div class="relative mt-2 h-16 overflow-hidden rounded bg-zinc-900">
					<div
						class="aurora-preview absolute inset-0"
						class:aurora-masked={auroraShowRadialGradient}
					></div>
				</div>
			</div>
		{/if}

		<!-- 聚光灯设置 -->
		{#if backgroundMode === 'spotlight'}
			<div class="bg-muted/20 space-y-2 rounded-lg border p-2">
				<span class="text-xs font-medium">💡 聚光灯设置</span>

				<div class="space-y-1">
					<span class="text-muted-foreground text-xs">光束颜色</span>
					<div class="flex flex-wrap gap-1">
						{#each spotlightColors as option}
							<button
								type="button"
								class="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 {spotlightColor ===
								option.value
									? 'border-primary ring-primary/30 ring-2'
									: 'border-border'}"
								style="background-color: {option.color};"
								onclick={() => updateSpotlight(option.value)}
								title={option.label}
							></button>
						{/each}
					</div>
				</div>

				<!-- 预览 -->
				<div class="relative mt-2 h-16 overflow-hidden rounded bg-zinc-900">
					<svg
						class="spotlight-preview"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 3787 2842"
						fill="none"
					>
						<g filter="url(#spotlight-preview-filter)">
							<ellipse
								cx="1924.71"
								cy="273.501"
								rx="1924.71"
								ry="273.501"
								transform="matrix(-0.822377 -0.568943 -0.568943 0.822377 3631.88 2291.09)"
								fill={spotlightColor}
								fill-opacity="0.21"
							></ellipse>
						</g>
						<defs>
							<filter
								id="spotlight-preview-filter"
								x="0.860352"
								y="0.838989"
								width="3785.16"
								height="2840.26"
								filterUnits="userSpaceOnUse"
								color-interpolation-filters="sRGB"
							>
								<feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
								<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"
								></feBlend>
								<feGaussianBlur stdDeviation="50" result="effect1_foregroundBlur"></feGaussianBlur>
							</filter>
						</defs>
					</svg>
				</div>
			</div>
		{/if}
	</div>
{:else}
	<div class="text-muted-foreground py-2 text-center text-sm">加载中...</div>
{/if}

<style>
	/* ==================== 流光溢彩预览 ==================== */
	.ambient-preview {
		filter: blur(var(--preview-blur, 15px));
		opacity: var(--preview-opacity, 0.8);
	}

	.preview-blob {
		position: absolute;
		border-radius: 50%;
		mix-blend-mode: screen;
	}

	.blob-1 {
		width: 60%;
		height: 80%;
		background: radial-gradient(circle, #6366f1 0%, transparent 70%);
		top: -10%;
		left: -10%;
	}

	.blob-2 {
		width: 50%;
		height: 70%;
		background: radial-gradient(circle, #ec4899 0%, transparent 70%);
		top: 20%;
		right: -5%;
	}

	.blob-3 {
		width: 55%;
		height: 75%;
		background: radial-gradient(circle, #22c55e 0%, transparent 70%);
		bottom: -20%;
		left: 30%;
	}

	/* 柔和动画 */
	.preview-gentle .blob-1 {
		animation: gentle-1 calc(var(--preview-speed) * 1.5) ease-in-out infinite;
	}
	.preview-gentle .blob-2 {
		animation: gentle-2 calc(var(--preview-speed) * 1.8) ease-in-out infinite;
		animation-delay: calc(var(--preview-speed) * -0.3);
	}
	.preview-gentle .blob-3 {
		animation: gentle-3 calc(var(--preview-speed) * 2) ease-in-out infinite;
		animation-delay: calc(var(--preview-speed) * -0.6);
	}

	@keyframes gentle-1 {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
		}
		50% {
			transform: translate(5%, 3%) scale(1.05);
		}
	}
	@keyframes gentle-2 {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
		}
		50% {
			transform: translate(-4%, 5%) scale(0.95);
		}
	}
	@keyframes gentle-3 {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
		}
		50% {
			transform: translate(3%, -4%) scale(1.03);
		}
	}

	/* 鲜艳动画 */
	.preview-vibrant .blob-1 {
		animation: vibrant-1 var(--preview-speed) ease-in-out infinite;
	}
	.preview-vibrant .blob-2 {
		animation: vibrant-2 calc(var(--preview-speed) * 1.2) ease-in-out infinite;
		animation-delay: calc(var(--preview-speed) * -0.25);
	}
	.preview-vibrant .blob-3 {
		animation: vibrant-3 calc(var(--preview-speed) * 0.9) ease-in-out infinite;
		animation-delay: calc(var(--preview-speed) * -0.5);
	}

	@keyframes vibrant-1 {
		0%,
		100% {
			transform: translate(0, 0) scale(1) rotate(0deg);
		}
		25% {
			transform: translate(10%, 5%) scale(1.1) rotate(5deg);
		}
		50% {
			transform: translate(5%, 10%) scale(0.95) rotate(-3deg);
		}
		75% {
			transform: translate(-5%, 5%) scale(1.05) rotate(3deg);
		}
	}
	@keyframes vibrant-2 {
		0%,
		100% {
			transform: translate(0, 0) scale(1) rotate(0deg);
		}
		25% {
			transform: translate(-8%, 10%) scale(0.9) rotate(-5deg);
		}
		50% {
			transform: translate(-15%, 5%) scale(1.1) rotate(5deg);
		}
		75% {
			transform: translate(-5%, -5%) scale(1) rotate(-3deg);
		}
	}
	@keyframes vibrant-3 {
		0%,
		100% {
			transform: translate(0, 0) scale(1) rotate(0deg);
		}
		25% {
			transform: translate(8%, -8%) scale(1.05) rotate(8deg);
		}
		50% {
			transform: translate(15%, 5%) scale(0.9) rotate(-5deg);
		}
		75% {
			transform: translate(5%, 10%) scale(1.1) rotate(3deg);
		}
	}

	/* 动感动画 */
	.preview-dynamic .blob-1 {
		animation: dynamic-1 calc(var(--preview-speed) * 0.6) ease-in-out infinite;
	}
	.preview-dynamic .blob-2 {
		animation: dynamic-2 calc(var(--preview-speed) * 0.7) ease-in-out infinite;
		animation-delay: calc(var(--preview-speed) * -0.1);
	}
	.preview-dynamic .blob-3 {
		animation: dynamic-3 calc(var(--preview-speed) * 0.5) ease-in-out infinite;
		animation-delay: calc(var(--preview-speed) * -0.2);
	}

	@keyframes dynamic-1 {
		0%,
		100% {
			transform: translate(0, 0) scale(1) rotate(0deg);
		}
		20% {
			transform: translate(15%, 10%) scale(1.2) rotate(10deg);
		}
		40% {
			transform: translate(25%, -5%) scale(0.8) rotate(-15deg);
		}
		60% {
			transform: translate(10%, -15%) scale(1.1) rotate(5deg);
		}
		80% {
			transform: translate(-10%, -5%) scale(0.9) rotate(-5deg);
		}
	}
	@keyframes dynamic-2 {
		0%,
		100% {
			transform: translate(0, 0) scale(1) rotate(0deg);
		}
		20% {
			transform: translate(-20%, 15%) scale(0.8) rotate(-12deg);
		}
		40% {
			transform: translate(-10%, 25%) scale(1.15) rotate(8deg);
		}
		60% {
			transform: translate(10%, 15%) scale(0.9) rotate(-8deg);
		}
		80% {
			transform: translate(5%, -10%) scale(1.1) rotate(5deg);
		}
	}
	@keyframes dynamic-3 {
		0%,
		100% {
			transform: translate(0, 0) scale(1) rotate(0deg);
		}
		20% {
			transform: translate(20%, -20%) scale(1.15) rotate(15deg);
		}
		40% {
			transform: translate(30%, 10%) scale(0.85) rotate(-10deg);
		}
		60% {
			transform: translate(5%, 20%) scale(1.2) rotate(8deg);
		}
		80% {
			transform: translate(-15%, 5%) scale(0.9) rotate(-5deg);
		}
	}

	/* ==================== 极光预览 ==================== */
	.aurora-preview {
		--blue-300: #93c5fd;
		--blue-400: #60a5fa;
		--blue-500: #3b82f6;
		--indigo-300: #a5b4fc;
		--violet-200: #ddd6fe;

		opacity: 0.5;
		background-image:
			repeating-linear-gradient(
				100deg,
				#000 0%,
				#000 7%,
				transparent 10%,
				transparent 12%,
				#000 16%
			),
			repeating-linear-gradient(
				100deg,
				var(--blue-500) 10%,
				var(--indigo-300) 15%,
				var(--blue-300) 20%,
				var(--violet-200) 25%,
				var(--blue-400) 30%
			);
		background-size: 300% 200%;
		filter: blur(5px);
		animation: aurora-preview 15s linear infinite;
	}

	.aurora-preview.aurora-masked {
		mask-image: radial-gradient(ellipse at 100% 0%, black 10%, transparent 70%);
		-webkit-mask-image: radial-gradient(ellipse at 100% 0%, black 10%, transparent 70%);
	}

	@keyframes aurora-preview {
		from {
			background-position: 50% 50%;
		}
		to {
			background-position: 350% 50%;
		}
	}

	/* ==================== 聚光灯预览 ==================== */
	.spotlight-preview {
		position: absolute;
		height: 169%;
		width: 138%;
		pointer-events: none;
		animation: spotlight-preview 2s ease 0.5s 1 forwards;
		opacity: 0;
	}

	@keyframes spotlight-preview {
		0% {
			opacity: 0;
			transform: translate(-72%, -62%) scale(0.5);
		}
		100% {
			opacity: 1;
			transform: translate(-50%, -40%) scale(1);
		}
	}
</style>
