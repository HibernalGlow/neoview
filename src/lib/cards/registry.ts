/**
 * 卡片注册表
 * 统一定义所有卡片的元数据，支持动态发现和跨面板移动
 */
import type { PanelId } from '$lib/stores/sidebarConfig.svelte';
import { Eye, Timer, Layers, FolderOpen, FileText, Image, Cpu, History, Tags, Search, Activity, Gauge, Archive, Globe, ListChecks, BarChart3, Languages, Settings } from '@lucide/svelte';

// 卡片定义
export interface CardDefinition {
	id: string;
	title: string;
	icon: typeof Eye;
	defaultPanel: PanelId;
	canHide: boolean;
	// 布局选项
	fullHeight?: boolean; // 是否占满剩余高度（用于虚拟列表等）
	hideIcon?: boolean; // 隐藏图标
	hideTitle?: boolean; // 隐藏标题
	hideHeader?: boolean; // 完全隐藏头部
	compact?: boolean; // 紧凑模式
	orientation?: 'vertical' | 'horizontal'; // 展开方向
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
	},
	'latency': {
		id: 'latency',
		title: '延迟分析',
		icon: Timer,
		defaultPanel: 'benchmark',
		canHide: true,

	},
	'renderer': {
		id: 'renderer',
		title: '渲染模式测试',
		icon: Layers,
		defaultPanel: 'benchmark',
		canHide: true,

	},
	'files': {
		id: 'files',
		title: '文件选择',
		icon: FolderOpen,
		defaultPanel: 'benchmark',
		canHide: true,

	},
	'detailed': {
		id: 'detailed',
		title: '详细结果',
		icon: FileText,
		defaultPanel: 'benchmark',
		canHide: true,

	},
	'loadmode': {
		id: 'loadmode',
		title: '加载模式',
		icon: Cpu,
		defaultPanel: 'benchmark',
		canHide: true,

	},
	'archives': {
		id: 'archives',
		title: '压缩包扫描',
		icon: Archive,
		defaultPanel: 'benchmark',
		canHide: true,

	},
	'realworld': {
		id: 'realworld',
		title: '实际场景',
		icon: Globe,
		defaultPanel: 'benchmark',
		canHide: true,

	},
	'imageSource': {
		id: 'imageSource',
		title: '图像源对比',
		icon: Activity,
		defaultPanel: 'benchmark',
		canHide: true,
	},
	'protocolTest': {
		id: 'protocolTest',
		title: '协议测试',
		icon: Globe,
		defaultPanel: 'benchmark',
		canHide: true,
	},
	'results': {
		id: 'results',
		title: '测试结果',
		icon: ListChecks,
		defaultPanel: 'benchmark',
		canHide: true,

	},
	'summary': {
		id: 'summary',
		title: '总结',
		icon: BarChart3,
		defaultPanel: 'benchmark',
		canHide: true,

	},
	'pipelineLatency': {
		id: 'pipelineLatency',
		title: '实时延迟监控',
		icon: Activity,
		defaultPanel: 'benchmark',
		canHide: true,
	},
	'transcodeBenchmark': {
		id: 'transcodeBenchmark',
		title: '超分预处理转码',
		icon: Gauge,
		defaultPanel: 'benchmark',
		canHide: true,
	},
	'thumbnailLatency': {
		id: 'thumbnailLatency',
		title: '目录加载延迟',
		icon: Timer,
		defaultPanel: 'benchmark',
		canHide: true,
	},
	'systemMonitor': {
		id: 'systemMonitor',
		title: '系统资源监控',
		icon: Activity,
		defaultPanel: 'insights',
		canHide: true,
	},

	// ==================== Info 面板卡片 ====================
	'bookInfo': {
		id: 'bookInfo',
		title: '书籍信息',
		icon: FileText,
		defaultPanel: 'info',
		canHide: false,
	},
	'infoOverlay': {
		id: 'infoOverlay',
		title: '信息悬浮窗',
		icon: Eye,
		defaultPanel: 'info',
		canHide: true,
	},
	'switchToast': {
		id: 'switchToast',
		title: '切换提示',
		icon: Activity,
		defaultPanel: 'info',
		canHide: true,
	},
	'imageInfo': {
		id: 'imageInfo',
		title: '图像信息',
		icon: Image,
		defaultPanel: 'info',
		canHide: true,
	},
	'storage': {
		id: 'storage',
		title: '存储信息',
		icon: Archive,
		defaultPanel: 'info',
		canHide: true,
	},
	'time': {
		id: 'time',
		title: '时间信息',
		icon: Timer,
		defaultPanel: 'info',
		canHide: true,
	},
	'sidebarControl': {
		id: 'sidebarControl',
		title: '边栏控制',
		icon: Layers,
		defaultPanel: 'info',
		canHide: true,
	},

	// ==================== Properties 面板卡片 ====================
	'emmTags': {
		id: 'emmTags',
		title: 'EMM 标签',
		icon: Tags,
		defaultPanel: 'properties',
		canHide: false,
	},
	'bookSettings': {
		id: 'bookSettings',
		title: '本书设置',
		icon: FileText,
		defaultPanel: 'properties',
		canHide: true,
	},
	'folderRatings': {
		id: 'folderRatings',
		title: '文件夹平均评分',
		icon: Activity,
		defaultPanel: 'properties',
		canHide: true,
	},
	'favoriteTags': {
		id: 'favoriteTags',
		title: '收藏标签快选',
		icon: Search,
		defaultPanel: 'properties',
		canHide: true,
	},
	'emmSync': {
		id: 'emmSync',
		title: 'EMM 同步',
		icon: Gauge,
		defaultPanel: 'properties',
		canHide: true,
	},
	'thumbnailMaintenance': {
		id: 'thumbnailMaintenance',
		title: '缩略图维护',
		icon: Image,
		defaultPanel: 'properties',
		canHide: true,
	},
	'emmRawData': {
		id: 'emmRawData',
		title: 'EMM 数据库记录',
		icon: FileText,
		defaultPanel: 'properties',
		canHide: true,
	},
	'emmConfig': {
		id: 'emmConfig',
		title: 'EMM 配置',
		icon: Settings,
		defaultPanel: 'properties',
		canHide: true,
	},
	'fileListTagDisplay': {
		id: 'fileListTagDisplay',
		title: '文件列表标签',
		icon: Tags,
		defaultPanel: 'properties',
		canHide: true,
	},

	// ==================== Upscale 面板卡片 ====================
	'upscaleControl': {
		id: 'upscaleControl',
		title: '超分控制',
		icon: Activity,
		defaultPanel: 'upscale',
		canHide: false,
	},
	'upscaleModel': {
		id: 'upscaleModel',
		title: '模型选择',
		icon: Cpu,
		defaultPanel: 'upscale',
		canHide: false,
	},
	'upscaleStatus': {
		id: 'upscaleStatus',
		title: '处理状态',
		icon: Activity,
		defaultPanel: 'upscale',
		canHide: true,
	},
	'upscaleCache': {
		id: 'upscaleCache',
		title: '缓存管理',
		icon: History,
		defaultPanel: 'upscale',
		canHide: true,
	},
	'upscaleConditions': {
		id: 'upscaleConditions',
		title: '条件超分',
		icon: Activity,
		defaultPanel: 'upscale',
		canHide: true,
	},
	'progressiveUpscale': {
		id: 'progressiveUpscale',
		title: '预超分',
		icon: Timer,
		defaultPanel: 'upscale',
		canHide: true,
	},

	// ==================== History 面板卡片 ====================
	'historyList': {
		id: 'historyList',
		title: '历史记录',
		icon: Activity,
		defaultPanel: 'history',
		canHide: false,
		fullHeight: true,
		hideHeader: true,
	},

	// ==================== Bookmark 面板卡片 ====================
	'bookmarkList': {
		id: 'bookmarkList',
		title: '书签列表',
		icon: Activity,
		defaultPanel: 'bookmark',
		canHide: false,
		fullHeight: true,
		hideHeader: true,
	},

	// ==================== PageList 面板卡片 ====================
	'pageListMain': {
		id: 'pageListMain',
		title: '页面列表',
		icon: FileText,
		defaultPanel: 'pageList',
		canHide: false,
		fullHeight: true,
		hideHeader: true,
	},

	// ==================== Insights 面板卡片 ====================
	'dailyTrend': {
		id: 'dailyTrend',
		title: '最近 7 日阅读趋势',
		icon: Activity,
		defaultPanel: 'insights',
		canHide: false,
	},
	'readingStreak': {
		id: 'readingStreak',
		title: '连续阅读 Streak',
		icon: Activity,
		defaultPanel: 'insights',
		canHide: true,
	},
	'readingHeatmap': {
		id: 'readingHeatmap',
		title: '阅读时段热力图',
		icon: Activity,
		defaultPanel: 'insights',
		canHide: true,
	},
	'bookmarkOverview': {
		id: 'bookmarkOverview',
		title: '书签概览',
		icon: Tags,
		defaultPanel: 'insights',
		canHide: true,
	},
	'sourceBreakdown': {
		id: 'sourceBreakdown',
		title: '来源拆分',
		icon: Search,
		defaultPanel: 'insights',
		canHide: true,
	},
	'emmTagsHot': {
		id: 'emmTagsHot',
		title: 'EMM 标签热度',
		icon: Tags,
		defaultPanel: 'insights',
		canHide: true,
	},

	// ==================== Folder 面板卡片 ====================
	'folderMain': {
		id: 'folderMain',
		title: '文件夹',
		icon: FolderOpen,
		defaultPanel: 'folder',
		canHide: false,
		fullHeight: true,
		hideHeader: true, // 隐藏卡片头部，面板本身有完整 UI
	},

	// ==================== AI 面板卡片 ====================
	'aiTitleTranslation': {
		id: 'aiTitleTranslation',
		title: '标题翻译',
		icon: Languages,
		defaultPanel: 'ai',
		canHide: false,
	},
	'aiServiceConfig': {
		id: 'aiServiceConfig',
		title: '翻译服务配置',
		icon: Settings,
		defaultPanel: 'ai',
		canHide: true,
	},
	'aiTranslationCache': {
		id: 'aiTranslationCache',
		title: '翻译缓存',
		icon: History,
		defaultPanel: 'ai',
		canHide: true,
	},
	'aiTranslationTest': {
		id: 'aiTranslationTest',
		title: '翻译测试',
		icon: Languages,
		defaultPanel: 'ai',
		canHide: true,
	},
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
