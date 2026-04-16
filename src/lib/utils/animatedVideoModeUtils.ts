/**
 * Utilities for opening animated images in video mode.
 *
 * WebP is handled by an additional probe step to avoid routing static
 * WebP files into the video player by mistake.
 */
const FAST_ANIMATED_VIDEO_CANDIDATE_EXTENSIONS = ['.gif', '.apng'];
const WEBP_EXTENSION = '.webp';

export function isAnimatedImageVideoCandidate(filename: string): boolean {
	if (!filename) return false;
	const normalized = filename.toLowerCase();
	return FAST_ANIMATED_VIDEO_CANDIDATE_EXTENSIONS.some((ext) => normalized.endsWith(ext));
}

export function isAnimatedWebpCandidate(filename: string): boolean {
	if (!filename) return false;
	return filename.toLowerCase().endsWith(WEBP_EXTENSION);
}

export function matchesAnimatedVideoKeyword(text: string, keywords: string[]): boolean {
	if (!text || keywords.length === 0) return false;
	const normalizedText = text.toLowerCase();
	return keywords.some((keyword) => keyword && normalizedText.includes(keyword.toLowerCase()));
}
