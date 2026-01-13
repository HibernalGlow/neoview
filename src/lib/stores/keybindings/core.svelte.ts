/**
 * 快捷键绑定系统 - 核心模块
 * 整合所有子模块，提供统一的 Store 接口
 */

import type {
	InputBinding, BindingContext, ActionBinding, BindingConflict, ViewArea
} from './types';
import { STORAGE_KEY, getContextPriority, CONTEXT_PRIORITY } from './constants';
import { defaultBindings } from './keyMappings.svelte';
import {
	findActionByKeyInContext, findActionByKey,
	findActionByMouseGestureInContext, findActionByMouseWheelInContext,
	findActionByMouseClickInContext, findActionByTouchGestureInContext,
	findActionByTouchGesture, findActionByAreaClickInContext, calculateClickArea
} from './keyHandlers.svelte';
import {
	getCategories, getBindingsByCategory, formatBinding, formatContext,
	getAvailableContexts, getAllBindingsForAction, getBindingsForContext
} from './keyCategories.svelte';

/** 快捷键绑定 Store 类 */
class KeyBindingsStore {
	bindings = $state<ActionBinding[]>([...defaultBindings]);
	private _activeContexts = $state<BindingContext[]>(['global']);

	constructor() {
		this.loadFromStorage();
		if (typeof window !== 'undefined') {
			window.addEventListener('storage', this.handleStorageChange);
		}
	}

	// ========== 上下文管理 ==========
	get activeContexts(): BindingContext[] { return this._activeContexts; }

	pushContext(context: BindingContext) {
		if (!this._activeContexts.includes(context)) {
			this._activeContexts = [...this._activeContexts, context];
		}
	}

	popContext(context: BindingContext) {
		if (context === 'global') return;
		this._activeContexts = this._activeContexts.filter(c => c !== context);
	}

	setContexts(contexts: BindingContext[]) {
		this._activeContexts = contexts.includes('global') ? contexts : ['global', ...contexts];
	}

	resetContexts() { this._activeContexts = ['global']; }

	isContextActive(context: BindingContext): boolean {
		return this._activeContexts.includes(context);
	}


	// ========== 存储事件处理 ==========
	private handleStorageChange = (event: StorageEvent) => {
		if (event.key !== STORAGE_KEY) return;
		try {
			if (event.newValue) {
				const parsed: ActionBinding[] = JSON.parse(event.newValue);
				this.bindings = this.mergeWithDefaults(parsed);
			} else {
				this.bindings = [...defaultBindings];
			}
		} catch (error) {
			console.error('Failed to sync keybindings from storage event:', error);
		}
	};

	private mergeWithDefaults(stored: ActionBinding[]): ActionBinding[] {
		const merged: ActionBinding[] = [];
		const storedMap = new Map(stored.map(binding => [binding.action, binding] as const));
		for (const def of defaultBindings) {
			const storedBinding = storedMap.get(def.action);
			if (storedBinding) {
				merged.push({
					...def,
					bindings: storedBinding.bindings ?? def.bindings,
					contextBindings: storedBinding.contextBindings ?? def.contextBindings
				});
				storedMap.delete(def.action);
			} else {
				merged.push({ ...def });
			}
		}
		for (const [, binding] of storedMap) {
			merged.push(binding);
		}
		return merged;
	}

	// ========== 绑定查询 ==========
	getBinding(action: string): ActionBinding | undefined {
		return this.bindings.find(b => b.action === action);
	}

	addBinding(action: string, binding: InputBinding) {
		const actionBinding = this.bindings.find(b => b.action === action);
		if (actionBinding) {
			if (!actionBinding.bindings) actionBinding.bindings = [];
			const exists = actionBinding.bindings.some(b =>
				JSON.stringify(b) === JSON.stringify(binding)
			);
			if (!exists) {
				actionBinding.bindings.push(binding);
				this.saveToStorage();
			}
		}
	}


	// ========== 上下文感知绑定管理 ==========
	addContextBinding(
		action: string, binding: InputBinding,
		context: BindingContext = 'global', priority?: number
	): BindingConflict | null {
		const actionBinding = this.bindings.find(b => b.action === action);
		if (!actionBinding) return null;

		const conflict = this.checkConflict(binding, context, action);
		if (conflict) return conflict;

		if (context === 'global') {
			if (!actionBinding.bindings) actionBinding.bindings = [];
			const exists = actionBinding.bindings.some(
				b => JSON.stringify(b) === JSON.stringify(binding)
			);
			if (!exists) {
				actionBinding.bindings.push(binding);
				this.saveToStorage();
			}
		} else {
			if (!actionBinding.contextBindings) actionBinding.contextBindings = [];
			const exists = actionBinding.contextBindings.some(
				cb => cb.context === context && JSON.stringify(cb.input) === JSON.stringify(binding)
			);
			if (!exists) {
				actionBinding.contextBindings.push({ input: binding, context, priority });
				this.saveToStorage();
			}
		}
		return null;
	}

