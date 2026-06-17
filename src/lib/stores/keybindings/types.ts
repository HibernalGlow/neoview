/**
 * Keybinding system type definitions.
 */

export type InputType = 'keyboard' | 'mouse' | 'touch' | 'area';

export type BindingContext = 'global' | 'viewer' | 'videoPlayer';

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

export interface KeyBinding {
	type: 'keyboard';
	key: string;
	trigger?: 'down' | 'hold';
	durationMs?: number;
}

export interface MouseGesture {
	type: 'mouse';
	gesture: string;
	button?: 'left' | 'right' | 'middle';
	action?: 'press' | 'click' | 'double-click' | 'wheel';
	trigger?: 'instant' | 'hold';
	durationMs?: number;
	moveTolerancePx?: number;
}

export interface TouchGesture {
	type: 'touch';
	gesture: string;
	trigger?: 'instant' | 'hold';
	durationMs?: number;
	moveTolerancePx?: number;
}

export interface AreaClick {
	type: 'area';
	area: ViewArea;
	button?: 'left' | 'right' | 'middle';
	action?: 'click' | 'double-click' | 'press';
}

export type InputBinding = KeyBinding | MouseGesture | TouchGesture | AreaClick;

export interface ContextualBinding {
	input: InputBinding;
	context: BindingContext;
	priority?: number;
}

export interface BindingConflict {
	input: InputBinding;
	context: BindingContext;
	existingAction: string;
	newAction: string;
}

export interface ActionBinding {
	action: string;
	name: string;
	category: string;
	description: string;
	bindings: InputBinding[];
	contextBindings?: ContextualBinding[];
}

export interface BindingWithContext {
	binding: InputBinding;
	context: BindingContext;
}

export interface ActionWithBinding {
	action: string;
	binding: InputBinding;
}

export interface MatchResult {
	action: string;
	priority: number;
}
