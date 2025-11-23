/**
 * 统一的操作绑定系统
 * 参考 NeeView 设计：一个操作可以绑定多个输入方式
 */

export type InputType = 'keyboard' | 'mouse' | 'touch' | 'area';

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

export interface ActionBinding {
	action: string; // 操作ID，例如: 'nextPage'
	name: string; // 显示名称，例如: '下一页'
	category: string; // 分类：导航、缩放、视图、文件
	description: string; // 描述
	bindings: InputBinding[]; // 可以绑定多个输入方式
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

	// === 视图操作 ===
	{
		action: 'fullscreen',
		name: '全屏',
		category: '视图',
		description: '切换全屏模式',
		bindings: []
	},
	{
		action: 'toggleSidebar',
		name: '侧边栏',
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

	constructor() {
		// 从 localStorage 加载自定义绑定
		this.loadFromStorage();
		if (typeof window !== 'undefined') {
			window.addEventListener('storage', this.handleStorageChange);
		}
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
					bindings: storedBinding.bindings ?? def.bindings
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

	// 添加绑定到操作
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

	// 移除绑定
	removeBinding(action: string, bindingIndex: number) {
		const actionBinding = this.bindings.find(b => b.action === action);
		if (actionBinding && actionBinding.bindings && actionBinding.bindings[bindingIndex]) {
			actionBinding.bindings.splice(bindingIndex, 1);
			this.saveToStorage();
		}
	}

	// 清除操作的所有绑定
	clearBindings(action: string) {
		const actionBinding = this.bindings.find(b => b.action === action);
		if (actionBinding) {
			actionBinding.bindings = [];
			this.saveToStorage();
		}
	}

	// 重置为默认绑定
	resetToDefault() {
		this.bindings = [...defaultBindings];
		this.saveToStorage();
	}

	// 根据键盘按键查找操作
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

	// 调试方法：打印所有绑定
	debugBindings() {
		console.log('=== 当前所有绑定 ===');
		this.bindings.forEach(binding => {
			console.log(`操作: ${binding.action} (${binding.name})`);
			if (binding.bindings && binding.bindings.length > 0) {
				binding.bindings.forEach(b => {
					console.log(`  - ${this.formatBinding(b)}`);
				});
			} else {
				console.log('  - 无绑定');
			}
		});
		console.log('================');
	}
}

// 导出单例
export const keyBindingsStore = new KeyBindingsStore();
