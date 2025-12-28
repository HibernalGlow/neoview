/**
 * FolderStack 层叠栈状态管理 - 核心状态类
 * 使用 Svelte 5 runes 实现响应式状态管理
 */

import type { FsItem } from '$lib/types';

/** 层叠数据结构 */
export interface FolderLayer {
	id: string;
	path: string;
	items: FsItem[];
	loading: boolean;
	error: string | null;
	selectedIndex: number;
	scrollTop: number;
}

/** 创建层的工厂函数类型 */
export type LayerFactory = (path: string) => Promise<FolderLayer>;

/** 等待 DOM 更新的回调类型 */
export type TickCallback = () => Promise<void>;

/**
 * 层叠栈状态管理器
 * 负责管理 layers 数组和 activeIndex
 */
export class FolderStackState {
	// 层叠栈
	layers = $state<FolderLayer[]>([]);
	
	// 当前活跃层索引
	activeIndex = $state(0);
	
	// 动画状态
	isAnimating = $state(false);
	
	// 最后导航的路径（防止重复处理）
	lastNavigatedPath = $state('');
	
	// 是否正在处理导航命令
	isProcessingNavCommand = $state(false);
	
	// 动画持续时间 (ms)
	private animationDuration = 300;
	
	// 层创建工厂
	private createLayerFn: LayerFactory;
	
	// 等待 DOM 更新的回调
	private tickFn: TickCallback;
	
	// Store 同步回调
	private onPathChange?: (path: string, addToHistory: boolean) => void;
	private onItemsChange?: (items: FsItem[]) => void;
	
	constructor(
		createLayerFn: LayerFactory,
		tickFn: TickCallback,
		callbacks?: {
			onPathChange?: (path: string, addToHistory: boolean) => void;
			onItemsChange?: (items: FsItem[]) => void;
		}
	) {
		this.createLayerFn = createLayerFn;
		this.tickFn = tickFn;
		this.onPathChange = callbacks?.onPathChange;
		this.onItemsChange = callbacks?.onItemsChange;
	}
	
	/** 获取当前活动层 */
	get activeLayer(): FolderLayer | undefined {
		return this.layers[this.activeIndex];
	}
	
	/** 更新最后导航路径 */
	updateLastNavigatedPath(path: string): void {
		this.lastNavigatedPath = path;
	}
	
	/** 同步 store */
	private syncStore(path: string, addToHistory = true): void {
		this.onPathChange?.(path, addToHistory);
		const layer = this.activeLayer;
		if (layer) {
			this.onItemsChange?.(layer.items);
		}
	}
	
	/** 开始动画并设置超时结束 */
	private startAnimation(): void {
		this.isAnimating = true;
		setTimeout(() => {
			this.isAnimating = false;
		}, this.animationDuration);
	}
	
	/** 初始化根层 */
	async initRoot(path: string, addToHistory = true): Promise<void> {
		this.updateLastNavigatedPath(path);
		const layer = await this.createLayerFn(path);
		this.layers = [layer];
		this.activeIndex = 0;
		this.syncStore(path, addToHistory);
	}
	
	/** 切换到指定层（不重新加载） */
	switchToLayer(index: number): boolean {
		if (index < 0 || index >= this.layers.length) return false;
		if (index === this.activeIndex) return false;
		
		this.startAnimation();
		this.activeIndex = index;
		const layer = this.layers[index];
		this.updateLastNavigatedPath(layer.path);
		this.syncStore(layer.path, false);
		return true;
	}
	
	/** 推入新层 */
	async pushLayer(path: string, isChild: boolean): Promise<void> {
		if (this.isAnimating) return;
		
		this.updateLastNavigatedPath(path);
		
		// 先加载新层数据
		const newLayer = await this.createLayerFn(path);
		
		if (isChild) {
			// 子目录：分两步动画
			// 1. 先添加新层到 DOM（此时在屏幕外 translateX: 100%）
			this.layers = [...this.layers.slice(0, this.activeIndex + 1), newLayer];
			
			// 2. 等待 DOM 更新
			await this.tickFn();
			
			// 3. 开始动画并改变 activeIndex，触发 CSS transition
			this.startAnimation();
			this.activeIndex = this.layers.length - 1;
		} else {
			// 不相关路径：直接重新初始化栈（无需动画）
			this.layers = [newLayer];
			this.activeIndex = 0;
		}
		
		this.syncStore(path, true);
	}
	
