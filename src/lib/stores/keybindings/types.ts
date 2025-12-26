/**
 * 快捷键绑定系统 - 类型定义模块
 * 定义所有与快捷键绑定相关的类型和接口
 */

// ========== 基础类型 ==========

/** 输入类型 */
export type InputType = 'keyboard' | 'mouse' | 'touch' | 'area';

/**
 * 绑定上下文/作用域
 * - global: 全局有效（最低优先级）
 * - viewer: 图片查看器模式
 * - videoPlayer: 视频播放模式
 */
export type BindingContext =
	| 'global'
	| 'viewer'
	| 'videoPlayer';

/** 视图区域（3x3 网格） */
export type ViewArea =
	| 'top-left'
	| 'top-center'
	| 'top-right'
	| 'middle-left'
	| 'middle-center'
	| 'middle-right'
	| 'bottom-left'
	| 'bottom-center'
	| 'bottom-right';

// ========== 输入绑定接口 ==========

/** 键盘绑定 */
export interface KeyBinding {
	type: 'keyboard';
	key: string; // 例如: 'ArrowRight', 'Ctrl+Z'
}

/** 鼠标手势绑定 */
export interface MouseGesture {
	type: 'mouse';
	gesture: string; // 例如: 'L', 'R', 'U', 'D', 'LD', 'wheel-up', 'wheel-down', 'click', 'double-click'
	button?: 'left' | 'right' | 'middle';
	action?: 'press' | 'click' | 'double-click' | 'wheel'; // 动作类型
}

/** 触摸手势绑定 */
export interface TouchGesture {
	type: 'touch';
	gesture: string; // 例如: 'swipe-left', 'pinch', 'two-finger-tap'
}

/** 区域点击绑定 */
export interface AreaClick {
	type: 'area';
	area: ViewArea; // 点击的视图区域
	button?: 'left' | 'right' | 'middle'; // 鼠标按键
	action?: 'click' | 'double-click' | 'press'; // 动作类型
}

/** 输入绑定联合类型 */
export type InputBinding = KeyBinding | MouseGesture | TouchGesture | AreaClick;

// ========== 上下文绑定接口 ==========

/**
 * 带上下文的输入绑定
 * 扩展基础绑定，添加上下文和优先级支持
 */
export interface ContextualBinding {
	input: InputBinding;
	context: BindingContext; // 绑定适用的上下文
	priority?: number;       // 自定义优先级（覆盖默认）
}

/**
 * 绑定冲突信息
 */
export interface BindingConflict {
	input: InputBinding;
	context: BindingContext;
	existingAction: string;  // 已存在绑定的操作
	newAction: string;       // 新绑定的操作
}

// ========== 操作绑定接口 ==========

/** 操作绑定定义 */
export interface ActionBinding {
	action: string;           // 操作ID，例如: 'nextPage'
	name: string;             // 显示名称，例如: '下一页'
	category: string;         // 分类：导航、缩放、视图、文件
	description: string;      // 描述
	bindings: InputBinding[]; // 旧格式兼容：全局绑定
	contextBindings?: ContextualBinding[]; // 新格式：上下文感知绑定
}

// ========== 辅助类型 ==========

/** 绑定与上下文的组合 */
export interface BindingWithContext {
	binding: InputBinding;
	context: BindingContext;
}

/** 操作与绑定的组合 */
export interface ActionWithBinding {
	action: string;
	binding: InputBinding;
}

/** 匹配结果（带优先级） */
export interface MatchResult {
	action: string;
	priority: number;
}
