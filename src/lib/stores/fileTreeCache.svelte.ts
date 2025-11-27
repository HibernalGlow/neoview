/**
 * 文件树缓存系统 - 参考 NeeView 的 NodeTree/FileTree 设计
 * 
 * 核心思想：
 * 1. 一次性加载完整目录树到内存
 * 2. 使用 Map 实现 O(1) 路径查找
 * 3. 子目录展开直接从缓存读取，无需后端调用
 * 4. 支持增量更新（添加/删除/重命名）
 */

import type { FsItem } from '$lib/types';

// 树节点
export interface TreeNode {
	name: string;
	path: string;
	isDir: boolean;
	item?: FsItem;
	children: Map<string, TreeNode> | null;
	parent: TreeNode | null;
}

// 文件树缓存
class FileTreeCache {
	// 根路径 -> 树根节点
	private trees = new Map<string, TreeNode>();
	// 路径 -> 节点（快速查找）
	private nodeIndex = new Map<string, TreeNode>();
	// 路径 -> 子项列表缓存
	private childrenCache = new Map<string, FsItem[]>();
	// 已加载的根路径集合
	private loadedRoots = new Set<string>();
	
	/**
	 * 规范化路径
	 */
	private normalizePath(path: string): string {
		return path.replace(/\\/g, '/').replace(/\/+$/, '');
	}
	
	/**
	 * 分割路径为段
	 */
	private splitPath(path: string): string[] {
		const normalized = this.normalizePath(path);
		return normalized.split('/').filter(p => p);
	}
	
	/**
	 * 检查是否已加载某个根目录
	 */
	isRootLoaded(rootPath: string): boolean {
		return this.loadedRoots.has(this.normalizePath(rootPath));
	}
	
	/**
	 * 初始化树（从根目录的子项列表）
	 */
	initTree(rootPath: string, items: FsItem[]): void {
		const normalizedRoot = this.normalizePath(rootPath);
		
		// 创建根节点
		const rootNode: TreeNode = {
			name: normalizedRoot.split('/').pop() || normalizedRoot,
			path: normalizedRoot,
			isDir: true,
			children: new Map(),
			parent: null
		};
		
		this.trees.set(normalizedRoot, rootNode);
		this.nodeIndex.set(normalizedRoot, rootNode);
		
		// 添加所有子项
		for (const item of items) {
			this.addItem(item, rootNode);
		}
		
		// 缓存根目录的子项
		this.childrenCache.set(normalizedRoot, items);
		this.loadedRoots.add(normalizedRoot);
		
		console.log(`📁 FileTreeCache: 初始化树 ${normalizedRoot}, ${items.length} 项`);
	}
	
	/**
	 * 添加单个项到树中
	 */
	private addItem(item: FsItem, rootNode: TreeNode): TreeNode | null {
		const normalizedPath = this.normalizePath(item.path);
		const parts = this.splitPath(normalizedPath);
		
		if (parts.length === 0) return null;
		
		let currentNode = rootNode;
		const rootParts = this.splitPath(rootNode.path);
		
		// 跳过根路径部分
		const relativeParts = parts.slice(rootParts.length);
		
		for (let i = 0; i < relativeParts.length; i++) {
			const part = relativeParts[i];
			const isLast = i === relativeParts.length - 1;
			
			if (!currentNode.children) {
				currentNode.children = new Map();
			}
			
			let childNode = currentNode.children.get(part);
			
			if (!childNode) {
				const childPath = currentNode.path + '/' + part;
				childNode = {
					name: part,
					path: childPath,
					isDir: isLast ? item.isDir : true,
					item: isLast ? item : undefined,
					children: null,
					parent: currentNode
				};
				currentNode.children.set(part, childNode);
				this.nodeIndex.set(childPath, childNode);
			}
			
			if (isLast) {
				childNode.item = item;
				childNode.isDir = item.isDir;
			}
			
			currentNode = childNode;
		}
		
		return currentNode;
	}
	
