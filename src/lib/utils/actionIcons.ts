import type { Component } from 'svelte';
import {
	Activity,
	ArrowLeft,
	ArrowLeftRight,
	ArrowRight,
	Archive,
	BarChart3,
	Bell,
	BookOpen,
	Bookmark,
	Bot,
	Boxes,
	Calendar,
	ChartNoAxesGantt,
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
	CircleDot,
	Clock,
	Cpu,
	Crop,
	Database,
	Eye,
	FastForward,
	File,
	FileMinus,
	FileText,
	FileX,
	Flame,
	Folder,
	FolderOpen,
	Fullscreen,
	Gauge,
	Globe,
	HardDrive,
	Heart,
	HelpCircle,
	History,
	Image,
	Images,
	Info,
	Languages,
	Layers,
	Layout,
	LayoutGrid,
	List,
	ListChecks,
	Loader,
	Maximize2,
	Mic,
	Monitor,
	MousePointer as MousePointerIcon,
	Network,
	Palette,
	PanelLeft as PanelLeftIcon,
	PanelRight as PanelRightIcon,
	Pause,
	PieChart,
	Pin,
	Play,
	RefreshCw,
	Repeat,
	Rewind,
	RotateCw,
	Scaling,
	Scan,
	ScanSearch,
	Settings2 as SettingsIcon,
	SkipBack,
	SkipForward,
	Sliders,
	Sparkles,
	Square,
	Star,
	StepForward,
	Tag,
	Tags,
	Target as TargetIcon,
	TestTube,
	Timer,
	TrendingUp,
	Trash2,
	Volume1,
	Volume2,
	VolumeX,
	ZoomIn,
	ZoomOut,
	Zap
} from '@lucide/svelte';
import { cardRegistry } from '$lib/cards/registry';
import { iconMap, type IconName } from '$lib/utils/iconMap';

const CARD_TOGGLE_PREFIX = 'card.toggle.';

const cardActionIconMap: Record<string, Component> = {
	Activity,
	Archive,
	BarChart3,
	Bell,
	BookOpen,
	Bookmark,
	Bot,
	Boxes,
	Calendar,
	ChartNoAxesGantt,
	Clock,
	Cpu,
	Crop,
	Database,
	Eye,
	FastForward,
	File,
	FileText,
	Flame,
	Folder,
	FolderOpen,
	Gauge,
	Globe,
	HardDrive,
	Heart,
	HelpCircle,
	History,
	Image,
	Images,
	Info,
	Languages,
	LayoutGrid,
	Layers,
	List,
	ListChecks,
	Loader,
	Mic,
	Monitor,
	Network,
	Palette,
	PanelLeft: PanelLeftIcon,
	PieChart,
	Play,
	RefreshCw,
	Repeat,
	ScanSearch,
	Settings: SettingsIcon,
	Settings2: SettingsIcon,
	Sliders,
	Sparkles,
	Star,
	Tag,
	Tags,
	TestTube,
	Timer,
	TrendingUp,
	Zap
};

function getCardIdFromAction(action: string): string | null {
	if (!action.startsWith(CARD_TOGGLE_PREFIX)) return null;
	const cardId = action.slice(CARD_TOGGLE_PREFIX.length);
	return cardId.length > 0 ? cardId : null;
}

function getCardActionIcon(action: string): Component | null {
	const cardId = getCardIdFromAction(action);
	if (!cardId) return null;
	const icon = cardRegistry[cardId]?.icon;
	if (typeof icon !== 'string') return (icon as Component | undefined) ?? null;
	return cardActionIconMap[icon] ?? iconMap[icon as IconName] ?? SettingsIcon;
}

