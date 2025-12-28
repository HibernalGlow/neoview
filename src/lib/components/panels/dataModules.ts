/**
 * DataSettingsPanel 数据模块定义
 * 从 DataSettingsPanel.svelte 提取的常量和类型
 */

/** 数据模块 ID */
export type DataModuleId =
	| 'nativeSettings'
	| 'keybindings'
	| 'emmConfig'
	| 'fileBrowserSort'
	| 'uiState'
	| 'panelsLayout'
	| 'bookmarks'
	| 'history'
	| 'historySettings'
	| 'searchHistory'
	| 'upscaleSettings'
	| 'insightsCards'
	| 'folderPanelSettings'
	| 'folderRatings'
	| 'customThemes'
	| 'performanceSettings';

/** 数据模块行定义 */
export interface DataModuleRow {
	id: DataModuleId;
	name: string;
	panel: string;
	storage: string;
	description: string;
	defaultExport: boolean;
	defaultImport: boolean;
}

/** 默认数据模块列表 */
export const DEFAULT_DATA_MODULES: DataModuleRow[] = [
	{
		id: 'keybindings',
		name: '快捷键与操作绑定',
		panel: '操作绑定面板',
		storage: 'localStorage: neoview-keybindings',
		description: '所有键盘/鼠标/触摸/区域绑定',
		defaultExport: true,
		defaultImport: true
	},
	{
		id: 'emmConfig',
		name: 'EMM 配置',
		panel: 'EMM / 元数据面板',
		storage: 'localStorage: neoview-emm-*',
		description: 'EMM 数据库、翻译字典路径及标签显示模式',
		defaultExport: true,
		defaultImport: true
	},
	{
		id: 'fileBrowserSort',
		name: '文件浏览排序',
		panel: '文件浏览器',
		storage: 'fileBrowserStore + 本地配置',
		description: '文件列表的排序字段与顺序',
		defaultExport: true,
		defaultImport: true
	},
	{
		id: 'uiState',
		name: 'UI 状态',
		panel: '查看器 / UI',
		storage: 'localStorage: neoview-ui-*',
		description: '界面状态（工具栏、布局、小部件状态等）',
		defaultExport: true,
		defaultImport: true
	},
	{
		id: 'panelsLayout',
		name: '面板与边栏布局',
		panel: '边栏管理 / Layout',
		storage: 'localStorage: neoview-panels / neoview-sidebars / neoview-sidebar-management',
		description: '面板开关、位置与边栏布局',
		defaultExport: true,
		defaultImport: true
	},
	{
		id: 'bookmarks',
		name: '书签',
		panel: '书签面板',
		storage: 'localStorage: neoview-bookmarks',
		description: '收藏的书籍/文件/文件夹（包含创建时间）',
		defaultExport: true,
		defaultImport: true
	},
	{
		id: 'history',
		name: '历史记录',
		panel: '历史记录面板',
		storage: 'localStorage: neoview-history',
		description: '最近阅读记录（默认不导出）',
		defaultExport: false,
		defaultImport: false
	},
	{
		id: 'historySettings',
		name: '历史/书签同步设置',
		panel: '历史记录 / 书签面板',
		storage: 'localStorage: neoview-history-settings',
		description: '选中历史或书签时是否同步文件树',
		defaultExport: true,
		defaultImport: true
	},
	{
		id: 'searchHistory',
		name: '搜索历史',
		panel: '文件 / 书签 / 历史搜索',
		storage: 'localStorage: neoview-*-search-history',
		description: '各列表搜索历史（默认不导出）',
		defaultExport: false,
		defaultImport: false
	},
	{
		id: 'upscaleSettings',
		name: '超分面板设置',
		panel: 'UpscalePanel',
		storage: 'localStorage: pyo3_upscale_settings',
		description: '超分模型、并发、条件规则等',
		defaultExport: true,
		defaultImport: true
	},
	{
		id: 'insightsCards',
		name: '洞察面板卡片',
		panel: '洞察面板',
		storage: 'localStorage: neoview-insights-cards',
		description: '洞察面板卡片顺序与折叠状态',
		defaultExport: true,
		defaultImport: true
	},
	{
		id: 'folderPanelSettings',
		name: '文件夹面板设置',
		panel: '文件夹面板',
		storage: 'localStorage: neoview-homepage-path, neoview-folder-panel',
		description: '主页路径、视图样式、快速文件夹目标等',
		defaultExport: true,
		defaultImport: true
	},
	{
		id: 'folderRatings',
		name: 'EMM文件夹评分缓存',
		panel: 'EMM / 文件夹面板',
		storage: 'localStorage: neoview-emm-folder-ratings',
		description: '文件夹平均评分缓存（可重建）',
		defaultExport: false,
		defaultImport: false
	},
	{
		id: 'customThemes',
		name: '自定义主题',
		panel: '外观 / 主题面板',
		storage: 'localStorage: custom-themes',
		description: '用户自定义的配色主题列表',
		defaultExport: true,
		defaultImport: true
	},
	{
		id: 'performanceSettings',
		name: '性能设置（后端）',
		panel: '性能设置面板',
		storage: 'Tauri 后端配置',
		description: 'Tauri 性能参数（缓存、预加载、线程等）',
		defaultExport: true,
		defaultImport: true
	}
];
