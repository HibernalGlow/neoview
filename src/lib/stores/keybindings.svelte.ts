/**
 * 统一的操作绑定系统
 * 参考 NeeView 设计：一个操作可以绑定多个输入方式
 */

export type InputType = 'keyboard' | 'mouse' | 'touch';

export interface KeyBinding {
	type: 'keyboard';
	key: string; // 例如: 'ArrowRight', 'Ctrl+Z'
}

export interface MouseGesture {
	type: 'mouse';
	gesture: string; // 例如: 'L', 'R', 'U', 'D', 'LD'
	button?: 'left' | 'right' | 'middle';
}

export interface TouchGesture {
	type: 'touch';
	gesture: string; // 例如: 'swipe-left', 'pinch', 'two-finger-tap'
}

export type InputBinding = KeyBinding | MouseGesture | TouchGesture;

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
		bindings: [
			{ type: 'keyboard', key: 'ArrowRight' },
			{ type: 'keyboard', key: 'Space' },
			{ type: 'keyboard', key: 'PageDown' },
			{ type: 'mouse', gesture: 'L', button: 'left' },
			{ type: 'touch', gesture: 'swipe-left' }
		]
	},
	{
		action: 'prevPage',
		name: '上一页',
		category: '导航',
		description: '翻到上一页',
		bindings: [
			{ type: 'keyboard', key: 'ArrowLeft' },
			{ type: 'keyboard', key: 'Backspace' },
			{ type: 'keyboard', key: 'PageUp' },
			{ type: 'mouse', gesture: 'R', button: 'left' },
			{ type: 'touch', gesture: 'swipe-right' }
		]
	},
	{
		action: 'firstPage',
		name: '第一页',
		category: '导航',
		description: '跳转到第一页',
		bindings: [
			{ type: 'keyboard', key: 'Home' },
			{ type: 'keyboard', key: 'Ctrl+Home' }
		]
	},
	{
		action: 'lastPage',
		name: '最后一页',
		category: '导航',
		description: '跳转到最后一页',
		bindings: [
			{ type: 'keyboard', key: 'End' },
			{ type: 'keyboard', key: 'Ctrl+End' }
		]
	},

	// === 缩放操作 ===
	{
		action: 'zoomIn',
		name: '放大',
		category: '缩放',
		description: '放大图片',
		bindings: [
			{ type: 'keyboard', key: 'Plus' },
			{ type: 'keyboard', key: 'Ctrl+Plus' },
			{ type: 'keyboard', key: 'Ctrl+Wheel' }, // 鼠标滚轮
			{ type: 'mouse', gesture: 'U', button: 'right' },
			{ type: 'touch', gesture: 'pinch-out' }
		]
	},
	{
		action: 'zoomOut',
		name: '缩小',
		category: '缩放',
		description: '缩小图片',
		bindings: [
			{ type: 'keyboard', key: 'Minus' },
			{ type: 'keyboard', key: 'Ctrl+Minus' },
			{ type: 'mouse', gesture: 'D', button: 'right' },
			{ type: 'touch', gesture: 'pinch-in' }
		]
	},
	{
		action: 'fitWindow',
		name: '适应窗口',
		category: '缩放',
		description: '图片适应窗口大小',
		bindings: [
			{ type: 'keyboard', key: 'F' },
			{ type: 'keyboard', key: '0' }
		]
	},
	{
		action: 'actualSize',
		name: '实际大小',
		category: '缩放',
		description: '显示图片实际尺寸',
		bindings: [
			{ type: 'keyboard', key: 'Ctrl+0' },
			{ type: 'keyboard', key: 'Ctrl+1' }
		]
	},

	// === 视图操作 ===
	{
		action: 'fullscreen',
		name: '全屏',
		category: '视图',
		description: '切换全屏模式',
		bindings: [
			{ type: 'keyboard', key: 'F11' },
			{ type: 'keyboard', key: 'Enter' },
			{ type: 'touch', gesture: 'double-tap' }
		]
	},
	{
		action: 'toggleSidebar',
		name: '侧边栏',
		category: '视图',
		description: '显示/隐藏侧边栏',
		bindings: [
			{ type: 'keyboard', key: 'Tab' },
			{ type: 'keyboard', key: 'Ctrl+B' }
		]
	},
	{
		action: 'toggleBookMode',
		name: '书籍模式',
		category: '视图',
		description: '切换单页/双页模式',
		bindings: [
			{ type: 'keyboard', key: 'B' },
			{ type: 'keyboard', key: 'Ctrl+D' }
		]
	},
	{
		action: 'rotate',
		name: '旋转',
		category: '视图',
		description: '旋转图片90度',
		bindings: [
			{ type: 'keyboard', key: 'R' },
			{ type: 'mouse', gesture: 'RU', button: 'right' }
		]
	},

	// === 文件操作 ===
	{
		action: 'openFile',
		name: '打开文件',
		category: '文件',
		description: '打开文件对话框',
		bindings: [
			{ type: 'keyboard', key: 'Ctrl+O' }
		]
	},
	{
		action: 'closeFile',
		name: '关闭文件',
		category: '文件',
		description: '关闭当前文件',
		bindings: [
			{ type: 'keyboard', key: 'Ctrl+W' },
			{ type: 'keyboard', key: 'Escape' }
		]
	},
	{
		action: 'deleteFile',
		name: '删除文件',
		category: '文件',
		description: '删除当前文件',
		bindings: [
			{ type: 'keyboard', key: 'Delete' },
			{ type: 'keyboard', key: 'Shift+Delete' }
		]
	}
];

// 创建响应式 store
class KeyBindingsStore {
	bindings = $state<ActionBinding[]>([...defaultBindings]);

	constructor() {
		// 从 localStorage 加载自定义绑定
		this.loadFromStorage();
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
			const keyBinding = binding.bindings.find(
				b => b.type === 'keyboard' && (b as KeyBinding).key === key
			);
			if (keyBinding) {
				return binding.action;
			}
		}
		return null;
	}

	// 根据鼠标手势查找操作
	findActionByMouseGesture(gesture: string, button: 'left' | 'right' | 'middle' = 'left'): string | null {
		for (const binding of this.bindings) {
			const mouseBinding = binding.bindings.find(
				b => b.type === 'mouse' && 
					(b as MouseGesture).gesture === gesture &&
					((b as MouseGesture).button || 'left') === button
			);
			if (mouseBinding) {
				return binding.action;
			}
		}
		return null;
	}

	// 根据触摸手势查找操作
	findActionByTouchGesture(gesture: string): string | null {
		for (const binding of this.bindings) {
			const touchBinding = binding.bindings.find(
				b => b.type === 'touch' && (b as TouchGesture).gesture === gesture
			);
			if (touchBinding) {
				return binding.action;
			}
		}
		return null;
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
				this.bindings = JSON.parse(stored);
			}
		} catch (error) {
			console.error('Failed to load keybindings:', error);
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
				return `${mouse.button || 'left'} ${mouse.gesture || ''}`;
			case 'touch':
				return (binding as TouchGesture).gesture || '';
			default:
				return '';
		}
	}
}

// 导出单例
export const keyBindingsStore = new KeyBindingsStore();
