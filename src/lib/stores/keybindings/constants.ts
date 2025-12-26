/**
 * 快捷键绑定系统 - 常量定义模块
 * 定义上下文优先级和其他常量配置
 */

import type { BindingContext } from './types';

// ========== 上下文优先级 ==========

/**
 * 上下文优先级映射
 * 数字越大优先级越高，更具体的上下文优先
 */
export const CONTEXT_PRIORITY: Record<string, number> = {
	global: 0,
	viewer: 10,
	videoPlayer: 10
};

/** 获取上下文优先级 */
export function getContextPriority(context: BindingContext): number {
	return CONTEXT_PRIORITY[context] ?? 5;
}

// ========== 存储键名 ==========

/** localStorage 存储键名 */
export const STORAGE_KEY = 'neoview-keybindings';

// ========== 上下文名称映射 ==========

/** 上下文显示名称 */
export const CONTEXT_NAMES: Record<BindingContext, string> = {
	global: '全局',
	viewer: '图片模式',
	videoPlayer: '视频模式'
};

// ========== 区域名称映射 ==========

/** 视图区域显示名称 */
export const AREA_NAMES: Record<string, string> = {
	'top-left': '左上',
	'top-center': '中上',
	'top-right': '右上',
	'middle-left': '左中',
	'middle-center': '中中',
	'middle-right': '右中',
	'bottom-left': '左下',
	'bottom-center': '中下',
	'bottom-right': '右下'
};

// ========== 按钮名称映射 ==========

/** 鼠标按钮显示名称 */
export const BUTTON_NAMES: Record<string, string> = {
	left: '左键',
	right: '右键',
	middle: '中键'
};

// ========== 动作名称映射 ==========

/** 动作类型显示名称 */
export const ACTION_NAMES: Record<string, string> = {
	click: '点击',
	'double-click': '双击',
	press: '按住'
};
