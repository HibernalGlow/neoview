<script lang="ts">
	/**
	 * 轮盘菜单覆盖层
	 * 只负责画轮盘和高亮当前 slot
	 * 不处理输入（由 RadialInputLayer 负责）
	 */

	import { radialMenuStore } from '$lib/stores/radialMenu';
	import { getMaxRadius, getSectorAngles, getSlotOffset } from '$lib/stores/radialMenu/geometry';
	import { keyBindingsStore } from '$lib/stores/keybindings';

	// 获取 action 的显示名称
	function getActionLabel(action: string | null): string {
		if (!action) return '';
		const binding = keyBindingsStore.bindings.find(b => b.action === action);
		return binding?.name ?? action;
	}

	// 获取 slot 的显示标签
	function getSlotLabel(key: string): string {
		const slot = radialMenuStore.config.slots[key];
		if (!slot || !slot.action) return '';
		return slot.label ?? getActionLabel(slot.action);
	}

	// 计算轮盘 SVG 尺寸
	const maxRadius = $derived(getMaxRadius(radialMenuStore.config));
	const svgSize = $derived(maxRadius * 2 + 40);

	// 生成扇区路径
	function sectorPath(layer: number, sector: number, sectorCount: number, deadZone: number, layerStep: number): string {
		const innerR = layer === 1 ? deadZone : deadZone + (layer - 1) * layerStep;
		const outerR = deadZone + layer * layerStep;
		const angles = getSectorAngles(sector, sectorCount);
		const startAngle = angles.start;
		const endAngle = angles.end;

		const x1 = Math.cos(startAngle) * outerR;
		const y1 = Math.sin(startAngle) * outerR;
		const x2 = Math.cos(endAngle) * outerR;
		const y2 = Math.sin(endAngle) * outerR;
		const x3 = Math.cos(endAngle) * innerR;
		const y3 = Math.sin(endAngle) * innerR;
		const x4 = Math.cos(startAngle) * innerR;
		const y4 = Math.sin(startAngle) * innerR;

		const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;

		return `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4} Z`;
	}

	// 生成所有扇区
	const sectors = $derived(
		Array.from({ length: radialMenuStore.config.layers }, (_, layerIdx) => {
			const layer = layerIdx + 1;
			return Array.from({ length: radialMenuStore.config.sectorCount }, (_, sector) => {
				const key = `${layer}:${sector}`;
				const slot = radialMenuStore.config.slots[key];
				return {
					key,
					layer,
					sector,
					path: sectorPath(layer, sector, radialMenuStore.config.sectorCount, radialMenuStore.config.deadZonePx, radialMenuStore.config.layerStepPx),
					label: getSlotLabel(key),
					hasAction: slot?.action != null,
					enabled: slot?.enabled !== false,
					labelPos: getSlotOffset(layer, sector, radialMenuStore.config),
				};
			});
		}).flat()
	);

	const isHit = (key: string) => radialMenuStore.currentHit?.key === key;
</script>

{#if radialMenuStore.isOpen}
	<div
		class="radial-overlay"
		style="left: {radialMenuStore.centerX}px; top: {radialMenuStore.centerY}px;"
	>
		<svg
			width={svgSize}
			height={svgSize}
			viewBox="{-svgSize / 2} {-svgSize / 2} {svgSize} {svgSize}"
			class="radial-svg"
		>
			<!-- 死区圆 -->
			<circle
				cx="0" cy="0" r={radialMenuStore.config.deadZonePx}
				class="dead-zone"
			/>

			<!-- 扇区 -->
			{#each sectors as s (s.key)}
				<path
					d={s.path}
					class="sector"
					class:hit={isHit(s.key)}
					class:disabled={!s.enabled}
					class:empty={!s.hasAction}
				/>
				{#if s.hasAction && s.enabled}
					<text
						x={s.labelPos.x}
						y={s.labelPos.y}
						class="slot-label"
						class:hit={isHit(s.key)}
						text-anchor="middle"
						dominant-baseline="middle"
					>
						{s.label}
					</text>
				{/if}
			{/each}

			<!-- 中心指示器 -->
			<circle cx="0" cy="0" r="4" class="center-dot" />
		</svg>
	</div>
{/if}

<style>
	.radial-overlay {
		position: fixed;
		z-index: 9999;
		pointer-events: none;
		transform: translate(-50%, -50%);
	}

	.radial-svg {
		overflow: visible;
	}

	.dead-zone {
		fill: rgba(0, 0, 0, 0.3);
		stroke: rgba(255, 255, 255, 0.2);
		stroke-width: 1;
	}

	.sector {
		fill: rgba(30, 30, 40, 0.7);
		stroke: rgba(255, 255, 255, 0.15);
		stroke-width: 1;
		transition: fill 0.1s ease;
	}

	.sector.empty {
		fill: rgba(30, 30, 40, 0.3);
	}

	.sector.disabled {
		opacity: 0.3;
	}

	.sector.hit {
		fill: rgba(100, 160, 255, 0.6);
		stroke: rgba(100, 160, 255, 1);
		stroke-width: 2;
	}

	.slot-label {
		fill: rgba(255, 255, 255, 0.8);
		font-size: 11px;
		font-family: sans-serif;
		pointer-events: none;
		user-select: none;
	}

	.slot-label.hit {
		fill: white;
		font-weight: bold;
		font-size: 13px;
	}

	.center-dot {
		fill: rgba(255, 255, 255, 0.5);
	}
</style>