	removeContextBinding(action: string, context: BindingContext, bindingIndex: number) {
		const actionBinding = this.bindings.find(b => b.action === action);
		if (!actionBinding?.contextBindings) return;

		const contextBindingsIndices: number[] = [];
		actionBinding.contextBindings.forEach((cb, i) => {
			if (cb.context === context) contextBindingsIndices.push(i);
		});

		const realIndex = contextBindingsIndices[bindingIndex];
		if (realIndex !== undefined) {
			actionBinding.contextBindings.splice(realIndex, 1);
			this.saveToStorage();
		}
	}

	changeBindingContext(action: string, input: InputBinding, fromCtx: BindingContext, index: number, isContextual: boolean, toCtx: BindingContext) {
		const actionBinding = this.bindings.find(b => b.action === action);
		if (!actionBinding) return;

		// 移除原有绑定
		if (isContextual) {
			this.removeContextBinding(action, fromCtx, index);
		} else {
			this.removeBinding(action, index);
		}

		// 添加到新上下文
		this.addContextBinding(action, input, toCtx);
	}

	clearContextBindings(action: string, context: BindingContext) {
		const actionBinding = this.bindings.find(b => b.action === action);
		if (!actionBinding?.contextBindings) return;
		actionBinding.contextBindings = actionBinding.contextBindings.filter(
			cb => cb.context !== context
		);
		this.saveToStorage();
	}


	// ========== 冲突检测 ==========
	checkConflict(
		binding: InputBinding, context: BindingContext, excludeAction?: string
	): BindingConflict | null {
		const bindingStr = JSON.stringify(binding);
		for (const ab of this.bindings) {
			if (ab.action === excludeAction) continue;
			if (ab.contextBindings) {
				for (const cb of ab.contextBindings) {
					if (cb.context === context && JSON.stringify(cb.input) === bindingStr) {
						return { input: binding, context, existingAction: ab.action, newAction: excludeAction ?? '' };
					}
				}
			}
			if (context === 'global' && ab.bindings) {
				for (const b of ab.bindings) {
					if (JSON.stringify(b) === bindingStr) {
						return { input: binding, context, existingAction: ab.action, newAction: excludeAction ?? '' };
					}
				}
			}
		}
		return null;
	}

	forceAddContextBinding(
		action: string, binding: InputBinding,
		context: BindingContext = 'global', priority?: number
	): BindingConflict | null {
		const conflict = this.checkConflict(binding, context, action);
		if (conflict) this.removeBindingByInput(conflict.existingAction, binding, context);
		return this.addContextBinding(action, binding, context, priority);
	}

	private removeBindingByInput(action: string, input: InputBinding, context: BindingContext) {
		const actionBinding = this.bindings.find(b => b.action === action);
		if (!actionBinding) return;
		const inputStr = JSON.stringify(input);
		if (actionBinding.contextBindings) {
			actionBinding.contextBindings = actionBinding.contextBindings.filter(
				cb => !(cb.context === context && JSON.stringify(cb.input) === inputStr)
			);
		}
		if (context === 'global' && actionBinding.bindings) {
			actionBinding.bindings = actionBinding.bindings.filter(
				b => JSON.stringify(b) !== inputStr
			);
		}
		this.saveToStorage();
	}

	removeBinding(action: string, bindingIndex: number) {
		const actionBinding = this.bindings.find(b => b.action === action);
		if (actionBinding?.bindings?.[bindingIndex]) {
			actionBinding.bindings.splice(bindingIndex, 1);
			this.saveToStorage();
		}
	}

	clearBindings(action: string) {
		const actionBinding = this.bindings.find(b => b.action === action);
		if (actionBinding) {
			actionBinding.bindings = [];
			actionBinding.contextBindings = [];
			this.saveToStorage();
		}
	}

	resetToDefault() {
		this.bindings = [...defaultBindings];
		this.resetContexts();
		this.saveToStorage();
	}


	// ========== 上下文感知查找方法 ==========
	findActionByKeyInContext(key: string): string | null {
		return findActionByKeyInContext(this.bindings, this._activeContexts, key);
	}

	findActionByMouseGestureInContext(
		gesture: string, button: 'left' | 'right' | 'middle' = 'left', action?: string
	): string | null {
		return findActionByMouseGestureInContext(this.bindings, this._activeContexts, gesture, button, action);
	}

	findActionByTouchGestureInContext(gesture: string): string | null {
		return findActionByTouchGestureInContext(this.bindings, this._activeContexts, gesture);
	}

	findActionByAreaClickInContext(
		area: ViewArea, button: 'left' | 'right' | 'middle' = 'left',
		action: 'click' | 'double-click' | 'press' = 'click'
	): string | null {
		return findActionByAreaClickInContext(this.bindings, this._activeContexts, area, button, action);
	}

