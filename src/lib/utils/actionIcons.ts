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
