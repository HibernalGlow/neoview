import type { Component } from 'svelte';
import {
	ArrowLeft,
	ArrowLeftRight,
	ArrowRight,
	BookOpen,
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
	CircleDot,
	FastForward,
	FileMinus,
	FileX,
	FolderOpen,
	Fullscreen,
	Gauge,
	Layers,
	Layout,
	Maximize2,
	PanelLeft as PanelLeftIcon,
	PanelRight as PanelRightIcon,
	Pause,
	Pin,
	Play,
	Repeat,
	Rewind,
	RotateCw,
	Scaling,
	Scan,
	Settings2 as SettingsIcon,
	SkipBack,
	SkipForward,
	Square,
	StepForward,
	Target as TargetIcon,
	Timer,
	Trash2,
	Volume1,
	Volume2,
	VolumeX,
	ZoomIn,
	ZoomOut,
	Zap
} from '@lucide/svelte';

export function getActionIcon(action: string, _category = ''): Component {
	if (action === 'nextPage') return ChevronRight;
	if (action === 'prevPage') return ChevronLeft;
	if (action === 'firstPage') return ChevronsLeft;
	if (action === 'lastPage') return ChevronsRight;
	if (action === 'pageLeft') return ArrowLeft;
	if (action === 'pageRight') return ArrowRight;
	if (action === 'nextBook') return SkipForward;
	if (action === 'prevBook') return SkipBack;

	if (action === 'zoomIn') return ZoomIn;
	if (action === 'zoomOut') return ZoomOut;
	if (action === 'fitWindow') return Maximize2;
	if (action === 'actualSize') return Scaling;
	if (action === 'toggleTemporaryFitZoom') return Scan;

	if (action === 'videoPlayPause') return Play;
	if (action === 'videoSeekForward') return FastForward;
	if (action === 'videoSeekBackward') return Rewind;
	if (action === 'videoToggleMute') return VolumeX;
	if (action === 'videoToggleLoopMode') return Repeat;
	if (action === 'videoVolumeUp') return Volume2;
	if (action === 'videoVolumeDown') return Volume1;
	if (action === 'videoSpeedUp') return Gauge;
	if (action === 'videoSpeedDown') return Timer;
	if (action === 'videoSpeedToggle') return TargetIcon;
	if (action === 'videoSeekModeToggle') return Zap;

	if (action === 'fullscreen') return Fullscreen;
	if (action === 'toggleLeftSidebar') return PanelLeftIcon;
	if (action === 'toggleRightSidebar') return PanelRightIcon;
	if (action === 'toggleTopToolbarPin') return Pin;
	if (action === 'toggleBottomThumbnailBarPin') return Layout;
	if (action === 'toggleReadingDirection') return ArrowLeftRight;
	if (action === 'toggleBookMode') return BookOpen;
	if (action === 'rotate') return RotateCw;
	if (action === 'rotate180') return RotateCw;
	if (action === 'toggleSinglePanoramaView') return Layers;

	if (action === 'openFile') return FolderOpen;
	if (action === 'closeFile') return FileX;
	if (action === 'deleteFile') return Trash2;
	if (action === 'deleteCurrentPage') return FileMinus;

	if (action === 'toggleAutoUpscale') return Zap;

	if (action === 'slideshowToggle') return Play;
	if (action === 'slideshowPlayPause') return Pause;
	if (action === 'slideshowStop') return Square;
	if (action === 'slideshowSkip') return StepForward;

	if (action.startsWith('openRadialMenu.')) return CircleDot;

	return SettingsIcon;
}

function svg(paths: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export function getActionIconSvg(action: string): string {
	if (action === 'nextPage') return svg('<path d="m9 18 6-6-6-6"/>');
	if (action === 'prevPage') return svg('<path d="m15 18-6-6 6-6"/>');
	if (action === 'firstPage') return svg('<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>');
	if (action === 'lastPage') return svg('<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>');
	if (action === 'pageLeft') return svg('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>');
	if (action === 'pageRight') return svg('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>');
	if (action === 'nextBook') return svg('<path d="m5 4 10 8-10 8V4Z"/><path d="M19 5v14"/>');
	if (action === 'prevBook') return svg('<path d="M5 5v14"/><path d="m19 4-10 8 10 8V4Z"/>');

	if (action === 'zoomIn') return svg('<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>');
	if (action === 'zoomOut') return svg('<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/>');
	if (action === 'fitWindow') return svg('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>');
	if (action === 'actualSize') return svg('<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>');
	if (action === 'toggleTemporaryFitZoom') return svg('<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>');

	if (action === 'videoPlayPause') return svg('<path d="m8 5 11 7-11 7V5Z"/><path d="M5 5v14"/>');
	if (action === 'videoSeekForward') return svg('<path d="m13 19 7-7-7-7v14Z"/><path d="m5 19 7-7-7-7v14Z"/>');
	if (action === 'videoSeekBackward') return svg('<path d="m11 19-7-7 7-7v14Z"/><path d="m19 19-7-7 7-7v14Z"/>');
	if (action === 'videoToggleMute') return svg('<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m23 9-6 6"/><path d="m17 9 6 6"/>');
	if (action === 'videoToggleLoopMode') return svg('<path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>');
	if (action === 'videoVolumeUp') return svg('<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M19.1 4.9a10 10 0 0 1 0 14.2"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>');
	if (action === 'videoVolumeDown') return svg('<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>');
	if (action === 'videoSpeedUp' || action === 'videoSpeedDown') return svg('<path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>');
	if (action === 'videoSpeedToggle') return svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>');
	if (action === 'videoSeekModeToggle') return svg('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>');

	if (action === 'fullscreen') return svg('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>');
	if (action === 'toggleLeftSidebar') return svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>');
	if (action === 'toggleRightSidebar') return svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>');
	if (action === 'toggleTopToolbarPin' || action === 'toggleBottomThumbnailBarPin') return svg('<path d="M12 17v5"/><path d="M5 17h14"/><path d="m7 9 5-7 5 7"/><path d="M8 9h8l1 8H7l1-8Z"/>');
	if (action === 'toggleReadingDirection') return svg('<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>');
	if (action === 'toggleBookMode') return svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z"/>');
	if (action === 'rotate') return svg('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>');
	if (action === 'rotate180') return svg('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/><path d="M8 12h8"/><path d="M16 8v8"/>');
	if (action === 'toggleSinglePanoramaView') return svg('<path d="M12 2v20"/><path d="M2 12h20"/><rect width="18" height="18" x="3" y="3" rx="2"/>');

	if (action === 'openFile') return svg('<path d="M20 20a2 2 0 0 0 2-2V8h-9l-2-3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2Z"/>');
	if (action === 'closeFile') return svg('<path d="M20 20a2 2 0 0 0 2-2V8h-9l-2-3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2Z"/><path d="m9.5 10.5 5 5"/><path d="m14.5 10.5-5 5"/>');
	if (action === 'deleteFile') return svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>');
	if (action === 'deleteCurrentPage') return svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 15h6"/>');

	if (action === 'toggleAutoUpscale') return svg('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>');
	if (action === 'slideshowToggle' || action === 'slideshowPlayPause') return svg('<path d="m8 5 11 7-11 7V5Z"/>');
	if (action === 'slideshowStop') return svg('<rect width="14" height="14" x="5" y="5" rx="2"/>');
	if (action === 'slideshowSkip') return svg('<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>');

	if (action.startsWith('openRadialMenu.')) return svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/>');

	return svg('<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1A1.7 1.7 0 0 0 21 10h0a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>');
}