	/** 弹出当前层 */
	popLayer(): boolean {
		if (this.isAnimating) return false;
		if (this.activeIndex <= 0) return false;
		
		this.startAnimation();
		this.activeIndex--;
		
		const layer = this.activeLayer;
		if (layer) {
			this.updateLastNavigatedPath(layer.path);
			this.syncStore(layer.path, true);
		}
		
		return true;
	}
	
	/** 在栈顶插入多个父层 */
	async insertParentLayers(paths: string[]): Promise<void> {
		if (paths.length === 0) return;
		
		// 先加载所有层数据
		const newLayers = await Promise.all(
			paths.map(p => this.createLayerFn(p))
		);
		
		// 1. 先插入新层到 DOM（在屏幕外）
		const oldActiveIndex = this.activeIndex;
		this.layers = [...newLayers.reverse(), ...this.layers];
		// 调整 activeIndex 保持当前层位置
		this.activeIndex = oldActiveIndex + newLayers.length;
		
		// 2. 等待 DOM 更新
		await this.tickFn();
		
		// 3. 开始动画并切换到目标层
		this.startAnimation();
		this.activeIndex = newLayers.length - 1;
		this.updateLastNavigatedPath(paths[0]);
		this.syncStore(paths[0], true);
	}
	
	/** 在指定索引处截断并追加新层 */
	async truncateAndAppend(parentIndex: number, path: string): Promise<void> {
		// 先加载新层数据
		const newLayer = await this.createLayerFn(path);
		
		// 1. 先截断并添加新层到 DOM
		this.layers = this.layers.slice(0, parentIndex + 1);
		this.layers = [...this.layers, newLayer];
		
		// 2. 等待 DOM 更新
		await this.tickFn();
		
		// 3. 开始动画并切换到新层
		this.startAnimation();
		this.activeIndex = this.layers.length - 1;
		this.syncStore(path, false);
	}
	
	/** 在子层之前插入多个层 */
	async insertBeforeChild(childIndex: number, paths: string[]): Promise<void> {
		// 先加载所有层数据
		const insertLayers = await Promise.all(
			paths.map(p => this.createLayerFn(p))
		);
		
		// 1. 先插入新层到 DOM
		const oldLayers = this.layers.slice(childIndex);
		this.layers = [...insertLayers.reverse(), ...oldLayers];
		
		// 2. 等待 DOM 更新
		await this.tickFn();
		
		// 3. 开始动画并切换到目标层
		this.startAnimation();
		this.activeIndex = insertLayers.length - 1;
		this.syncStore(paths[0], false);
	}
	
	/** 更新层的选中索引 */
	updateSelectedIndex(layerIndex: number, index: number): void {
		if (layerIndex >= 0 && layerIndex < this.layers.length) {
			this.layers[layerIndex].selectedIndex = index;
		}
	}
	
	/** 从层中删除项目 */
	removeItemFromLayer(layerIndex: number, itemPath: string): void {
		this.layers = this.layers.map((layer, idx) => {
			if (idx === layerIndex) {
				return {
					...layer,
					items: layer.items.filter(i => i.path !== itemPath)
				};
			}
			return layer;
		});
	}
	
	/** 更新层的数据 */
	updateLayerItems(layerId: string, items: FsItem[]): void {
		const layer = this.layers.find(l => l.id === layerId);
		if (layer) {
			layer.items = items;
			if (layer === this.activeLayer) {
				this.onItemsChange?.(items);
			}
		}
	}
	
	/** 查找层索引 */
	findLayerByPath(path: string, normalize: (p: string) => string): number {
		const normalizedPath = normalize(path);
		return this.layers.findIndex(l => normalize(l.path) === normalizedPath);
	}
}

/** 创建 FolderStack 状态实例的工厂函数 */
export function createFolderStackState(
	createLayerFn: LayerFactory,
	callbacks?: {
		onPathChange?: (path: string, addToHistory: boolean) => void;
		onItemsChange?: (items: FsItem[]) => void;
	}
): FolderStackState {
	return new FolderStackState(createLayerFn, callbacks);
}
