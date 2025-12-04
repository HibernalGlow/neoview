/**
 * 卡片注册表
 * 统一定义所有卡片的元数据，支持动态发现和跨面板移动
 */
import type { Component } from 'svelte';
import type { PanelId } from '$lib/stores/sidebarConfig.svelte';
import { Eye, Timer, Layers, FolderOpen, FileText, Image, Cpu, History, Tags, Search, Activity, Gauge, Archive, Globe, ListChecks, BarChart3 } from '@lucide/svelte';

// 卡片定义
export interface CardDefinition {
	id: string;
	title: string;
	icon: typeof Eye;
	defaultPanel: PanelId;
	canHide: boolean;
	// 懒加载组件
	component: () => Promise<{ default: Component }>;
}

// 所有卡片注册表
export const cardRegistry: Record<string, CardDefinition> = {
	// ==================== Benchmark 面板卡片 ====================
	'visibility': {
		id: 'visibility',
		title: '可见性监控',
		icon: Eye,
		defaultPanel: 'benchmark',
		canHide: true,
		component: () => import('./benchmark/VisibilityCard.svelte')
	},
	'latency': {
		id: 'latency',
		title: '延迟分析',
		icon: Timer,
		defaultPanel: 'benchmark',
		canHide: true,
		component: () => import('./benchmark/LatencyCard.svelte')
	},
	'renderer': {
		id: 'renderer',
		title: '渲染模式测试',
		icon: Layers,
		defaultPanel: 'benchmark',
		canHide: true,
		component: () => import('./benchmark/RendererCard.svelte')
	},
	'files': {
		id: 'files',
		title: '文件选择',
		icon: FolderOpen,
		defaultPanel: 'benchmark',
		canHide: true,
		component: () => import('./benchmark/FilesCard.svelte')
	},
	'detailed': {
		id: 'detailed',
		title: '详细结果',
		icon: FileText,
		defaultPanel: 'benchmark',
		canHide: true,
		component: () => import('./benchmark/DetailedCard.svelte')
	},
	'loadmode': {
		id: 'loadmode',
		title: '加载模式',
		icon: Cpu,
		defaultPanel: 'benchmark',
		canHide: true,
		component: () => import('./benchmark/LoadModeCard.svelte')
	},
	'archives': {
		id: 'archives',
		title: '压缩包扫描',
		icon: Archive,
		defaultPanel: 'benchmark',
		canHide: true,
		component: () => import('./benchmark/ArchivesCard.svelte')
	},
	'realworld': {
		id: 'realworld',
		title: '实际场景',
		icon: Globe,
		defaultPanel: 'benchmark',
		canHide: true,
		component: () => import('./benchmark/RealWorldCard.svelte')
	},
	'results': {
		id: 'results',
		title: '测试结果',
		icon: ListChecks,
		defaultPanel: 'benchmark',
		canHide: true,
		component: () => import('./benchmark/ResultsCard.svelte')
	},
	'summary': {
		id: 'summary',
		title: '总结',
		icon: BarChart3,
		defaultPanel: 'benchmark',
		canHide: true,
		component: () => import('./benchmark/SummaryCard.svelte')
	},
	
	// ==================== Info 面板卡片 ====================
	'file': {
		id: 'file',
		title: '文件信息',
		icon: FileText,
		defaultPanel: 'info',
		canHide: false,
		component: () => import('./info/FileInfoCard.svelte')
	},
	'image': {
		id: 'image',
		title: '图片信息',
		icon: Image,
		defaultPanel: 'info',
		canHide: true,
		component: () => import('./info/ImageInfoCard.svelte')
	},
	
	// ==================== Properties 面板卡片 ====================
	'basic': {
		id: 'basic',
		title: '基本信息',
		icon: FileText,
		defaultPanel: 'properties',
		canHide: false,
		component: () => import('./properties/BasicCard.svelte')
	},
	'exif': {
		id: 'exif',
		title: 'EXIF 数据',
		icon: Activity,
		defaultPanel: 'properties',
		canHide: true,
		component: () => import('./properties/ExifCard.svelte')
	},
	'histogram': {
		id: 'histogram',
		title: '直方图',
		icon: Gauge,
		defaultPanel: 'properties',
		canHide: true,
		component: () => import('./properties/HistogramCard.svelte')
	},
	
	// ==================== Upscale 面板卡片 ====================
	'model': {
		id: 'model',
		title: '模型选择',
		icon: Cpu,
		defaultPanel: 'upscale',
		canHide: false,
		component: () => import('./upscale/ModelCard.svelte')
	},
	'settings': {
		id: 'settings',
		title: '参数设置',
		icon: Activity,
		defaultPanel: 'upscale',
		canHide: true,
		component: () => import('./upscale/SettingsCard.svelte')
	},
	'preview': {
		id: 'preview',
		title: '预览',
		icon: Image,
		defaultPanel: 'upscale',
		canHide: true,
		component: () => import('./upscale/PreviewCard.svelte')
	},
	'history': {
		id: 'history',
		title: '历史记录',
		icon: History,
		defaultPanel: 'upscale',
		canHide: true,
		component: () => import('./upscale/HistoryCard.svelte')
	},
	
	// ==================== Insights 面板卡片 ====================
	'analysis': {
		id: 'analysis',
		title: '分析',
		icon: Activity,
		defaultPanel: 'insights',
		canHide: false,
		component: () => import('./insights/AnalysisCard.svelte')
	},
	'tags': {
		id: 'tags',
		title: '标签',
		icon: Tags,
		defaultPanel: 'insights',
		canHide: true,
		component: () => import('./insights/TagsCard.svelte')
	},
	'similar': {
		id: 'similar',
		title: '相似图片',
		icon: Search,
		defaultPanel: 'insights',
		canHide: true,
		component: () => import('./insights/SimilarCard.svelte')
	}
};

// 获取面板的默认卡片列表
export function getDefaultCardsForPanel(panelId: PanelId): string[] {
	return Object.values(cardRegistry)
		.filter(card => card.defaultPanel === panelId)
		.map(card => card.id);
}

// 获取卡片定义
export function getCardDefinition(cardId: string): CardDefinition | undefined {
	return cardRegistry[cardId];
}

// 获取所有卡片 ID
export function getAllCardIds(): string[] {
	return Object.keys(cardRegistry);
}
