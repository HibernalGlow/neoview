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
	MatchResult,
} from './types';

export {
	CONTEXT_PRIORITY,
	getContextPriority,
	STORAGE_KEY,
	CONTEXT_NAMES,
	AREA_NAMES,
	BUTTON_NAMES,
	ACTION_NAMES,
} from './constants';

export {
	defaultBindings,
	createDefaultBindings,
	getAvailableActions,
	getDefaultBinding,
} from './keyMappings.svelte';

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
	calculateClickArea,
} from './keyHandlers.svelte';

export {
	getCategories,
	getBindingsByCategory,
	formatBinding,
	formatContext,
	getAvailableContexts,
	getAllBindingsForAction,
	getBindingsForContext,
} from './keyCategories.svelte';

export { keyBindingsStore } from './core.svelte';