	findActionByMouseWheelInContext(direction: 'up' | 'down'): string | null {
		return findActionByMouseWheelInContext(this.bindings, this._activeContexts, direction);
	}

	findActionByMouseClickInContext(
		button: 'left' | 'right' | 'middle', clickType: 'click' | 'double-click' = 'click'
	): string | null {
		return findActionByMouseClickInContext(this.bindings, this._activeContexts, button, clickType);
	}

	// ========== 旧API（全局查找，向后兼容） ==========
	findActionByKey(key: string): string | null {
		return findActionByKey(this.bindings, key);
	}

	findActionByKeyCombo(keyCombo: string): string | null {
		return this.findActionByKeyInContext(keyCombo);
	}

	findActionByMouseGesture(
		gesture: string, button: 'left' | 'right' | 'middle' = 'left', action?: string
	): string | null {
		return this.findActionByMouseGestureInContext(gesture, button, action);
	}

	findActionByMouseWheel(direction: 'up' | 'down'): string | null {
		return this.findActionByMouseGesture(`wheel-${direction}`, 'middle', 'wheel');
	}

	findActionByMouseClick(
		button: 'left' | 'right' | 'middle', clickType: 'click' | 'double-click' = 'click'
	): string | null {
		return this.findActionByMouseGesture(clickType, button, clickType);
	}

	findActionByTouchGesture(gesture: string): string | null {
		return findActionByTouchGesture(this.bindings, gesture);
	}

	findActionByAreaClick(
		area: ViewArea, button: 'left' | 'right' | 'middle' = 'left',
		action: 'click' | 'double-click' | 'press' = 'click'
	): string | null {
		return this.findActionByAreaClickInContext(area, button, action);
	}

	calculateClickArea(x: number, y: number, width: number, height: number): ViewArea {
		return calculateClickArea(x, y, width, height);
	}


	// ========== 存储方法 ==========
	private saveToStorage() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
		} catch (error) {
			console.error('Failed to save keybindings:', error);
		}
	}

	private loadFromStorage() {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed: ActionBinding[] = JSON.parse(stored);
				this.bindings = this.mergeWithDefaults(parsed);
			} else {
				this.bindings = [...defaultBindings];
			}
		} catch (error) {
			console.error('Failed to load keybindings:', error);
			this.bindings = [...defaultBindings];
		}
	}

	// ========== 分类和格式化方法 ==========
	getCategories(): string[] { return getCategories(this.bindings); }
	getBindingsByCategory(category: string): ActionBinding[] {
		return getBindingsByCategory(this.bindings, category);
	}
	formatBinding(binding: InputBinding): string { return formatBinding(binding); }
	formatContext(context: BindingContext): string { return formatContext(context); }
	getAvailableContexts(): BindingContext[] { return getAvailableContexts(); }
	getAllBindingsForAction(action: string) {
		return getAllBindingsForAction(this.bindings, action);
	}
	getBindingsForContext(context: BindingContext) {
		return getBindingsForContext(this.bindings, context);
	}


	// ========== 调试方法 ==========
	debugBindings() {
		console.log('=== 当前所有绑定 ===');
		console.log(`活跃上下文: [${this._activeContexts.join(', ')}]`);
		console.log('');
		this.bindings.forEach(binding => {
			console.log(`操作: ${binding.action} (${binding.name})`);
			if (binding.bindings && binding.bindings.length > 0) {
				console.log('  [全局]:');
				binding.bindings.forEach(b => console.log(`    - ${this.formatBinding(b)}`));
			}
			if (binding.contextBindings && binding.contextBindings.length > 0) {
				const byContext: Record<string, InputBinding[]> = {};
				for (const cb of binding.contextBindings) {
					if (!byContext[cb.context]) byContext[cb.context] = [];
					byContext[cb.context].push(cb.input);
				}
				for (const ctx of Object.keys(byContext)) {
					console.log(`  [${this.formatContext(ctx as BindingContext)}]:`);
					byContext[ctx].forEach(b => console.log(`    - ${this.formatBinding(b)}`));
				}
			}
			if ((!binding.bindings || binding.bindings.length === 0) &&
				(!binding.contextBindings || binding.contextBindings.length === 0)) {
				console.log('  - 无绑定');
			}
		});
		console.log('================');
	}

	debugContexts() {
		console.log('=== 当前上下文状态 ===');
		console.log(`活跃上下文: [${this._activeContexts.join(', ')}]`);
		console.log(`优先级排序:`);
		const sorted = [...this._activeContexts].sort(
			(a, b) => getContextPriority(b) - getContextPriority(a)
		);
		sorted.forEach((ctx, i) => {
			console.log(`  ${i + 1}. ${this.formatContext(ctx)} (优先级: ${getContextPriority(ctx)})`);
		});
		console.log('================');
	}
}

// 导出单例
export const keyBindingsStore = new KeyBindingsStore();

// 导出优先级相关工具函数
export { getContextPriority, CONTEXT_PRIORITY };
