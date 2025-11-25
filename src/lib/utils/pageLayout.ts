export interface DimensionLike {
	width?: number | null;
	height?: number | null;
}

export const HORIZONTAL_RATIO_THRESHOLD = 1.2;

export function isHorizontalByDimensions(dimensions?: DimensionLike | null): boolean {
	if (!dimensions) return false;
	const { width, height } = dimensions;
	if (typeof width !== 'number' || typeof height !== 'number' || height === 0) return false;
	return width / height >= HORIZONTAL_RATIO_THRESHOLD;
}

export function normalizeAngle(angle: number): number {
	if (!Number.isFinite(angle)) return 0;
	const normalized = angle % 360;
	return normalized < 0 ? normalized + 360 : normalized;
}
