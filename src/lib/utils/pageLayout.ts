import type { AutoRotateMode } from '$lib/settings/settingsManager';

export interface DimensionLike {
	width?: number | null;
	height?: number | null;
}

export const HORIZONTAL_RATIO_THRESHOLD = 1.2;

function hasValidDimensions(dimensions?: DimensionLike | null): dimensions is { width: number; height: number } {
	if (!dimensions) return false;
	const { width, height } = dimensions;
	return typeof width === 'number' && typeof height === 'number' && height !== 0 && width !== 0;
}

export function isHorizontalByDimensions(dimensions?: DimensionLike | null): boolean {
	if (!hasValidDimensions(dimensions)) return false;
	return (dimensions.width ?? 0) / (dimensions.height ?? 1) >= HORIZONTAL_RATIO_THRESHOLD;
}

export function normalizeAngle(angle: number): number {
	if (!Number.isFinite(angle)) return 0;
	const normalized = angle % 360;
	return normalized < 0 ? normalized + 360 : normalized;
}

export function computeAutoRotateAngle(
	mode: AutoRotateMode,
	dimensions?: DimensionLike | null
): number | null {
	if (mode === 'none') {
		return null;
	}

	const hasDims = hasValidDimensions(dimensions);
	const isHorizontal = hasDims ? isHorizontalByDimensions(dimensions) : false;
	const isPortrait = hasDims ? !isHorizontal : false;

	switch (mode) {
		case 'left':
			return isPortrait ? normalizeAngle(-90) : null;
		case 'right':
			return isPortrait ? normalizeAngle(90) : null;
		case 'horizontalLeft':
			return isHorizontal ? normalizeAngle(-90) : null;
		case 'horizontalRight':
			return isHorizontal ? normalizeAngle(90) : null;
		case 'forcedLeft':
			return normalizeAngle(-90);
		case 'forcedRight':
			return normalizeAngle(90);
		default:
			return null;
	}
}
