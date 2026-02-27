<script lang="ts">
	/**
	 * FolderTree - 文件夹树组件
	 * 使用 shadcn tree-view 组件重构，带层级线和彩色图标
	 * 支持 IndexedDB 缓存和增量更新
	 */
	import { onMount } from 'svelte';
	import {
		ChevronRight,
		ChevronDown,
		Folder,
		FolderOpen,
		HardDrive,
		Loader2,
		Pin
	} from '@lucide/svelte';
	import { FileSystemAPI } from '$lib/api';
	import type { FsItem } from '$lib/types';
	import { tabCurrentPath, folderTabActions } from '../stores/folderTabStore';
	import { folderTreePinStore } from '$lib/stores/folderTreePin.svelte';
	import * as TreeView from '$lib/components/ui/tree-view';
	import { cn } from '$lib/utils';
	import * as TreeCache from '$lib/stores/folderTreeCache';

	// 别名映射
	const currentPath = tabCurrentPath;

	interface Props {
		onNavigate?: (path: string) => void;
		onContextMenu?: (event: MouseEvent, item: FsItem) => void;
	}

	let { onNavigate, onContextMenu }: Props = $props();

	interface TreeNode {
		path: string;
		name: string;
		isRoot: boolean;
		expanded: boolean;
		loading: boolean;
		children: TreeNode[];
		error?: string;
		/** 是否有子目录（用于显示展开箭头，来自缓存） */
		hasChildren?: boolean;
	}

	// 树状态
	let roots = $state<TreeNode[]>([]);
	let loadingRoots = $state(true);
	let pinnedPathSet = $state<Set<string>>(new Set());
	const loadChildrenInFlight = new Map<string, Promise<void>>();
	// 缓存是否已初始化
	let cacheInitialized = $state(false);
	let unpinSubscription: (() => void) | null = null;
	let normalizedCurrentPath = $derived($currentPath.replace(/\\/g, '/').toLowerCase());

	function normalizePath(path: string): string {
		return path.replace(/\\/g, '/').toLowerCase();
	}

	function compareTreeNode(a: TreeNode, b: TreeNode): number {
		const aPinned = pinnedPathSet.has(normalizePath(a.path));
		const bPinned = pinnedPathSet.has(normalizePath(b.path));
		if (aPinned !== bPinned) {
			return aPinned ? -1 : 1;
		}
		return a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
	}

	function isPinned(nodePath: string): boolean {
		return pinnedPathSet.has(normalizePath(nodePath));
	}

	function sortTreeRecursively(nodes: TreeNode[] = roots) {
		nodes.sort(compareTreeNode);
		for (const node of nodes) {
			if (node.children.length > 0) {
				sortTreeRecursively(node.children);
			}
		}
	}

	// 根据深度生成颜色（使用主题色，深度越深颜色越深）
	function getDepthColor(depth: number): string {
		const opacities = [
			'text-primary/60',
			'text-primary/70',
			'text-primary/80',
			'text-primary/90',
			'text-primary'
		];
		return opacities[Math.min(depth, opacities.length - 1)];
	}

	// 获取层级线颜色（使用主题色边框）
	function getLineColor(depth: number): string {
		const opacities = [
			'border-primary/20',
			'border-primary/30',
			'border-primary/40',
			'border-primary/50',
			'border-primary/60'
		];
		return opacities[Math.min(depth, opacities.length - 1)];
	}

	// 从缓存恢复树结构
	async function restoreFromCache(): Promise<boolean> {
		try {
			const stats = await TreeCache.getCacheStats();
			if (stats.totalNodes === 0) {
				return false;
			}

			// 获取所有展开的路径
			const expandedPaths = await TreeCache.getExpandedPaths();
			const expandedSet = new Set(expandedPaths);

			// 恢复根节点
			const commonDrives = ['C:\\', 'D:\\', 'E:\\', 'F:\\', 'G:\\'];
			const cachedRoots = await TreeCache.getCachedNodes(commonDrives);

			roots = await Promise.all(
				commonDrives.map(async (drive) => {
					const cached = cachedRoots.get(drive);
					const node: TreeNode = {
						path: drive,
						name: drive.replace('\\', ''),
						isRoot: true,
						expanded: cached?.expanded ?? false,
						loading: false,
						children: [],
						hasChildren: cached?.hasChildren ?? true
					};

					// 如果节点已展开，递归恢复子节点
					if (node.expanded && cached?.childPaths.length) {
						node.children = await restoreChildren(cached.childPaths, expandedSet);
					}

					return node;
				})
			);
			sortTreeRecursively();

			cacheInitialized = true;
			return true;
		} catch (e) {
			console.error('[FolderTree] 缓存恢复失败:', e);
			return false;
		}
	}

	// 递归恢复子节点（优化：并行恢复）
	async function restoreChildren(childPaths: string[], expandedSet: Set<string>): Promise<TreeNode[]> {
		if (childPaths.length === 0) return [];

		const cachedNodes = await TreeCache.getCachedNodes(childPaths);
		
		// 并行处理所有子节点
		const nodePromises = childPaths.map(async (path) => {
			const cached = cachedNodes.get(path);
			if (!cached) return null;

			const node: TreeNode = {
				path: cached.path,
				name: cached.name,
				isRoot: false,
				expanded: cached.expanded,
				loading: false,
				children: [],
				hasChildren: cached.hasChildren
			};

			// 并行递归恢复展开的子节点
			if (node.expanded && cached.childPaths.length > 0) {
				node.children = await restoreChildren(cached.childPaths, expandedSet);
			}

			return node;
		});

		const results = await Promise.all(nodePromises);
		return results.filter((n): n is TreeNode => n !== null);
	}

	// 加载根目录（Windows 盘符）
	async function loadRoots() {
		loadingRoots = true;

		// 优化：预加载缓存到内存（一次性读取所有节点）
		await TreeCache.preloadCache();

		// 先尝试从缓存恢复
		const restored = await restoreFromCache();
		if (restored) {
			loadingRoots = false;
			// 启动后台 GC
			TreeCache.runGC().catch(() => {});
			return;
		}

		// 缓存为空，初始化根节点
		const commonDrives = ['C:\\', 'D:\\', 'E:\\', 'F:\\', 'G:\\'];
		roots = commonDrives.map((drive) => ({
			path: drive,
			name: drive.replace('\\', ''),
			isRoot: true,
			expanded: false,
			loading: false,
			children: [],
			hasChildren: true
		}));
		sortTreeRecursively();

		// 保存根节点到缓存
		const cacheNodes = commonDrives.map((drive) =>
			TreeCache.createCachedNode(drive, drive.replace('\\', ''), true, [])
		);
		TreeCache.saveNodes(cacheNodes).catch(() => {});

		cacheInitialized = true;
		loadingRoots = false;
	}

	// 加载子目录（带缓存）
	async function loadChildren(node: TreeNode, forceRefresh = false) {
		const requestKey = `${node.path}|${forceRefresh ? 'force' : 'cache'}`;
		const existingTask = loadChildrenInFlight.get(requestKey);
		if (existingTask) {
			await existingTask;
			return;
		}

		const task = (async () => {
		if (node.loading) return;

		// 检查缓存
		if (!forceRefresh) {
			const cached = await TreeCache.getCachedNode(node.path);
			if (cached && cached.childPaths.length > 0) {
				// 从缓存恢复子节点
				const cachedChildren = await TreeCache.getCachedNodes(cached.childPaths);
				node.children = cached.childPaths
					.map((path) => {
						const child = cachedChildren.get(path);
						if (!child) return null;
						return {
							path: child.path,
							name: child.name,
							isRoot: false,
							expanded: child.expanded,
							loading: false,
							children: [],
							hasChildren: child.hasChildren
						} as TreeNode;
					})
					.filter((n): n is TreeNode => n !== null);

				if (node.children.length > 0) {
					roots = [...roots];
					return;
				}
			}
		}

		node.loading = true;
		node.error = undefined;
		roots = [...roots];

		try {
			// 使用轻量级 API（只返回子目录，带 hasChildren 信息）
			const subfolders = await FileSystemAPI.listSubfolders(node.path);

			node.children = subfolders.map((folder) => ({
				path: folder.path,
				name: folder.name,
				isRoot: false,
				expanded: false,
				loading: false,
				children: [],
				hasChildren: folder.hasChildren
			}));
			node.children.sort(compareTreeNode);

			// 保存到缓存
			const childPaths = subfolders.map((f) => f.path);
			const parentCacheNode = TreeCache.createCachedNode(
				node.path,
				node.name,
				node.isRoot,
				childPaths
			);
			parentCacheNode.expanded = node.expanded;
			parentCacheNode.hasChildren = childPaths.length > 0;

			const childCacheNodes = subfolders.map((f) => {
				const cacheNode = TreeCache.createCachedNode(f.path, f.name, false, []);
				cacheNode.hasChildren = f.hasChildren;
				return cacheNode;
			});

			// 异步保存，不阻塞 UI
			Promise.all([
				TreeCache.saveNode(parentCacheNode),
				TreeCache.saveNodes(childCacheNodes)
			]).catch(() => {});
		} catch (err) {
			node.error = err instanceof Error ? err.message : '加载失败';
			node.children = [];
		}

		node.loading = false;
		roots = [...roots];
		})();

		loadChildrenInFlight.set(requestKey, task);
		try {
			await task;
		} finally {
			loadChildrenInFlight.delete(requestKey);
		}
	}

	// 切换展开/折叠
	async function toggleNode(node: TreeNode, e?: MouseEvent) {
		e?.stopPropagation();
		node.expanded = !node.expanded;

		// 更新缓存中的展开状态
		TreeCache.updateNodeExpanded(node.path, node.expanded).catch(() => {});

		if (node.expanded && node.children.length === 0 && !node.error) {
			await loadChildren(node);
		}
		roots = [...roots];
	}

	// 选择节点
	function selectNode(node: TreeNode, e?: MouseEvent) {
		e?.stopPropagation();
		folderTabActions.setPath(node.path);
		onNavigate?.(node.path);
	}

	// 右键菜单
	function handleContextMenu(node: TreeNode, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		const item: FsItem = {
			path: node.path,
			name: node.name,
			isDir: true,
			isImage: false,
			size: 0
		};
		onContextMenu?.(e, item);
	}

	// 检查节点是否在当前路径上
	function isInCurrentPath(nodePath: string): boolean {
		const node = nodePath.replace(/\\/g, '/').toLowerCase();
		return normalizedCurrentPath.startsWith(node);
	}

	// 检查节点是否是当前路径
	function isCurrentPath(nodePath: string): boolean {
		const node = nodePath.replace(/\\/g, '/').toLowerCase();
		return normalizedCurrentPath === node;
	}

	// 后台校验 mtime 变化（增量更新）
	async function validateExpandedNodes() {
		// 收集所有展开的节点
		const expandedNodes: TreeNode[] = [];
		function collectExpanded(nodes: TreeNode[]) {
			for (const node of nodes) {
				if (node.expanded && node.children.length > 0) {
					expandedNodes.push(node);
					collectExpanded(node.children);
				}
			}
		}
		collectExpanded(roots);

		if (expandedNodes.length === 0) return;

		// 批量检查 mtime（使用后端的目录快照 API）
		const paths = expandedNodes.map(n => n.path);
		try {
			const results = await FileSystemAPI.batchLoadDirectorySnapshots(paths);
			const expandedNodeMap = new Map(expandedNodes.map((node) => [node.path, node]));
			
			for (const result of results) {
				if (result.error || !result.snapshot) continue;
				
				// 找到对应的节点
				const node = expandedNodeMap.get(result.path);
				if (!node) continue;

				// 检查是否有变化（通过比较子节点数量和名称）
				const currentChildPaths = new Set(node.children.map(c => c.path));
				const newFolders = result.snapshot.items.filter(item => item.isDir);
				const newChildPaths = new Set(newFolders.map(f => f.path));

				// 检查是否有新增或删除
				let hasChanges = currentChildPaths.size !== newChildPaths.size;
				if (!hasChanges) {
					for (const path of currentChildPaths) {
						if (!newChildPaths.has(path)) {
							hasChanges = true;
							break;
						}
					}
				}

				if (hasChanges) {
					// 更新节点的子节点
					node.children = newFolders.map((folder) => {
						// 保留已展开的子节点状态
						const existing = node.children.find(c => c.path === folder.path);
						return {
							path: folder.path,
							name: folder.name,
							isRoot: false,
							expanded: existing?.expanded ?? false,
							loading: false,
							children: existing?.children ?? [],
							hasChildren: true
						};
					});
					node.children.sort(compareTreeNode);

					// 更新缓存
					const childPaths = newFolders.map(f => f.path);
					const parentCacheNode = TreeCache.createCachedNode(
						node.path,
						node.name,
						node.isRoot,
						childPaths,
						result.snapshot.mtime
					);
					parentCacheNode.expanded = node.expanded;
					parentCacheNode.hasChildren = childPaths.length > 0;
					TreeCache.saveNode(parentCacheNode).catch(() => {});
				}
			}

			roots = [...roots];
		} catch (e) {
			console.error('[FolderTree] 后台校验失败:', e);
		}
	}

	let validationInterval: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		unpinSubscription = folderTreePinStore.subscribe((paths) => {
			pinnedPathSet = new Set(paths);
			sortTreeRecursively();
			roots = [...roots];
		});

		loadRoots();

		// 启动后台校验（每 30 秒检查一次）
		validationInterval = setInterval(() => {
			if (cacheInitialized && roots.length > 0) {
				validateExpandedNodes().catch(() => {});
			}
		}, 30000);

		return () => {
			if (unpinSubscription) {
				unpinSubscription();
				unpinSubscription = null;
			}
			if (validationInterval) {
				clearInterval(validationInterval);
			}
		};
	});

	// 上一次展开的路径，避免重复展开
	let lastExpandedPath = '';

	// 当路径变化时，自动展开到当前路径（使用缓存加速）
	$effect(() => {
		const path = $currentPath;
		if (!path || roots.length === 0 || !cacheInitialized) return;

		// 避免重复展开同一路径
		if (path === lastExpandedPath) return;
		lastExpandedPath = path;

		const normalized = path.replace(/\\/g, '/').toLowerCase();

		// 收集需要展开的路径段
		const pathSegments: string[] = [];
		let currentSegment = '';
		const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
		
		for (let i = 0; i < parts.length; i++) {
			currentSegment += (i === 0 ? '' : '/') + parts[i];
			// Windows 盘符需要加反斜杠
			if (i === 0 && /^[a-zA-Z]:$/.test(parts[0])) {
				currentSegment = parts[0] + '\\';
			}
			pathSegments.push(currentSegment.replace(/\//g, '\\'));
		}

		async function expandToPath(nodes: TreeNode[], targetPath: string, depth = 0): Promise<boolean> {
			let changed = false;
			const targetSegment = pathSegments[depth];

			for (const node of nodes) {
				const nodePath = node.path.replace(/\//g, '\\');
				if (nodePath.toLowerCase() === targetSegment?.toLowerCase()) {
					if (!node.expanded) {
						node.expanded = true;
						changed = true;
						TreeCache.updateNodeExpanded(node.path, true).catch(() => {});
						
						if (node.children.length === 0) {
							await loadChildren(node);
						}
					}
					
					if (depth + 1 < pathSegments.length && node.children.length > 0) {
						const childChanged = await expandToPath(node.children, targetPath, depth + 1);
						changed = changed || childChanged;
					}
					break;
				}
			}
			return changed;
		}

		expandToPath(roots, normalized).then((changed) => {
			if (changed) {
				roots = [...roots];
			}
		});
	});
</script>

<TreeView.Root class="h-full overflow-auto p-2 text-sm">
	{#if loadingRoots}
		<div class="flex items-center justify-center py-4">
			<Loader2 class="text-muted-foreground h-5 w-5 animate-spin" />
		</div>
	{:else}
		{#each roots as node (node.path)}
			{@render treeNode(node, 0)}
		{/each}
	{/if}
</TreeView.Root>

{#snippet treeNode(node: TreeNode, depth: number)}
	<div class="tree-node">
		<!-- 节点行 -->
		<div
			class={cn(
				'hover:bg-accent/50 flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 transition-colors',
				isCurrentPath(node.path) && 'bg-accent',
				isInCurrentPath(node.path) && 'font-medium'
			)}
			onclick={(e) => selectNode(node, e)}
			oncontextmenu={(e) => handleContextMenu(node, e)}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					selectNode(node);
				}
			}}
			role="button"
			tabindex="0"
		>
			<!-- 展开/折叠按钮 -->
			<button
				type="button"
				class="hover:bg-accent flex h-4 w-4 shrink-0 items-center justify-center rounded"
				onclick={(e) => toggleNode(node, e)}
			>
				{#if node.loading}
					<Loader2 class="text-muted-foreground h-3 w-3 animate-spin" />
				{:else if node.expanded}
					<ChevronDown class="text-muted-foreground h-3 w-3" />
				{:else}
					<ChevronRight class="text-muted-foreground h-3 w-3" />
				{/if}
			</button>

			<!-- 图标（彩色） -->
			{#if node.isRoot}
				<HardDrive class="h-4 w-4 shrink-0 {getDepthColor(depth)}" />
			{:else if node.expanded}
				<FolderOpen class="h-4 w-4 shrink-0 {getDepthColor(depth)}" />
			{:else}
				<Folder class="h-4 w-4 shrink-0 {getDepthColor(depth)}" />
			{/if}

			<!-- 名称 -->
			<span class="truncate">{node.name}</span>

			{#if isPinned(node.path)}
				<Pin class="text-primary h-3.5 w-3.5 shrink-0" />
			{/if}
		</div>

		<!-- 子节点容器（带层级线） -->
		{#if node.expanded}
			<!-- 错误提示 -->
			{#if node.error}
				<div class="ml-4 border-l {getLineColor(depth)} pl-4">
					<div class="text-destructive truncate py-1 text-xs">
						{node.error}
					</div>
				</div>
			{/if}

			<!-- 子节点 -->
			{#if node.children.length > 0}
				<div class="ml-4 border-l-2 {getLineColor(depth)} pl-2">
					{#each node.children as child (child.path)}
						{@render treeNode(child, depth + 1)}
					{/each}
				</div>
			{/if}
		{/if}
	</div>
{/snippet}

<style>
	.tree-node {
		position: relative;
	}
</style>