export function getActionIcon(action: string, _category = ''): Component {
	const cardIcon = getCardActionIcon(action);
	if (cardIcon) return cardIcon;

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
	if (action === 'upscale.toggleTile') return Sliders;

	if (action === 'slideshowToggle') return Play;
	if (action === 'slideshowPlayPause') return Pause;
	if (action === 'slideshowStop') return Square;
	if (action === 'slideshowSkip') return StepForward;

	if (action.startsWith('openRadialMenu.')) return CircleDot;

	if (action === 'viewer.toggleDynamicBackground') return Sparkles;
	if (action === 'viewer.cycleBackgroundMode') return Palette;
	if (action === 'viewer.togglePageInfo') return Info;
	if (action === 'viewer.toggleProgressBar') return Gauge;
	if (action === 'viewer.togglePageSwitchToast') return Bell;
	if (action === 'viewer.toggleBookSwitchToast') return Bell;
	if (action === 'viewer.toggleBoundaryToast') return Bell;
	if (action === 'viewer.toggleInfoOverlay') return Info;
	if (action === 'viewer.toggleHoverScroll') return MousePointerIcon;
	if (action === 'viewer.toggleSidebarControl') return PanelLeftIcon;
	if (action === 'viewer.toggleCursorAutoHide') return MousePointerIcon;
	if (action === 'viewer.toggleProgressBarGlow') return Sparkles;
	if (action === 'viewer.toggleRenderMode') return Layers;
	if (action === 'viewer.toggleAutoRotate') return RotateCw;

	return SettingsIcon;
}

