<script lang="ts">
	/**
	 * 懒加载文件树视图 - 参考 NeeView 的延迟加载策略
	 * 核心思路：
	 * 1. 只在展开时才加载子节点
	 * 2. 使用虚拟化只渲染可见节点
	 * 3. 增量更新，不重建整棵树
	 * 4. 使用全局文件树缓存，避免重复加载
	 */
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { get } from 'svelte/store';
	import type { FsItem } from '$lib/types';
	import { Folder, File, Image as ImageIcon, FileArchive, ChevronDown, ChevronRight } from '@lucide/svelte';
	import { fileTreeCache } from '$lib/stores/fileTreeCache.svelte';

	interface LazyTreeNode {
		name: string;
		path: string;
		isDir: boolean;
		item?: FsItem;
		// 延迟加载：children 为 null 表示未加载，为空数组表示已加载但无子节点
		children: LazyTreeNode[] | null;
		childrenLoaded: boolean;
		expanded: boolean;
		level: number;
	}

	const {
		items = [],
		currentPath = '',
		thumbnails = new Map(),
		selectedIndex = -1,
		isCheckMode = false,
		isDeleteMode = false,
		selectedItems = new Set()
	}: {
		items?: FsItem[];
		currentPath?: string;
		thumbnails?: Map<string, string>;
		selectedIndex?: number;
		isCheckMode?: boolean;
		isDeleteMode?: boolean;
		selectedItems?: Set<string>;
	} = $props();

	const dispatch = createEventDispatcher();

	// --- 状态 ---
	let container: HTMLDivElement | undefined = $state();
	let rootNodes = $state<LazyTreeNode[]>([]);
	let flatList = $state<LazyTreeNode[]>([]);
	let expandedPaths = $state(new Set<string>());
	
	const ITEM_HEIGHT = 28;

	// --- 虚拟化 ---
	const virtualizer = createVirtualizer({
		get count() {
			return flatList.length;
		},
		getScrollElement: () => container ?? null,
		estimateSize: () => ITEM_HEIGHT,
		overscan: 15
	});

	const virtualItems = $derived($virtualizer.getVirtualItems());

	// --- 工具函数 ---
	function normalizePath(path: string): string {
		return path.replace(/\\/g, '/').replace(/\/+$/, '');
	}

	function getFileIcon(item: FsItem) {
		if (item.isDir) return Folder;
		if (item.isImage) return ImageIcon;
		if (item.name.match(/\.(zip|cbz|rar|cbr|7z)$/i)) return FileArchive;
		return File;
	}

	// --- 构建根节点（只构建第一层） ---
	function buildRootNodes(allItems: FsItem[]): LazyTreeNode[] {
		// 按路径分组，只取第一层
		const rootMap = new Map<string, LazyTreeNode>();
		
		for (const item of allItems) {
			const normalized = normalizePath(item.path);
			const parts = normalized.split('/').filter(p => p);
			
			if (parts.length === 0) continue;
			
			// 第一层节点
			const rootPart = parts[0];
			const rootPath = rootPart;
			
			if (!rootMap.has(rootPath)) {
				rootMap.set(rootPath, {
					name: rootPart,
					path: rootPath,
					isDir: true,
					item: parts.length === 1 ? item : undefined,
					children: null, // 延迟加载
					childrenLoaded: false,
					expanded: false,
					level: 0
				});
			}
			
			// 如果这个 item 就是根节点本身
			if (parts.length === 1) {
				const node = rootMap.get(rootPath)!;
				node.item = item;
				node.isDir = item.isDir;
			}
		}
		
		return Array.from(rootMap.values()).sort((a, b) => 
			a.name.localeCompare(b.name, undefined, { numeric: true })
		);
	}

	// --- 为节点加载子节点 ---
	function loadChildren(node: LazyTreeNode, allItems: FsItem[]): LazyTreeNode[] {
		const prefix = normalizePath(node.path) + '/';
		const children: LazyTreeNode[] = [];
		const childMap = new Map<string, LazyTreeNode>();
		
		for (const item of allItems) {
			const normalized = normalizePath(item.path);
			
			if (!normalized.startsWith(prefix)) continue;
			
			const remaining = normalized.slice(prefix.length);
			const parts = remaining.split('/').filter(p => p);
			
			if (parts.length === 0) continue;
			
			// 直接子节点
			const childName = parts[0];
			const childPath = node.path + '/' + childName;
			
			if (!childMap.has(childPath)) {
				childMap.set(childPath, {
					name: childName,
					path: childPath,
					isDir: parts.length > 1 || item.isDir,
					item: parts.length === 1 ? item : undefined,
					children: null,
					childrenLoaded: false,
					expanded: false,
					level: node.level + 1
				});
			}
			
			if (parts.length === 1) {
				const child = childMap.get(childPath)!;
				child.item = item;
				child.isDir = item.isDir;
			}
		}
		
		return Array.from(childMap.values()).sort((a, b) => 
			a.name.localeCompare(b.name, undefined, { numeric: true })
		);
	}

	// --- 展开/折叠节点 ---
	function toggleNode(node: LazyTreeNode) {
		node.expanded = !node.expanded;
		
		if (node.expanded) {
			expandedPaths.add(node.path);
			
			// 延迟加载子节点
			if (!node.childrenLoaded) {
				// 优先从全局缓存加载
				const fsPath = node.item?.path || node.path;
				const cachedChildren = fileTreeCache.getChildren(fsPath);
				
				if (cachedChildren && cachedChildren.length > 0) {
					// 缓存命中，直接构建子节点
					node.children = cachedChildren
						.filter(item => item.isDir)
						.map(item => ({
							name: item.name,
							path: normalizePath(item.path),
							isDir: item.isDir,
							item: item,
							children: null,
							childrenLoaded: false,
							expanded: false,
							level: node.level + 1
						}))
						.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
					node.childrenLoaded = true;
				} else {
					// 缓存未命中，从 items 加载并触发后端请求
					node.children = loadChildren(node, items);
					node.childrenLoaded = true;
					
					// 触发后端加载更多子目录
					if (node.item) {
						dispatch('toggleNode', {
							path: node.path,
							fsPath: node.item.path,
							isDir: node.isDir,
							hasChildren: (node.children?.length ?? 0) > 0
						});
					}
				}
			}
		} else {
			expandedPaths.delete(node.path);
		}
		
		// 重建扁平列表
		rebuildFlatList();
	}

	// --- 重建扁平列表（只包含可见节点） ---
	function rebuildFlatList() {
		const result: LazyTreeNode[] = [];
		
		function traverse(nodes: LazyTreeNode[]) {
			for (const node of nodes) {
				result.push(node);
				
				if (node.expanded && node.children) {
					traverse(node.children);
				}
			}
		}
		
		traverse(rootNodes);
		flatList = result;
	}

	// --- 监听 items 变化（只在根节点变化时重建） ---
	let lastRootPaths = $state<string>('');
	
	$effect(() => {
		// 计算当前根节点路径的签名
		const rootPaths = items
			.filter(item => item.isDir)
			.map(item => normalizePath(item.path).split('/')[0])
			.filter((v, i, a) => a.indexOf(v) === i)
			.sort()
			.join('|');
		
		// 只在根节点变化时重建
		if (rootPaths !== lastRootPaths) {
			lastRootPaths = rootPaths;
			
			// 保存展开状态
			const wasExpanded = new Set(expandedPaths);
			
			// 重建根节点
			rootNodes = buildRootNodes(items);
			
			// 恢复展开状态（只使用缓存，不触发后端请求）
			function restoreExpanded(nodes: LazyTreeNode[]) {
				for (const node of nodes) {
					if (wasExpanded.has(node.path)) {
						node.expanded = true;
						expandedPaths.add(node.path);
						
						if (!node.childrenLoaded) {
							// 只从全局缓存加载，不触发后端请求
							const fsPath = node.item?.path || node.path;
							const cachedChildren = fileTreeCache.getChildren(fsPath);
							
							if (cachedChildren && cachedChildren.length > 0) {
								node.children = cachedChildren
									.filter(item => item.isDir)
									.map(item => ({
										name: item.name,
										path: normalizePath(item.path),
										isDir: item.isDir,
										item: item,
										children: null,
										childrenLoaded: false,
										expanded: false,
										level: node.level + 1
									}))
									.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
								node.childrenLoaded = true;
							}
							// 如果缓存没有，不加载，等用户手动展开
						}
						
						if (node.children) {
							restoreExpanded(node.children);
						}
					}
				}
			}
			
			restoreExpanded(rootNodes);
			rebuildFlatList();
		}
	});

	// --- 事件处理 ---
	function handleItemClick(item: FsItem, index: number) {
		dispatch('itemClick', { item, index });
	}

	function handleItemDoubleClick(item: FsItem, index: number) {
		dispatch('itemDoubleClick', { item, index });
	}

	function handleItemContextMenu(event: MouseEvent, item: FsItem) {
		event.preventDefault();
		dispatch('itemContextMenu', { event, item });
	}

	function toggleItemSelection(path: string) {
		const next = new Set(selectedItems);
		if (next.has(path)) {
			next.delete(path);
		} else {
			next.add(path);
		}
		dispatch('selectionChange', { selectedItems: next });
	}

	// --- 当前路径高亮 ---
	let normalizedCurrentPath = $derived(currentPath ? normalizePath(currentPath) : '');
