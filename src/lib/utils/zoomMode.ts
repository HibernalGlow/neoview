import type { ZoomMode } from '$lib/settings/settingsManager';

export const applyZoomModeEventName = 'neoview-apply-zoom-mode';

export type ApplyZoomModeDetail = {
	mode?: ZoomMode;
};

export function dispatchApplyZoomMode(mode?: ZoomMode) {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(
		new CustomEvent<ApplyZoomModeDetail>(applyZoomModeEventName, {
			detail: { mode }
		})
	);
}
