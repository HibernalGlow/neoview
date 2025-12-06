<script lang="ts">
	/**
	 * 进度条组件
	 * 用于显示百分比进度
	 */
	interface Props {
		label: string;
		value: number;
		labelWidth?: string;
		valueWidth?: string;
	}

	let { label, value, labelWidth = '2.5rem', valueWidth = '2.5rem' }: Props = $props();

	// 根据使用率获取颜色类
	function getUsageClass(usage: number): string {
		if (usage > 90) return 'critical';
		if (usage > 75) return 'high';
		if (usage > 50) return 'medium';
		return 'low';
	}

	const usageClass = $derived(getUsageClass(value));
</script>

<div class="progress-container" style:--label-width={labelWidth} style:--value-width={valueWidth}>
	<span class="label">{label}</span>
	<div class="bar-container">
		<div class="usage-bar {usageClass}" style:transform={`translateX(${value - 100}%)`}></div>
	</div>
	<span class="value">{Math.round(value)}%</span>
</div>

<style>
	.progress-container {
		width: 100%;
		display: grid;
		grid-template-columns: var(--label-width) 1fr var(--value-width);
		align-items: center;
		gap: 0.3rem;
		font-size: 0.7rem;
	}

	.label {
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		font-size: 0.65rem;
	}

	.value {
		color: hsl(var(--foreground));
		text-align: right;
		white-space: nowrap;
		font-family: monospace;
	}

	.bar-container {
		height: 8px;
		background: hsl(var(--muted));
		border-radius: 4px;
		overflow: hidden;
		position: relative;
	}

	.usage-bar {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 100%;
		transition: transform 0.3s ease;
		transform-origin: left;
	}

	.usage-bar.low {
		background: hsl(var(--chart-1));
	}

	.usage-bar.medium {
		background: hsl(var(--chart-3));
	}

	.usage-bar.high {
		background: hsl(var(--chart-4));
	}

	.usage-bar.critical {
		background: hsl(var(--destructive));
	}
</style>
