/**
 * 快捷键绑定系统 - 键位映射模块
 * 定义默认键位配置和操作绑定
 */

import type { ActionBinding } from './types';

/** 导航相关的默认绑定 */
const navigationBindings: ActionBinding[] = [
	{
		action: 'nextPage',
		name: '下一页',
		category: '导航',
		description: '翻到下一页',
		bindings: []
	},
	{
		action: 'prevPage',
		name: '上一页',
		category: '导航',
		description: '翻到上一页',
		bindings: []
	},
	{
		action: 'firstPage',
		name: '第一页',
		category: '导航',
		description: '跳转到第一页',
		bindings: []
	},
	{
		action: 'lastPage',
		name: '最后一页',
		category: '导航',
		description: '跳转到最后一页',
		bindings: []
	},
	{
		action: 'pageLeft',
		name: '向左翻页',
		category: '导航',
		description: '向左翻页（方向性翻页，不受阅读方向影响）',
		bindings: []
	},
	{
		action: 'pageRight',
		name: '向右翻页',
		category: '导航',
		description: '向右翻页（方向性翻页，不受阅读方向影响）',
		bindings: []
	},
	{
		action: 'nextBook',
		name: '下一个书籍',
		category: '导航',
		description: '切换到排序列表中的下一个书籍/文件夹',
		bindings: []
	},
	{
		action: 'prevBook',
		name: '上一个书籍',
		category: '导航',
		description: '切换到排序列表中的上一个书籍/文件夹',
		bindings: []
	}
];


/** 缩放相关的默认绑定 */
const zoomBindings: ActionBinding[] = [
	{
		action: 'zoomIn',
		name: '放大',
		category: '缩放',
		description: '放大图片',
		bindings: []
	},
	{
		action: 'zoomOut',
		name: '缩小',
		category: '缩放',
		description: '缩小图片',
		bindings: []
	},
	{
		action: 'fitWindow',
		name: '适应窗口',
		category: '缩放',
		description: '图片适应窗口大小',
		bindings: []
	},
	{
		action: 'actualSize',
		name: '实际大小',
		category: '缩放',
		description: '显示图片实际尺寸',
		bindings: []
	},
	{
		action: 'toggleTemporaryFitZoom',
		name: '临时适应窗口',
		category: '缩放',
		description: '在当前缩放与适应窗口之间临时切换（尊重缩放锁定）',
		bindings: []
	}
];

/** 视图相关的默认绑定 */
const viewBindings: ActionBinding[] = [
	{
		action: 'fullscreen',
		name: '全屏',
		category: '视图',
		description: '切换全屏模式',
		bindings: []
	},
	{
		action: 'toggleLeftSidebar',
		name: '左侧边栏',
		category: '视图',
		description: '显示/隐藏侧边栏',
		bindings: []
	},
	{
		action: 'toggleRightSidebar',
		name: '右侧边栏',
		category: '视图',
		description: '显示/隐藏右侧边栏（信息/属性/超分）',
		bindings: []
	},
	{
		action: 'toggleTopToolbarPin',
		name: '固定顶部工具栏',
		category: '视图',
		description: '切换顶部工具栏的固定/自动隐藏状态',
		bindings: []
	},
	{
		action: 'toggleBottomThumbnailBarPin',
		name: '固定底部缩略图栏',
		category: '视图',
		description: '切换底部缩略图栏的固定/自动隐藏状态',
		bindings: []
	},
	{
		action: 'toggleReadingDirection',
		name: '阅读方向切换',
		category: '视图',
		description: '在左开/右开阅读方向之间切换',
		bindings: []
	},
	{
		action: 'toggleBookMode',
		name: '书籍模式',
		category: '视图',
		description: '切换单页/双页模式',
		bindings: []
	},
	{
		action: 'rotate',
		name: '旋转',
		category: '视图',
		description: '旋转图片90度',
		bindings: []
	},
	{
		action: 'toggleSinglePanoramaView',
		name: '单页切换',
		category: '视图',
		description: '在其他模式和单页视图模式之间互相切换（视图模式被锁定时不生效）',
		bindings: []
	}
];


