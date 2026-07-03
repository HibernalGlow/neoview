<script lang="ts">
	type LiquidGlassContrast = 'light' | 'dark' | 'light-contrast' | 'dark-contrast';

	interface Props {
		contrast?: LiquidGlassContrast;
		accent?: string;
		roundness?: number;
		opacity?: number;
		class?: string;
		children?: import('svelte').Snippet;
	}

	let {
		contrast = 'dark',
		accent = 'var(--accent)',
		roundness = 8,
		opacity = 0.92,
		class: className = '',
		children
	}: Props = $props();

	const filterId = `liquid-glass-${Math.random().toString(36).slice(2)}`;
	let isHovering = $state(false);
	const normalizedOpacity = $derived(Math.min(1, Math.max(0.1, opacity)));
	const isDark = $derived(contrast === 'dark' || contrast === 'dark-contrast');
	const rootStyle = $derived(
		[
			`--lg-roundness:${roundness}px`,
			`--lg-opacity:${normalizedOpacity}`,
			`--lg-accent:${accent}`,
			`--lg-bg-opacity:${normalizedOpacity * 0.18}`,
			`--lg-tint-opacity:${normalizedOpacity * 0.26}`,
			`--lg-shadow-opacity:${normalizedOpacity * 0.34}`,
			`--lg-angle-1:-75deg`,
			`--lg-angle-2:-45deg`
		].join(';')
	);
</script>

<div
	class={`liquid-glass ${className}`}
	style={rootStyle}
	data-contrast={contrast}
	data-dark={isDark}
	onmouseenter={() => (isHovering = true)}
	onmouseleave={() => (isHovering = false)}
>
	{#if isHovering}
		<div class="hover-layer" aria-hidden="true">
			<div class="rotating-gradient"></div>
		</div>
	{/if}

	<div class="tint" aria-hidden="true"></div>
	<div class="glass-filter" style={`filter: url(#${filterId}) saturate(150%)`} aria-hidden="true"></div>
	<div class="glass-shadow" aria-hidden="true"></div>
	<div class="glass-content">
		{@render children?.()}
	</div>
</div>

<svg class="filter-defs" aria-hidden="true" focusable="false">
	<filter id={filterId} x="0%" y="0%" width="100%" height="100%">
		<feTurbulence
			type="fractalNoise"
			baseFrequency="0.008 0.008"
			numOctaves="2"
			seed="92"
			result="noise"
		/>
		<feGaussianBlur in="noise" stdDeviation="2" result="blurred" />
		<feDisplacementMap
			in="SourceGraphic"
			in2="blurred"
			scale="64"
			xChannelSelector="R"
			yChannelSelector="G"
		/>
	</filter>
</svg>

<style>
	.liquid-glass {
		position: relative;
		isolation: isolate;
		overflow: hidden;
		border-radius: var(--lg-roundness);
		background: transparent;
		transition:
			transform 400ms cubic-bezier(0.25, 1, 0.5, 1),
			filter 400ms cubic-bezier(0.25, 1, 0.5, 1);
	}

	.hover-layer,
	.tint,
	.glass-filter,
	.glass-shadow {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		pointer-events: none;
	}

	.hover-layer {
		z-index: 1;
		background: rgba(228, 251, 251, 0.36);
		opacity: 0.62;
	}

	.rotating-gradient {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		mix-blend-mode: lighten;
		opacity: 0.7;
		background: conic-gradient(
			from 0deg,
			#e7ffff 0%,
			var(--lg-accent) 25%,
			#ffffff 50%,
			var(--lg-accent) 75%,
			#e7ffff 100%
		);
		animation: liquid-glass-rotate 4s ease-in-out infinite;
	}

	.tint {
		z-index: 1;
		background-color: var(--lg-accent);
		opacity: var(--lg-tint-opacity);
	}

	.glass-filter {
		z-index: 0;
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
	}

	.glass-shadow {
		z-index: 2;
		box-shadow:
			inset 0 0.125em 0.125em rgba(255, 255, 255, 0.22),
			inset 0 -0.125em 0.125em rgba(0, 0, 0, 0.22),
			0 0.25em 0.125em -0.125em rgba(0, 0, 0, var(--lg-shadow-opacity)),
			0 0 0.1em 0.18em inset rgba(255, 255, 255, 0.18);
	}

	.glass-shadow::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1px;
		box-sizing: border-box;
		mask:
			linear-gradient(#000 0 0) content-box,
			linear-gradient(#000 0 0);
		mask-composite: exclude;
		background:
			conic-gradient(
				from var(--lg-angle-1) at 50% 50%,
				rgba(255, 255, 255, 0.6),
				rgba(255, 255, 255, 0) 5% 40%,
				rgba(255, 255, 255, 0.48) 50%,
				rgba(255, 255, 255, 0) 60% 95%,
				rgba(255, 255, 255, 0.55)
			),
			linear-gradient(180deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.08));
	}

	.liquid-glass[data-dark='false'] .glass-shadow {
		box-shadow:
			inset 0 0.125em 0.125em rgba(0, 0, 0, 0.05),
			inset 0 -0.125em 0.125em rgba(255, 255, 255, 0.48),
			0 0.25em 0.125em -0.125em rgba(0, 0, 0, 0.22),
			0 0 0.1em 0.18em inset rgba(255, 255, 255, 0.2);
	}

	.liquid-glass:hover {
		transform: scale(0.985);
	}

	.liquid-glass:hover .glass-filter {
		backdrop-filter: blur(1px);
		-webkit-backdrop-filter: blur(1px);
	}

	.liquid-glass:hover .glass-shadow::after {
		--lg-angle-1: -125deg;
	}

	.liquid-glass:active {
		transform: rotate3d(1, 0, 0, 14deg) scale(0.985);
	}

	.glass-content {
		position: relative;
		z-index: 3;
		border-radius: inherit;
		background:
			linear-gradient(
				-75deg,
				rgba(255, 255, 255, 0.04),
				rgba(255, 255, 255, var(--lg-bg-opacity)),
				rgba(255, 255, 255, 0.04)
			);
	}

	.glass-content::after {
		content: '';
		position: absolute;
		inset: 1px;
		border-radius: calc(var(--lg-roundness) - 1px);
		pointer-events: none;
		mix-blend-mode: screen;
		background: linear-gradient(
			var(--lg-angle-2),
			rgba(255, 255, 255, 0) 0%,
			rgba(255, 255, 255, 0.42) 20% 30%,
			rgba(255, 255, 255, 0) 55%
		);
	}

	.filter-defs {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
	}

	@keyframes liquid-glass-rotate {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
