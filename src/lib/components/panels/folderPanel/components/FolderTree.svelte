<script lang="ts">
	/**
	 * FolderTree - 文件夹树组件
	 * 使用 shadcn tree-view 组件重构，带层级线和彩色图标
	 */
	import { onMount } from 'svelte';
	import {
		ChevronRight,
		ChevronDown,
		Folder,
		FolderOpen,
		HardDrive,
		Loader2
	} from '@lucide/svelte';
	import { FileSystemAPI } from '$lib/api';
	import type { FsItem } from '$lib/types';
	import { tabCurrentPath, folderTabActions } from '../stores/folderTabStore.svelte';
	import * as TreeView from '$lib/components/ui/tree-view';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { cn } from '$lib/utils';

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
	}

	// 树状态
	let roots = $state<TreeNode[]>([]);
	let loadingRoots = $state(true);

	// 根据深度生成颜色（使用主题色，深度越深颜色越深）
	function getDepthColor(depth: number): string {
		// 使用主题色，通过不同的透明度/亮度表示层级
		const opacities = [
			'text-primary/60', // 根目录 - 较浅
			'text-primary/70', // 深度1
			'text-primary/80', // 深度2
			'text-primary/90', // 深度3
			'text-primary' // 深度4+ - 最深
		];
		return opacities[Math.min(depth, opacities.length - 1)];
	}

	// 获取层级线颜色（使用主题色边框）
	function getLineColor(depth: number): string {
		const opacities = [
			'border-primary/20', // 浅
			'border-primary/30',
			'border-primary/40',
			'border-primary/50',
			'border-primary/60' // 深
		];
		return opacities[Math.min(depth, opacities.length - 1)];
	}

	// 加载根目录（Windows 盘符）
	async function loadRoots() {
		loadingRoots = true;
		try {
			// 使用常见盘符作为根目录（需要加反斜杠确保是绝对路径）
			const commonDrives = ['C:\\', 'D:\\', 'E:\\', 'F:\\', 'G:\\'];
			roots = commonDrives.map((drive) => ({
				path: drive,
				name: drive.replace('\\', ''),
				isRoot: true,
				expanded: false,
				loading: false,
				children: []
			}));
		} catch (err) {
			console.error('[FolderTree] Failed to load drives:', err);
			roots = ['C:\\', 'D:\\', 'E:\\'].map((drive) => ({
				path: drive,
				name: drive.replace('\\', ''),
				isRoot: true,
				expanded: false,
				loading: false,
				children: []
			}));
		}
		loadingRoots = false;
	}

	// 加载子目录
	async function loadChildren(node: TreeNode) {
		if (node.loading) return;

		node.loading = true;
		node.error = undefined;

		try {
			const items = await FileSystemAPI.browseDirectory(node.path);
			const folders = items.filter((item) => item.isDir);

			node.children = folders.map((folder) => ({
				path: folder.path,
				name: folder.name,
				isRoot: false,
				expanded: false,
				loading: false,
				children: []
			}));
		} catch (err) {
			console.error('[FolderTree] Failed to load children:', err);
			node.error = err instanceof Error ? err.message : '加载失败';
			node.children = [];
		}

		node.loading = false;
		// 触发响应式更新
		roots = [...roots];
	}

	// 切换展开/折叠
	async function toggleNode(node: TreeNode, e?: MouseEvent) {
		e?.stopPropagation();
		node.expanded = !node.expanded;

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
		// 转换为 FsItem 格式
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
		const current = $currentPath.replace(/\\/g, '/').toLowerCase();
		const node = nodePath.replace(/\\/g, '/').toLowerCase();
		return current.startsWith(node);
	}

	// 检查节点是否是当前路径
	function isCurrentPath(nodePath: string): boolean {
		const current = $currentPath.replace(/\\/g, '/').toLowerCase();
		const node = nodePath.replace(/\\/g, '/').toLowerCase();
		return current === node;
	}

	onMount(() => {
		loadRoots();
	});

	// 上一次展开的路径，避免重复展开
	let lastExpandedPath = '';

	// 当路径变化时，自动展开到当前路径
	$effect(() => {
		const path = $currentPath;
		if (!path || roots.length === 0) return;

		// 避免重复展开同一路径
		if (path === lastExpandedPath) return;
		lastExpandedPath = path;

		// 找到并展开路径上的所有节点
		const normalized = path.replace(/\\/g, '/').toLowerCase();

		async function expandToPath(nodes: TreeNode[], targetPath: string): Promise<boolean> {
			let changed = false;
			for (const node of nodes) {
				const nodePath = node.path.replace(/\\/g, '/').toLowerCase();
				if (targetPath.startsWith(nodePath)) {
					if (!node.expanded) {
						node.expanded = true;
						changed = true;
						if (node.children.length === 0) {
							await loadChildren(node);
						}
					}
					if (node.children.length > 0) {
						const childChanged: boolean = await expandToPath(node.children, targetPath);
						changed = changed || childChanged;
					}
				}
			}
			return changed;
		}

		expandToPath(roots, normalized).then((changed: boolean) => {
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
			onkeydown={(e) => e.key === 'Enter' && selectNode(node)}
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
