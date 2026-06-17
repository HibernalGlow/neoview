/**
 * 轮盘菜单系统 - 类型定义
 * 基于 ray-menu Web Component 的 flat items 模型
 */

/** 单个轮盘菜单项（用户配置层） */
export interface RadialMenuItem {
	/** 唯一 ID（同时也是触发的 action id） */
	id: string;
	/** 显示标签 */
	label: string;
	/** 图标（emoji 或短文本） */
	icon?: string;
	/** 是否禁用 */
	disabled?: boolean;
	/** 子菜单（嵌套） */
	children?: RadialMenuItem[];
}

/** ray-menu 视觉变体 */
export type RadialVariant = 'slice' | 'bubble';

/** 轮盘菜单配置 */
export interface RadialMenuConfig {
	/** 唯一 ID */
	id: string;
	/** 显示名称 */
	name: string;
	/** 是否启用 */
	enabled: boolean;
	/** 菜单项列表（flat，顺序即 ray-menu 排列顺序） */
	items: RadialMenuItem[];
	/** ray-menu 视觉参数 */
	radius: number;
	innerRadius: number;
	variant: RadialVariant;
	startAngle: number;
	sweepAngle: number;
}

/** 轮盘状态机状态 */
export type RadialState = 'idle' | 'open' | 'committed' | 'cancelled';

/** 轮盘打开模式 */
export type RadialMode = 'pointer' | 'keyboard';