	/**
	 * 添加子目录内容到缓存
	 */
	addChildren(parentPath: string, children: FsItem[]): void {
		const normalizedParent = this.normalizePath(parentPath);
		
		// 缓存子项列表
		this.childrenCache.set(normalizedParent, children);
		
		// 找到父节点
		const parentNode = this.nodeIndex.get(normalizedParent);
		if (!parentNode) {
			// 父节点不存在，尝试找到最近的根
			for (const [rootPath, rootNode] of this.trees) {
				if (normalizedParent.startsWith(rootPath)) {
					// 添加所有子项到树中
					for (const child of children) {
						this.addItem(child, rootNode);
					}
					return;
				}
			}
			return;
		}
		
		// 确保父节点有 children Map
		if (!parentNode.children) {
			parentNode.children = new Map();
		}
		
		// 添加子项到树中
		for (const child of children) {
			const normalizedChildPath = this.normalizePath(child.path);
			const childName = normalizedChildPath.split('/').pop() || '';
			
			let childNode = parentNode.children.get(childName);
			if (!childNode) {
				childNode = {
					name: childName,
					path: normalizedChildPath,
					isDir: child.isDir,
					item: child,
					children: null,
					parent: parentNode
				};
				parentNode.children.set(childName, childNode);
				this.nodeIndex.set(normalizedChildPath, childNode);
			} else {
				childNode.item = child;
				childNode.isDir = child.isDir;
			}
		}
	}
	
	/**
	 * 获取子目录内容（从缓存）
	 */
	getChildren(parentPath: string): FsItem[] | null {
		const normalizedParent = this.normalizePath(parentPath);
		
		// 先检查直接缓存
		const cached = this.childrenCache.get(normalizedParent);
		if (cached) {
			return cached;
		}
		
		// 从树结构中构建
		const parentNode = this.nodeIndex.get(normalizedParent);
		if (!parentNode || !parentNode.children) {
			return null;
		}
		
		const children: FsItem[] = [];
		for (const childNode of parentNode.children.values()) {
			if (childNode.item) {
				children.push(childNode.item);
			} else {
				// 创建一个基本的 FsItem
				children.push({
					path: childNode.path,
					name: childNode.name,
					isDir: childNode.isDir,
					isImage: false,
					size: 0,
					modified: 0
				});
			}
		}
		
		// 缓存结果
		if (children.length > 0) {
			this.childrenCache.set(normalizedParent, children);
		}
		
		return children.length > 0 ? children : null;
	}
	
	/**
	 * 检查路径是否在缓存中
	 */
	hasPath(path: string): boolean {
		return this.nodeIndex.has(this.normalizePath(path));
	}
	
	/**
	 * 获取节点
	 */
	getNode(path: string): TreeNode | null {
		return this.nodeIndex.get(this.normalizePath(path)) || null;
	}
	
	/**
	 * 清除特定根目录的缓存
	 */
	clearTree(rootPath: string): void {
		const normalizedRoot = this.normalizePath(rootPath);
		
		// 删除所有相关的索引
		for (const [path] of this.nodeIndex) {
			if (path.startsWith(normalizedRoot)) {
				this.nodeIndex.delete(path);
				this.childrenCache.delete(path);
			}
		}
		
		this.trees.delete(normalizedRoot);
		this.loadedRoots.delete(normalizedRoot);
	}
	
	/**
	 * 清除所有缓存
	 */
	clearAll(): void {
		this.trees.clear();
		this.nodeIndex.clear();
		this.childrenCache.clear();
		this.loadedRoots.clear();
	}
	
	/**
	 * 获取缓存统计
	 */
	getStats(): { trees: number; nodes: number; cachedPaths: number } {
		return {
			trees: this.trees.size,
			nodes: this.nodeIndex.size,
			cachedPaths: this.childrenCache.size
		};
	}
}

// 单例导出
export const fileTreeCache = new FileTreeCache();
