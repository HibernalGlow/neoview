import {
	Bookmark,
	Bot,
	ChartNoAxesGantt,
	File,
	FileText,
	Folder,
	HelpCircle,
	History,
	Info,
	ListMusic,
	Settings,
	Settings2,
	Sparkles,
	Tag,
	Timer
} from '@lucide/svelte';
import type { Component } from 'svelte';

export type IconName =
	| 'Bookmark'
	| 'Bot'
	| 'ChartNoAxesGantt'
	| 'File'
	| 'FileText'
	| 'Folder'
	| 'HelpCircle'
	| 'History'
	| 'Info'
	| 'ListMusic'
	| 'Settings'
	| 'Settings2'
	| 'Sparkles'
	| 'Tag'
	| 'Timer';

export const iconMap: Record<IconName, Component> = {
	Bookmark,
	Bot,
	ChartNoAxesGantt,
	File,
	FileText,
	Folder,
	HelpCircle,
	History,
	Info,
	ListMusic,
	Settings,
	Settings2,
	Sparkles,
	Tag,
	Timer
};

export const iconNames = Object.keys(iconMap) as IconName[];