/** 文件相关的默认绑定 */
const fileBindings: ActionBinding[] = [
	{
		action: 'openFile',
		name: '打开文件',
		category: '文件',
		description: '打开文件对话框',
		bindings: []
	},
	{
		action: 'closeFile',
		name: '关闭文件',
		category: '文件',
		description: '关闭当前文件',
		bindings: []
	},
	{
		action: 'deleteFile',
		name: '删除文件',
		category: '文件',
		description: '删除当前文件',
		bindings: []
	},
	{
		action: 'deleteCurrentPage',
		name: '删除当前页',
		category: '文件',
		description: '对当前 ZIP 页执行删除（需要启用压缩包文件操作）',
		bindings: []
	}
];

/** 视频相关的默认绑定 */
const videoBindings: ActionBinding[] = [
	{
		action: 'videoPlayPause',
		name: '视频播放/暂停',
		category: '视频',
		description: '播放或暂停当前视频',
		bindings: []
	},
	{
		action: 'videoSeekForward',
		name: '视频快进10秒',
		category: '视频',
		description: '将当前视频快进10秒',
		bindings: []
	},
	{
		action: 'videoSeekBackward',
		name: '视频快退10秒',
		category: '视频',
		description: '将当前视频快退10秒',
		bindings: []
	},
	{
		action: 'videoToggleMute',
		name: '视频静音切换',
		category: '视频',
		description: '切换当前视频的静音状态',
		bindings: []
	},
	{
		action: 'videoToggleLoopMode',
		name: '视频循环模式切换',
		category: '视频',
		description: '在列表循环/单个循环/不循环之间切换',
		bindings: []
	},
	{
		action: 'videoVolumeUp',
		name: '视频音量增加',
		category: '视频',
		description: '提高当前视频的音量',
		bindings: []
	},
	{
		action: 'videoVolumeDown',
		name: '视频音量降低',
		category: '视频',
		description: '降低当前视频的音量',
		bindings: []
	},
	{
		action: 'videoSpeedUp',
		name: '视频倍速增加',
		category: '视频',
		description: '提高当前视频的播放速度',
		bindings: []
	},
	{
		action: 'videoSpeedDown',
		name: '视频倍速降低',
		category: '视频',
		description: '降低当前视频的播放速度',
		bindings: []
	},
	{
		action: 'videoSpeedToggle',
		name: '视频倍速切换',
		category: '视频',
		description: '在当前倍速和1倍速之间切换',
		bindings: []
	},
	{
		action: 'videoSeekModeToggle',
		name: '视频快进模式切换',
		category: '视频',
		description: '开启后翻页键将作为视频快进/快退使用',
		bindings: []
	}
];


/** 超分相关的默认绑定 */
const upscaleBindings: ActionBinding[] = [
	{
		action: 'toggleAutoUpscale',
		name: '自动超分开关',
		category: '超分',
		description: '开启或关闭自动超分（全局超分设置）',
		bindings: []
	}
];

/** 幻灯片相关的默认绑定 */
const slideshowBindings: ActionBinding[] = [
	{
		action: 'slideshowToggle',
		name: '幻灯片开关',
		category: '幻灯片',
		description: '开启或关闭幻灯片播放模式',
		bindings: []
	},
	{
		action: 'slideshowPlayPause',
		name: '幻灯片播放/暂停',
		category: '幻灯片',
		description: '播放或暂停幻灯片',
		bindings: []
	},
	{
		action: 'slideshowStop',
		name: '幻灯片停止',
		category: '幻灯片',
		description: '停止幻灯片播放',
		bindings: []
	},
	{
		action: 'slideshowSkip',
		name: '幻灯片跳过',
		category: '幻灯片',
		description: '跳过当前图片，立即切换下一张',
		bindings: []
	}
];

/**
 * 所有默认绑定配置
 * 合并所有分类的绑定
 */
export const defaultBindings: ActionBinding[] = [
	...navigationBindings,
	...zoomBindings,
	...viewBindings,
	...fileBindings,
	...videoBindings,
	...upscaleBindings,
	...slideshowBindings
];

/**
 * 创建默认绑定的深拷贝
 * 用于重置或初始化
 */
export function createDefaultBindings(): ActionBinding[] {
	return defaultBindings.map(binding => ({
		...binding,
		bindings: [...binding.bindings],
		contextBindings: binding.contextBindings ? [...binding.contextBindings] : undefined
	}));
}

/**
 * 获取所有可用的操作ID列表
 */
export function getAvailableActions(): string[] {
	return defaultBindings.map(b => b.action);
}

/**
 * 根据操作ID获取默认绑定
 */
export function getDefaultBinding(action: string): ActionBinding | undefined {
	return defaultBindings.find(b => b.action === action);
}
