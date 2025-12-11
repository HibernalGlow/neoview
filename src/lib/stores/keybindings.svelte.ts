/**
 * 统一的操作绑定系统
 * 参考 NeeView 设计：一个操作可以绑定多个输入方式
 * 支持多上下文/模式感知的快捷键系统
 */

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

/**
 * 上下文优先级映射
 * 数字越大优先级越高，更具体的上下文优先
 */
const CONTEXT_PRIORITY: Record<string, number> = {
	global: 0,
	viewer: 10,
	videoPlayer: 10
};

/** 获取上下文优先级 */
function getContextPriority(context: BindingContext): number {
	return CONTEXT_PRIORITY[context] ?? 5;
}

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
	key: string; // 例如: 'ArrowRight', 'Ctrl+Z'
}

export interface MouseGesture {
	type: 'mouse';
	gesture: string; // 例如: 'L', 'R', 'U', 'D', 'LD', 'wheel-up', 'wheel-down', 'click', 'double-click'
	button?: 'left' | 'right' | 'middle';
	action?: 'press' | 'click' | 'double-click' | 'wheel'; // 动作类型
}

export interface TouchGesture {
	type: 'touch';
	gesture: string; // 例如: 'swipe-left', 'pinch', 'two-finger-tap'
}

export interface AreaClick {
	type: 'area';
	area: ViewArea; // 点击的视图区域
	button?: 'left' | 'right' | 'middle'; // 鼠标按键
	action?: 'click' | 'double-click' | 'press'; // 动作类型
}

export type InputBinding = KeyBinding | MouseGesture | TouchGesture | AreaClick;

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

export interface ActionBinding {
	action: string;           // 操作ID，例如: 'nextPage'
	name: string;             // 显示名称，例如: '下一页'
	category: string;         // 分类：导航、缩放、视图、文件
	description: string;      // 描述
	bindings: InputBinding[]; // 旧格式兼容：全局绑定
	contextBindings?: ContextualBinding[]; // 新格式：上下文感知绑定
}

// 默认绑定配置
const defaultBindings: ActionBinding[] = [
	// === 导航操作 ===
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
		bindings: []  // 默认无绑定，用户可自定义
	},
	{
		action: 'pageRight',
		name: '向右翻页',
		category: '导航',
		description: '向右翻页（方向性翻页，不受阅读方向影响）',
		bindings: []  // 默认无绑定，用户可自定义
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
	},

	// === 缩放操作 ===
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
	},

	// === 视图操作 ===
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
	},

	// === 文件操作 ===
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
	},

	// === 视频操作 ===
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
	},

	// === 超分操作 ===
	{
		action: 'toggleAutoUpscale',
		name: '自动超分开关',
		category: '超分',
		description: '开启或关闭自动超分（全局超分设置）',
		bindings: []
	}
];

// 创建响应式 store
class KeyBindingsStore {
	bindings = $state<ActionBinding[]>([...defaultBindings]);
	
	// 当前活跃的上下文堆栈（支持多个同时活跃）
	private _activeContexts = $state<BindingContext[]>(['global']);

	constructor() {
		// 从 localStorage 加载自定义绑定
		this.loadFromStorage();
		if (typeof window !== 'undefined') {
			window.addEventListener('storage', this.handleStorageChange);
		}
	}

	// ========== 上下文管理 ==========

	/** 获取当前活跃上下文 */
	get activeContexts(): BindingContext[] {
		return this._activeContexts;
	}

	/** 激活一个上下文（添加到堆栈） */
	pushContext(context: BindingContext) {
		if (!this._activeContexts.includes(context)) {
			this._activeContexts = [...this._activeContexts, context];
		}
	}

	/** 移除一个上下文 */
	popContext(context: BindingContext) {
		if (context === 'global') return; // global 不可移除
		this._activeContexts = this._activeContexts.filter(c => c !== context);
	}

	/** 设置当前活跃上下文（替换整个堆栈） */
	setContexts(contexts: BindingContext[]) {
		// 确保 global 始终存在
		this._activeContexts = contexts.includes('global') ? contexts : ['global', ...contexts];
	}

	/** 重置为全局上下文 */
	resetContexts() {
		this._activeContexts = ['global'];
	}

	/** 检查某个上下文是否活跃 */
	isContextActive(context: BindingContext): boolean {
		return this._activeContexts.includes(context);
	}