function svg(paths: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

const iconSvgPaths: Record<string, string> = {
	Activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
	Archive:
		'<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
	BarChart3: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
	Bell: '<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>',
	BookOpen:
		'<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V5a2 2 0 0 1 2-2h5a3 3 0 0 1 3 3 3 3 0 0 1 3-3h5a2 2 0 0 1 2 2v12a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
	Bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
	Bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M9 13v2"/><path d="M15 13v2"/>',
	Boxes:
		'<path d="M2.97 12.92 12 17.5l9.03-4.58"/><path d="M12 22V12"/><path d="m7 10-4.03 2.92L12 17.5l9.03-4.58L17 10"/><path d="m7 10 5 2.5 5-2.5"/><path d="M7 10V5l5-2.5L17 5v5"/>',
	Calendar:
		'<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
	ChartNoAxesGantt: '<path d="M8 6h10"/><path d="M6 12h9"/><path d="M11 18h7"/>',
	Clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
	Cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
	Crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
	Database:
		'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
	Eye: '<path d="M2.1 12S5.4 5 12 5s9.9 7 9.9 7-3.3 7-9.9 7-9.9-7-9.9-7Z"/><circle cx="12" cy="12" r="3"/>',
	FastForward: '<path d="m13 19 7-7-7-7v14Z"/><path d="m5 19 7-7-7-7v14Z"/>',
	File: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v6h6"/>',
	FileText:
		'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v6h6"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
	Flame:
		'<path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.4 0 2.5-1.1 2.5-2.5 0-.9-.4-1.6-1-2.1-.6-.5-1.5-1.2-1.5-2.4 0-.8.4-1.5 1-2 2.2 1.4 4 4.2 4 7a4 4 0 1 1-8 0Z"/><path d="M12 2C9 5 5 7.5 5 13a7 7 0 0 0 14 0c0-4.5-2.5-7.5-7-11Z"/>',
	Folder: '<path d="M20 20a2 2 0 0 0 2-2V8h-9l-2-3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2Z"/>',
	FolderOpen:
		'<path d="m6 14 1.5-3H22l-3 7a2 2 0 0 1-2 1H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v3"/>',
	Gauge: '<path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
	Globe:
		'<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 0 20"/><path d="M12 2a15.3 15.3 0 0 0 0 20"/>',
	HardDrive:
		'<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',
	Heart:
		'<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .8-4.5 2.3C10.5 3.8 9.3 3 7.5 3A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
	HelpCircle:
		'<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4"/><path d="M12 17h.01"/>',
	History: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
	Image:
		'<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
	Images:
		'<path d="M18 22H4a2 2 0 0 1-2-2V6"/><path d="m22 13-1.3-1.3a2 2 0 0 0-2.8 0L11 18"/><rect width="16" height="16" x="6" y="2" rx="2"/><circle cx="12" cy="8" r="2"/>',
	Info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
	Languages:
		'<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
	LayoutGrid:
		'<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
	Layers:
		'<path d="m12.8 2.6 8.4 4.7a1 1 0 0 1 0 1.8l-8.4 4.7a1.7 1.7 0 0 1-1.6 0L2.8 9.1a1 1 0 0 1 0-1.8l8.4-4.7a1.7 1.7 0 0 1 1.6 0Z"/><path d="m22 12-9.2 5.2a1.7 1.7 0 0 1-1.6 0L2 12"/><path d="m22 17-9.2 5.2a1.7 1.7 0 0 1-1.6 0L2 17"/>',
	List: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
	ListChecks:
		'<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
	Loader:
		'<path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/>',
	Mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
	Monitor:
		'<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
	Network:
		'<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 8v4"/>',
	Palette:
		'<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6 2 11.5 2 16 5.5 20 10 20h1.5a2.5 2.5 0 0 0 0-5H11a2 2 0 0 1 0-4h1a10 10 0 0 0 7-3 6 6 0 0 0-7-6Z"/>',
	PanelLeft: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
	PieChart:
		'<path d="M21 12c.6 0 1-.4 1-1a10 10 0 0 0-10-10c-.6 0-1 .4-1 1v9c0 .6.4 1 1 1Z"/><path d="M21 12a9 9 0 1 1-9-9"/>',
	Play: '<path d="m8 5 11 7-11 7V5Z"/>',
	RefreshCw:
		'<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
	ScanSearch:
		'<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/><path d="m16 16-1.9-1.9"/>',
	Settings:
		'<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1A1.7 1.7 0 0 0 21 10h0a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
	Settings2:
		'<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
	Sliders:
		'<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M8 10v4"/><path d="M21 5h-3"/><path d="M21 19h-1"/><path d="M8 12H3"/>',
	Sparkles:
		'<path d="m12 3-1.9 5.8L4 11l6.1 2.2L12 19l1.9-5.8L20 11l-6.1-2.2Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/>',
	Star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21 7 14.2 2 9.3l6.9-1Z"/>',
	Tag: '<path d="M12.6 2H2v10.6L13.4 24 24 13.4Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
	Tags: '<path d="M9.7 3H3v6.7L14.3 21 21 14.3Z"/><path d="M14 3h3.7L23 8.3V12"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
	TestTube:
		'<path d="M14.5 2v6.5l4.8 8.3a3.5 3.5 0 0 1-3 5.2H7.7a3.5 3.5 0 0 1-3-5.2l4.8-8.3V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
	Timer: '<path d="M10 2h4"/><path d="M12 14l3-3"/><circle cx="12" cy="14" r="8"/>',
	TrendingUp: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
	Zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>'
};

function getCardActionIconSvg(action: string): string | null {
	const cardId = getCardIdFromAction(action);
	if (!cardId) return null;
	const icon = cardRegistry[cardId]?.icon;
	if (typeof icon !== 'string') return null;
	return iconSvgPaths[icon] ? svg(iconSvgPaths[icon]) : null;
}

export function getActionIconSvg(action: string): string {
	const cardSvg = getCardActionIconSvg(action);
	if (cardSvg) return cardSvg;

	if (action === 'nextPage') return svg('<path d="m9 18 6-6-6-6"/>');
	if (action === 'prevPage') return svg('<path d="m15 18-6-6 6-6"/>');
	if (action === 'firstPage') return svg('<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>');
	if (action === 'lastPage') return svg('<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>');
	if (action === 'pageLeft') return svg('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>');
	if (action === 'pageRight') return svg('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>');
	if (action === 'nextBook') return svg('<path d="m5 4 10 8-10 8V4Z"/><path d="M19 5v14"/>');
	if (action === 'prevBook') return svg('<path d="M5 5v14"/><path d="m19 4-10 8 10 8V4Z"/>');

	if (action === 'zoomIn')
		return svg(
			'<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>'
		);
	if (action === 'zoomOut')
		return svg('<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/>');
	if (action === 'fitWindow')
		return svg(
			'<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'
		);
	if (action === 'actualSize')
		return svg(
			'<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>'
		);
	if (action === 'toggleTemporaryFitZoom')
		return svg(
			'<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>'
		);

	if (action === 'videoPlayPause') return svg('<path d="m8 5 11 7-11 7V5Z"/><path d="M5 5v14"/>');
	if (action === 'videoSeekForward')
		return svg('<path d="m13 19 7-7-7-7v14Z"/><path d="m5 19 7-7-7-7v14Z"/>');
	if (action === 'videoSeekBackward')
		return svg('<path d="m11 19-7-7 7-7v14Z"/><path d="m19 19-7-7 7-7v14Z"/>');
	if (action === 'videoToggleMute')
		return svg('<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m23 9-6 6"/><path d="m17 9 6 6"/>');
	if (action === 'videoToggleLoopMode')
		return svg(
			'<path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'
		);
	if (action === 'videoVolumeUp')
		return svg(
			'<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M19.1 4.9a10 10 0 0 1 0 14.2"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>'
		);
	if (action === 'videoVolumeDown')
		return svg('<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>');
	if (action === 'videoSpeedUp' || action === 'videoSpeedDown')
		return svg('<path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>');
	if (action === 'videoSpeedToggle')
		return svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>');
	if (action === 'videoSeekModeToggle') return svg('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>');

	if (action === 'fullscreen')
		return svg(
			'<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'
		);
	if (action === 'toggleLeftSidebar')
		return svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>');
	if (action === 'toggleRightSidebar')
		return svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>');
	if (action === 'toggleTopToolbarPin' || action === 'toggleBottomThumbnailBarPin')
		return svg(
			'<path d="M12 17v5"/><path d="M5 17h14"/><path d="m7 9 5-7 5 7"/><path d="M8 9h8l1 8H7l1-8Z"/>'
		);
	if (action === 'toggleReadingDirection')
		return svg(
			'<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>'
		);
	if (action === 'toggleBookMode')
		return svg(
			'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z"/>'
		);
	if (action === 'rotate') return svg('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>');
	if (action === 'rotate180')
		return svg(
			'<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/><path d="M8 12h8"/><path d="M16 8v8"/>'
		);
	if (action === 'toggleSinglePanoramaView')
		return svg(
			'<path d="M12 2v20"/><path d="M2 12h20"/><rect width="18" height="18" x="3" y="3" rx="2"/>'
		);

	if (action === 'openFile')
		return svg('<path d="M20 20a2 2 0 0 0 2-2V8h-9l-2-3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2Z"/>');
	if (action === 'closeFile')
		return svg(
			'<path d="M20 20a2 2 0 0 0 2-2V8h-9l-2-3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2Z"/><path d="m9.5 10.5 5 5"/><path d="m14.5 10.5-5 5"/>'
		);
	if (action === 'deleteFile')
		return svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>');
	if (action === 'deleteCurrentPage')
		return svg(
			'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 15h6"/>'
		);

	if (action === 'toggleAutoUpscale') return svg('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>');
	if (action === 'upscale.toggleTile') return svg(iconSvgPaths.Sliders);
	if (action === 'slideshowToggle' || action === 'slideshowPlayPause')
		return svg('<path d="m8 5 11 7-11 7V5Z"/>');
	if (action === 'slideshowStop') return svg('<rect width="14" height="14" x="5" y="5" rx="2"/>');
	if (action === 'slideshowSkip') return svg('<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>');

	if (action.startsWith('openRadialMenu.'))
		return svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/>');

	if (action === 'viewer.toggleDynamicBackground') return svg(iconSvgPaths.Sparkles);
	if (action === 'viewer.cycleBackgroundMode') return svg(iconSvgPaths.Palette);
	if (action === 'viewer.togglePageInfo') return svg(iconSvgPaths.Info);
	if (action === 'viewer.toggleProgressBar') return svg(iconSvgPaths.Gauge);
	if (
		action === 'viewer.togglePageSwitchToast' ||
		action === 'viewer.toggleBookSwitchToast' ||
		action === 'viewer.toggleBoundaryToast'
	) {
		return svg(iconSvgPaths.Bell);
	}
	if (action === 'viewer.toggleInfoOverlay') return svg(iconSvgPaths.Info);
	if (action === 'viewer.toggleHoverScroll')
		return svg('<path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M5 19h14"/>');
	if (action === 'viewer.toggleSidebarControl') return svg(iconSvgPaths.PanelLeft);
	if (action === 'viewer.toggleCursorAutoHide')
		return svg('<path d="m3 3 18 18"/><path d="M5.6 5.6 12 22l2.2-7.8L22 12 5.6 5.6Z"/>');
	if (action === 'viewer.toggleProgressBarGlow') return svg(iconSvgPaths.Sparkles);
	if (action === 'viewer.toggleRenderMode') return svg(iconSvgPaths.Layers);
	if (action === 'viewer.toggleAutoRotate')
		return svg('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>');

	return svg(
		'<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1A1.7 1.7 0 0 0 21 10h0a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'
	);
}
