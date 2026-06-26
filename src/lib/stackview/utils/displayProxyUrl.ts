export const DISPLAY_PROXY_MIN_SOURCE_PIXELS = 6_000_000;
export const DISPLAY_PROXY_MIN_SAVINGS_RATIO = 1.35;
export const DISPLAY_PROXY_DPR_CAP = 2;
export const DISPLAY_PROXY_OVERSAMPLE = 1.2;
export const DISPLAY_PROXY_BUCKET = 256;

export interface DisplayProxyCandidate {
	url: string;
	width: number;
	height: number;
	pixels: number;
}

export interface DisplayProxyInput {
	url: string;
	sourceWidth: number;
	sourceHeight: number;
	cssWidth: number;
	cssHeight: number;
	dpr?: number;
}

export function isScalableProtocolUrl(value: string): boolean {
	return value.startsWith('neoview://localhost/') || value.startsWith('http://neoview.localhost/');
}

export function readCssPixelValue(cssText: string, property: 'width' | 'height'): number {
	const match = cssText.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([0-9.]+)px`, 'i'));
	const value = match ? Number.parseFloat(match[1]) : 0;
	return Number.isFinite(value) && value > 0 ? value : 0;
}

export function bucketDisplayProxySize(value: number): number {
	return Math.max(1, Math.ceil(value / DISPLAY_PROXY_BUCKET) * DISPLAY_PROXY_BUCKET);
}

export function appendScaleParams(value: string, width: number, height: number): string {
	const separator = value.includes('?') ? '&' : '?';
	return `${value}${separator}w=${width}&h=${height}`;
}

export function normalizeDisplayProxyDpr(value: number | undefined): number {
	if (!Number.isFinite(value) || !value || value < 1) {
		return 1;
	}
	return Math.min(DISPLAY_PROXY_DPR_CAP, value);
}

export function getDisplayProxyCandidate(input: DisplayProxyInput): DisplayProxyCandidate | null {
	const { url, sourceWidth, sourceHeight, cssWidth, cssHeight } = input;

	if (!url || !isScalableProtocolUrl(url)) return null;
	if (!sourceWidth || !sourceHeight || !cssWidth || !cssHeight) return null;

	const sourcePixels = sourceWidth * sourceHeight;
	if (sourcePixels < DISPLAY_PROXY_MIN_SOURCE_PIXELS) return null;

	const dpr = normalizeDisplayProxyDpr(input.dpr);
	const targetWidth = Math.min(
		sourceWidth,
		bucketDisplayProxySize(cssWidth * dpr * DISPLAY_PROXY_OVERSAMPLE)
	);
	const targetHeight = Math.min(
		sourceHeight,
		bucketDisplayProxySize(cssHeight * dpr * DISPLAY_PROXY_OVERSAMPLE)
	);

	if (targetWidth >= sourceWidth * 0.92 && targetHeight >= sourceHeight * 0.92) {
		return null;
	}

	const targetPixels = targetWidth * targetHeight;
	if (sourcePixels / Math.max(1, targetPixels) < DISPLAY_PROXY_MIN_SAVINGS_RATIO) {
		return null;
	}

	return {
		url: appendScaleParams(url, targetWidth, targetHeight),
		width: targetWidth,
		height: targetHeight,
		pixels: targetPixels
	};
}