	private handleStorageChange = (event: StorageEvent) => {
		if (event.key !== 'neoview-keybindings') return;
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

	// 根据操作查找绑定
	getBinding(action: string): ActionBinding | undefined {
		return this.bindings.find(b => b.action === action);
	}

	// 添加全局绑定到操作（旧API兼容）
	addBinding(action: string, binding: InputBinding) {
		const actionBinding = this.bindings.find(b => b.action === action);
		if (actionBinding) {
			// 确保 bindings 数组存在
			if (!actionBinding.bindings) {
				actionBinding.bindings = [];
			}
			// 检查是否已存在相同绑定
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

	/**
	 * 添加带上下文的绑定
	 * @param action 操作ID
	 * @param binding 输入绑定
	 * @param context 上下文，默认为 global
	 * @param priority 自定义优先级
	 * @returns 冲突信息（如果有）
	 */
	addContextBinding(
		action: string,
		binding: InputBinding,
		context: BindingContext = 'global',
		priority?: number
	): BindingConflict | null {
		const actionBinding = this.bindings.find(b => b.action === action);
		if (!actionBinding) return null;

		// 检查冲突（同上下文内）
		const conflict = this.checkConflict(binding, context, action);
		if (conflict) {
			return conflict;
		}

		// global 上下文存入 bindings，其他上下文存入 contextBindings
		if (context === 'global') {
			if (!actionBinding.bindings) {
				actionBinding.bindings = [];
			}
			const exists = actionBinding.bindings.some(
				b => JSON.stringify(b) === JSON.stringify(binding)
			);
			if (!exists) {
				actionBinding.bindings.push(binding);
				this.saveToStorage();
			}
		} else {
			if (!actionBinding.contextBindings) {
				actionBinding.contextBindings = [];
			}
			const exists = actionBinding.contextBindings.some(
				cb => cb.context === context && JSON.stringify(cb.input) === JSON.stringify(binding)
			);
			if (!exists) {
				actionBinding.contextBindings.push({
					input: binding,
					context,
					priority
				});
				this.saveToStorage();
			}
		}

		return null;
	}

	/**
	 * 移除上下文绑定
	 * @param action 操作ID
	 * @param context 上下文
	 * @param bindingIndex 绑定索引（在该上下文中的索引）
	 */
	removeContextBinding(action: string, context: BindingContext, bindingIndex: number) {
		const actionBinding = this.bindings.find(b => b.action === action);
		if (!actionBinding?.contextBindings) return;

		// 找到该上下文的所有绑定
		const contextBindingsIndices: number[] = [];
		actionBinding.contextBindings.forEach((cb, i) => {
			if (cb.context === context) {
				contextBindingsIndices.push(i);
			}
		});

		const realIndex = contextBindingsIndices[bindingIndex];
		if (realIndex !== undefined) {
			actionBinding.contextBindings.splice(realIndex, 1);
			this.saveToStorage();
		}
	}

	/**
	 * 清除操作在指定上下文的所有绑定
	 */
	clearContextBindings(action: string, context: BindingContext) {
		const actionBinding = this.bindings.find(b => b.action === action);
		if (!actionBinding?.contextBindings) return;

		actionBinding.contextBindings = actionBinding.contextBindings.filter(
			cb => cb.context !== context
		);
		this.saveToStorage();
	}

	// ========== 冲突检测 ==========

	/**
	 * 检查绑定是否冲突
	 * @param binding 输入绑定
	 * @param context 上下文
	 * @param excludeAction 排除的操作（自己）
	 */
	checkConflict(
		binding: InputBinding,
		context: BindingContext,
		excludeAction?: string
	): BindingConflict | null {
		const bindingStr = JSON.stringify(binding);

		for (const ab of this.bindings) {
			if (ab.action === excludeAction) continue;

			// 检查上下文绑定
			if (ab.contextBindings) {
				for (const cb of ab.contextBindings) {
					if (cb.context === context && JSON.stringify(cb.input) === bindingStr) {
						return {
							input: binding,
							context,
							existingAction: ab.action,
							newAction: excludeAction ?? ''
						};
					}
				}
			}

			// 检查全局绑定（如果上下文是 global）
			if (context === 'global' && ab.bindings) {
				for (const b of ab.bindings) {
					if (JSON.stringify(b) === bindingStr) {
						return {
							input: binding,
							context,
							existingAction: ab.action,
							newAction: excludeAction ?? ''
						};
					}
				}
			}
		}

		return null;
	}

	/**
	 * 强制添加绑定（自动解决冲突）
	 * 会移除冲突的现有绑定
	 */
	forceAddContextBinding(
		action: string,
		binding: InputBinding,
		context: BindingContext = 'global',
		priority?: number
	): BindingConflict | null {
		const conflict = this.checkConflict(binding, context, action);
		
		if (conflict) {
			// 移除冲突的绑定
			this.removeBindingByInput(conflict.existingAction, binding, context);
		}

		// 添加新绑定
		return this.addContextBinding(action, binding, context, priority);
	}

	/**
	 * 根据输入移除绑定
	 */
	private removeBindingByInput(action: string, input: InputBinding, context: BindingContext) {
		const actionBinding = this.bindings.find(b => b.action === action);
		if (!actionBinding) return;

		const inputStr = JSON.stringify(input);

		// 移除上下文绑定
		if (actionBinding.contextBindings) {
			actionBinding.contextBindings = actionBinding.contextBindings.filter(
				cb => !(cb.context === context && JSON.stringify(cb.input) === inputStr)
			);
		}

		// 移除全局绑定
		if (context === 'global' && actionBinding.bindings) {
			actionBinding.bindings = actionBinding.bindings.filter(
				b => JSON.stringify(b) !== inputStr
			);
		}

		this.saveToStorage();
	}

	// 移除绑定
	removeBinding(action: string, bindingIndex: number) {
		const actionBinding = this.bindings.find(b => b.action === action);
		if (actionBinding && actionBinding.bindings && actionBinding.bindings[bindingIndex]) {
			actionBinding.bindings.splice(bindingIndex, 1);
			this.saveToStorage();
		}
	}

	// 清除操作的所有绑定（包括上下文绑定）
	clearBindings(action: string) {
		const actionBinding = this.bindings.find(b => b.action === action);
		if (actionBinding) {
			actionBinding.bindings = [];
			actionBinding.contextBindings = [];
			this.saveToStorage();
		}
	}

	// 重置为默认绑定
	resetToDefault() {
		this.bindings = [...defaultBindings];
		this.resetContexts();
		this.saveToStorage();
	}

	// ========== 上下文感知查找方法 ==========

	/**
	 * 上下文感知的通用查找方法
	 * 按优先级查找当前活跃上下文中的匹配操作
	 * @param matcher 输入匹配函数
	 * @returns 匹配的操作ID，如果没有匹配则返回 null
	 */
	private findActionByInputWithContext(
		matcher: (input: InputBinding) => boolean
	): string | null {
		// 收集所有匹配的绑定及其优先级
		const matches: { action: string; priority: number }[] = [];

		for (const ab of this.bindings) {
			// 1. 检查上下文绑定（新格式）
			if (ab.contextBindings) {
				for (const cb of ab.contextBindings) {
					// 检查上下文是否活跃
					if (this._activeContexts.includes(cb.context)) {
						if (matcher(cb.input)) {
							const priority = cb.priority ?? getContextPriority(cb.context);
							matches.push({ action: ab.action, priority });
						}
					}
				}
			}

			// 2. 检查全局绑定（旧格式，视为 global 上下文）
			if (ab.bindings && this._activeContexts.includes('global')) {
				for (const b of ab.bindings) {
					if (matcher(b)) {
						matches.push({ action: ab.action, priority: 0 });
					}
				}
			}
		}

		// 按优先级排序（高优先级在前）
		matches.sort((a, b) => b.priority - a.priority);

		// 返回最高优先级的匹配
		return matches.length > 0 ? matches[0].action : null;
	}

	/**
	 * 上下文感知的按键查找
	 * 在当前活跃上下文中查找按键对应的操作
	 */
	findActionByKeyInContext(key: string): string | null {
		const normalize = (value: string) =>
			value
				.toLowerCase()
				.replace(/←/g, 'arrowleft')
				.replace(/→/g, 'arrowright')
				.replace(/↑/g, 'arrowup')
				.replace(/↓/g, 'arrowdown');

		const normalizedKey = normalize(key);

		return this.findActionByInputWithContext((input) => {
			if (input.type !== 'keyboard') return false;
			return normalize((input as KeyBinding).key) === normalizedKey;
		});
	}

	/**
	 * 上下文感知的鼠标手势查找
	 */
	findActionByMouseGestureInContext(
		gesture: string,
		button: 'left' | 'right' | 'middle' = 'left',
		action?: string
	): string | null {
		return this.findActionByInputWithContext((input) => {
			if (input.type !== 'mouse') return false;
			const m = input as MouseGesture;
			return (
				m.gesture === gesture &&
				(m.button || 'left') === button &&
				(!action || m.action === action)
			);
		});
	}

	/**
	 * 上下文感知的触摸手势查找
	 */
	findActionByTouchGestureInContext(gesture: string): string | null {
		return this.findActionByInputWithContext((input) => {
			if (input.type !== 'touch') return false;
			return (input as TouchGesture).gesture === gesture;
		});
	}

	/**
	 * 上下文感知的区域点击查找
	 */
	findActionByAreaClickInContext(
		area: ViewArea,
		button: 'left' | 'right' | 'middle' = 'left',
		action: 'click' | 'double-click' | 'press' = 'click'
	): string | null {
		return this.findActionByInputWithContext((input) => {
			if (input.type !== 'area') return false;
			const a = input as AreaClick;
			return (
				a.area === area &&
				(a.button || 'left') === button &&
				(a.action || 'click') === action
			);
		});
	}

	/**
	 * 上下文感知的滚轮查找
	 */
	findActionByMouseWheelInContext(direction: 'up' | 'down'): string | null {
		return this.findActionByMouseGestureInContext(`wheel-${direction}`, 'middle', 'wheel');
	}

	/**
	 * 上下文感知的鼠标点击查找
	 */
	findActionByMouseClickInContext(
		button: 'left' | 'right' | 'middle',
		clickType: 'click' | 'double-click' = 'click'
	): string | null {
		return this.findActionByMouseGestureInContext(clickType, button, clickType);
	}

	// ========== 旧API（全局查找，向后兼容） ==========

	// 根据键盘按键查找操作（全局，不考虑上下文）
	findActionByKey(key: string): string | null {
		for (const binding of this.bindings) {
			if (!binding.bindings) continue;
			const keyBinding = binding.bindings.find(
				b => b.type === 'keyboard' && (b as KeyBinding).key === key
			);
			if (keyBinding) {
				return binding.action;
			}
		}
		return null;
	}

	// 根据按键组合字符串查找操作（支持包含修饰键的组合，例如 Ctrl+ArrowLeft）
	findActionByKeyCombo(keyCombo: string): string | null {
		// 归一化大小写，并兼容 ArrowLeft/← 等不同表示形式
		const normalize = (value: string) =>
			value
				.toLowerCase()
				.replace(/←/g, 'arrowleft')
				.replace(/→/g, 'arrowright')
				.replace(/↑/g, 'arrowup')
				.replace(/↓/g, 'arrowdown');
		const normalized = normalize(keyCombo);
		for (const binding of this.bindings) {
			if (!binding.bindings) continue;
			const keyBinding = binding.bindings.find(
				(b) =>
					b.type === 'keyboard' &&
					(typeof (b as KeyBinding).key === 'string' &&
						normalize((b as KeyBinding).key) === normalized)
			);
			if (keyBinding) {
				return binding.action;
			}
		}
		return null;
	}

	// 根据鼠标手势查找操作
	findActionByMouseGesture(gesture: string, button: 'left' | 'right' | 'middle' = 'left', action?: string): string | null {
		for (const binding of this.bindings) {
			if (!binding.bindings) continue;
			const mouseBinding = binding.bindings.find(
				b => b.type === 'mouse' &&
					(b as MouseGesture).gesture === gesture &&
					((b as MouseGesture).button || 'left') === button &&
					(!action || (b as MouseGesture).action === action)
			);
			if (mouseBinding) {
				return binding.action;
			}
		}
		return null;
	}

	// 根据鼠标滚轮查找操作
	findActionByMouseWheel(direction: 'up' | 'down'): string | null {
		return this.findActionByMouseGesture(`wheel-${direction}`, 'middle', 'wheel');
	}

	// 根据鼠标点击查找操作
	findActionByMouseClick(button: 'left' | 'right' | 'middle', clickType: 'click' | 'double-click' = 'click'): string | null {
		return this.findActionByMouseGesture(clickType, button, clickType);
	}

	// 根据触摸手势查找操作
	findActionByTouchGesture(gesture: string): string | null {
		for (const binding of this.bindings) {
			if (!binding.bindings) continue;
			const touchBinding = binding.bindings.find(
				b => b.type === 'touch' && (b as TouchGesture).gesture === gesture
			);
			if (touchBinding) {
				return binding.action;
			}
		}
		return null;
	}

	// 根据区域点击查找操作
	findActionByAreaClick(area: ViewArea, button: 'left' | 'right' | 'middle' = 'left', action: 'click' | 'double-click' | 'press' = 'click'): string | null {
		for (const binding of this.bindings) {
			if (!binding.bindings) continue;
			const areaBinding = binding.bindings.find(
				b => b.type === 'area' &&
					(b as AreaClick).area === area &&
					((b as AreaClick).button || 'left') === button &&
					((b as AreaClick).action || 'click') === action
			);
			if (areaBinding) {
				return binding.action;
			}
		}
		return null;
	}

	// 根据坐标计算点击区域
	calculateClickArea(x: number, y: number, width: number, height: number): ViewArea {
		// 将视图划分为 3x3 网格
		const topThird = height / 3;
		const bottomThird = (height * 2) / 3;
		const isTop = y < topThird;
		const isMiddle = y >= topThird && y < bottomThird;
		const isBottom = y >= bottomThird;

		// 将水平分为三等分
		const leftThird = width / 3;
		const rightThird = (width * 2) / 3;
		const isLeft = x < leftThird;
		const isCenter = x >= leftThird && x < rightThird;
		const isRight = x >= rightThird;

		if (isTop && isLeft) return 'top-left';
		if (isTop && isCenter) return 'top-center';
		if (isTop && isRight) return 'top-right';
		if (isMiddle && isLeft) return 'middle-left';
		if (isMiddle && isCenter) return 'middle-center';
		if (isMiddle && isRight) return 'middle-right';
		if (isBottom && isLeft) return 'bottom-left';
		if (isBottom && isCenter) return 'bottom-center';
		if (isBottom && isRight) return 'bottom-right';

		// 默认返回中间中心区域
		return 'middle-center';
	}

	// 保存到 localStorage
	private saveToStorage() {
		try {
			localStorage.setItem('neoview-keybindings', JSON.stringify(this.bindings));
		} catch (error) {
			console.error('Failed to save keybindings:', error);
		}
	}

	// 从 localStorage 加载
	private loadFromStorage() {
		try {
			const stored = localStorage.getItem('neoview-keybindings');
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

	// 获取分类列表
	getCategories(): string[] {
		return [...new Set(this.bindings.map(b => b.category))];
	}

	// 根据分类获取绑定
	getBindingsByCategory(category: string): ActionBinding[] {
		return this.bindings.filter(b => b.category === category);
	}

	// 格式化绑定为显示文本
	formatBinding(binding: InputBinding): string {
		if (!binding) return '';
		switch (binding.type) {
			case 'keyboard':
				return (binding as KeyBinding).key || '';
			case 'mouse':
				const mouse = binding as MouseGesture;
				let buttonText = '';
				switch (mouse.button) {
					case 'left': buttonText = '左键'; break;
					case 'right': buttonText = '右键'; break;
					case 'middle': buttonText = '中键'; break;
					default: buttonText = '左键';
				}

				let gestureText = '';
				if (mouse.gesture?.startsWith('wheel-')) {
					gestureText = mouse.gesture === 'wheel-up' ? '滚轮上' : '滚轮下';
				} else if (mouse.gesture === 'click') {
					gestureText = '单击';
				} else if (mouse.gesture === 'double-click') {
					gestureText = '双击';
				} else if (mouse.gesture) {
					gestureText = mouse.gesture;
				}

				return `${buttonText} ${gestureText}`;
			case 'touch':
				return (binding as TouchGesture).gesture || '';
			case 'area':
				const area = binding as AreaClick;
				let areaButtonText = '';
				switch (area.button) {
					case 'left': areaButtonText = '左键'; break;
					case 'right': areaButtonText = '右键'; break;
					case 'middle': areaButtonText = '中键'; break;
					default: areaButtonText = '左键';
				}

				let areaText = '';
				switch (area.area) {
					case 'top-left': areaText = '左上'; break;
					case 'top-center': areaText = '中上'; break;
					case 'top-right': areaText = '右上'; break;
					case 'middle-left': areaText = '左中'; break;
					case 'middle-center': areaText = '中中'; break;
					case 'middle-right': areaText = '右中'; break;
					case 'bottom-left': areaText = '左下'; break;
					case 'bottom-center': areaText = '中下'; break;
					case 'bottom-right': areaText = '右下'; break;
					default: areaText = area.area;
				}

				let actionText = '';
				switch (area.action) {
					case 'click': actionText = '点击'; break;
					case 'double-click': actionText = '双击'; break;
					case 'press': actionText = '按住'; break;
					default: actionText = '点击';
				}

				return `${areaButtonText} ${areaText} ${actionText}`;
			default:
				return '';
		}
	}

	// ========== 实用方法 ==========

	/**
	 * 获取操作的所有绑定（包括上下文绑定）
	 */
	getAllBindingsForAction(action: string): { binding: InputBinding; context: BindingContext }[] {
		const ab = this.bindings.find(b => b.action === action);
		if (!ab) return [];

		const result: { binding: InputBinding; context: BindingContext }[] = [];

		// 全局绑定
		if (ab.bindings) {
			for (const b of ab.bindings) {
				result.push({ binding: b, context: 'global' });
			}
		}

		// 上下文绑定
		if (ab.contextBindings) {
			for (const cb of ab.contextBindings) {
				result.push({ binding: cb.input, context: cb.context });
			}
		}

		return result;
	}

	/**
	 * 获取指定上下文的所有绑定
	 */
	getBindingsForContext(context: BindingContext): { action: string; binding: InputBinding }[] {
		const result: { action: string; binding: InputBinding }[] = [];

		for (const ab of this.bindings) {
			// 检查全局绑定
			if (context === 'global' && ab.bindings) {
				for (const b of ab.bindings) {
					result.push({ action: ab.action, binding: b });
				}
			}

			// 检查上下文绑定
			if (ab.contextBindings) {
				for (const cb of ab.contextBindings) {
					if (cb.context === context) {
						result.push({ action: ab.action, binding: cb.input });
					}
				}
			}
		}

		return result;
	}

	/**
	 * 格式化上下文名称
	 */
	formatContext(context: BindingContext): string {
		const contextNames: Record<BindingContext, string> = {
			global: '全局',
			viewer: '图片模式',
			videoPlayer: '视频模式'
		};
		return contextNames[context] ?? context;
	}

	/**
	 * 获取所有可用上下文
	 */
	getAvailableContexts(): BindingContext[] {
		return ['global', 'viewer', 'videoPlayer'];
	}

	// 调试方法：打印所有绑定（包含上下文信息）
	debugBindings() {
		console.log('=== 当前所有绑定 ===');
		console.log(`活跃上下文: [${this._activeContexts.join(', ')}]`);
		console.log('');
		
		this.bindings.forEach(binding => {
			console.log(`操作: ${binding.action} (${binding.name})`);
			
			// 全局绑定
			if (binding.bindings && binding.bindings.length > 0) {
				console.log('  [全局]:');
				binding.bindings.forEach(b => {
					console.log(`    - ${this.formatBinding(b)}`);
				});
			}
			
			// 上下文绑定
			if (binding.contextBindings && binding.contextBindings.length > 0) {
				// 按上下文分组
				const byContext: Record<string, InputBinding[]> = {};
				for (const cb of binding.contextBindings) {
					if (!byContext[cb.context]) {
						byContext[cb.context] = [];
					}
					byContext[cb.context].push(cb.input);
				}
				
					for (const ctx of Object.keys(byContext)) {
					console.log(`  [${this.formatContext(ctx as BindingContext)}]:`);
					byContext[ctx].forEach(b => {
						console.log(`    - ${this.formatBinding(b)}`);
					});
				}
			}
			
			if ((!binding.bindings || binding.bindings.length === 0) && 
			    (!binding.contextBindings || binding.contextBindings.length === 0)) {
				console.log('  - 无绑定');
			}
		});
		console.log('================');
	}

	/**
	 * 调试方法：打印当前上下文状态
	 */
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
