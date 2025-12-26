/**
 * 快捷键绑定系统 - 统一导出模块
 * 使用 Barrel Export 模式导出所有公共 API
 */

// 导出类型定义
export type {
	InputType,
	BindingContext,
	ViewArea,
	KeyBinding,
	MouseGesture,
	TouchGesture,
	AreaClick,
	InputBinding,
	ContextualBinding,
	BindingConflict,
	ActionBinding,
	BindingWithContext,
	ActionWithBinding,
	MatchResult
} from './types';

// 导出常量
export {
	CONTEXT_PRIORITY,
	getContextPriority,
	STORAGE_KEY,
	CONTEXT_NAMES,
	AREA_NAMES,
	BUTTON_NAMES,
	ACTION_NAMES
} from './constants';

// 导出默认绑定配置
export {
	defaultBindings,
	createDefaultBindings,
	getAvailableActions,
	getDefaultBinding
} from './keyMappings.svelte';

// 导出键盘事件处理函数
export type { InputMatcher } from './keyHandlers.svelte';
export {
	normalizeKey,
	findActionByInputWithContext,
	findActionByKeyInContext,
	findActionByKey,
	findActionByMouseGestureInContext,
	findActionByMouseWheelInContext,
	findActionByMouseClickInContext,
	findActionByTouchGestureInContext,
	findActionByTouchGesture,
	findActionByAreaClickInContext,
	calculateClickArea
} from './keyHandlers.svelte';

// 导出分类管理函数
export {
	getCategories,
	getBindingsByCategory,
	formatBinding,
	formatContext,
	getAvailableContexts,
	getAllBindingsForAction,
	getBindingsForContext
} from './keyCategories.svelte';

// 导出核心 Store
export { keyBindingsStore } from './core.svelte';