</script>

<div 
	bind:this={container}
	class="file-tree-view flex-1 overflow-y-auto p-2"
>
	<div class="mb-2 px-2 text-xs text-muted-foreground">
		找到 {items.length} 个结果
	</div>

	<div style="height: {$virtualizer.getTotalSize()}px; position: relative; width: 100%;">
		{#each virtualItems as virtualItem (flatList[virtualItem.index]?.path ?? virtualItem.index)}
			{@const node = flatList[virtualItem.index]}
			{@const item = node?.item}
			{@const hasChildren = node?.isDir}
			{@const Icon = item ? getFileIcon(item) : Folder}
			{@const nodePath = normalizePath(item?.path ?? node?.path ?? '')}
			{@const isActive = normalizedCurrentPath && nodePath === normalizedCurrentPath}

			{#if node}
				<div
					class="tree-node flex cursor-pointer items-center gap-1 rounded px-2 py-1 {isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/70'}"
					style="position: absolute; top: 0; left: 0; width: 100%; height: {ITEM_HEIGHT}px; transform: translateY({virtualItem.start}px); padding-left: {node.level * 16 + 8}px"
					data-path={nodePath}
					role="button"
					tabindex="0"
					onclick={() => {
						if (item) {
							handleItemClick(item, virtualItem.index);
						} else if (hasChildren) {
							toggleNode(node);
						}
					}}
					onkeydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							if (item) {
								handleItemClick(item, virtualItem.index);
							} else if (hasChildren) {
								toggleNode(node);
							}
						}
					}}
					ondblclick={() => {
						if (item) {
							handleItemDoubleClick(item, virtualItem.index);
						}
					}}
					oncontextmenu={(e) => {
						if (item) {
							handleItemContextMenu(e, item);
						}
					}}
				>
					<!-- 展开/折叠图标 -->
					{#if node.isDir}
						<button
							class="shrink-0 rounded p-0.5 hover:bg-muted/60"
							onclick={(e) => {
								e.stopPropagation();
								toggleNode(node);
							}}
						>
							{#if node.expanded}
								<ChevronDown class="h-3.5 w-3.5 text-muted-foreground" />
							{:else}
								<ChevronRight class="h-3.5 w-3.5 text-muted-foreground" />
							{/if}
						</button>
					{:else}
						<div class="w-4"></div>
					{/if}

					<!-- 勾选框 -->
					{#if isCheckMode && item}
						<button
							class="shrink-0"
							onclick={(e) => {
								e.stopPropagation();
								toggleItemSelection(item.path);
							}}
						>
							<div
								class="flex h-4 w-4 items-center justify-center rounded-sm border border-border bg-background text-foreground transition-colors {selectedItems.has(item.path)
									? 'bg-primary text-primary-foreground border-primary shadow-sm'
									: 'hover:border-primary hover:bg-accent/80'}"
							>
								{#if selectedItems.has(item.path)}
									<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
									</svg>
								{/if}
							</div>
						</button>
					{/if}

					<!-- 图标 -->
					<Icon
						class="h-4 w-4 shrink-0 {node.isDir
							? 'text-primary'
							: item?.isImage
								? 'text-primary'
								: 'text-muted-foreground'}"
					/>

					<!-- 名称 -->
					<span
						class="flex-1 truncate text-sm {item && !item.isDir
							? 'text-foreground'
							: 'font-medium text-foreground'} {isActive ? 'font-semibold' : ''}"
					>
						{node.name}
					</span>

					<!-- 子节点数量指示器 -->
					{#if node.isDir && !node.childrenLoaded}
						<span class="shrink-0 text-[10px] text-muted-foreground">...</span>
					{:else if node.children && node.children.length > 0}
						<span class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
							{node.children.length}
						</span>
					{/if}
				</div>
			{/if}
		{/each}
	</div>
</div>

<style>
	.file-tree-view {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
	}

	.tree-node {
		transition: background-color 0.15s ease;
	}

	.tree-node:focus {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}
</style>
