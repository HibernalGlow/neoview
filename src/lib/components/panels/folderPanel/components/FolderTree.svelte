<script lang="ts">
/**
 * FolderTree - 文件夹树组件
 * 参考 NeeView 的 FolderTreeView 设计
 */
import { onMount } from 'svelte';
import { ChevronRight, ChevronDown, Folder, HardDrive, Loader2 } from '@lucide/svelte';
import { FileSystemAPI } from '$lib/api';
import type { FsItem } from '$lib/types';
import { currentPath, folderPanelActions } from '../stores/folderPanelStore.svelte';

interface Props {
	onNavigate?: (path: string) => void;
}

let { onNavigate }: Props = $props();

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

// 加载根目录（Windows 盘符）
async function loadRoots() {
	loadingRoots = true;
	try {
		// 使用常见盘符作为根目录
		const commonDrives = ['C:', 'D:', 'E:', 'F:', 'G:'];
		roots = commonDrives.map((drive) => ({
			path: drive,
			name: drive,
			isRoot: true,
			expanded: false,
			loading: false,
			children: []
		}));
	} catch (err) {
		console.error('[FolderTree] Failed to load drives:', err);
		roots = ['C:', 'D:', 'E:'].map((drive) => ({
			path: drive,
			name: drive,
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
async function toggleNode(node: TreeNode) {
	if (node.expanded) {
		node.expanded = false;
	} else {
		node.expanded = true;
		if (node.children.length === 0 && !node.error) {
			await loadChildren(node);
		}
	}
	roots = [...roots];
}

// 选择节点
function selectNode(node: TreeNode) {
	folderPanelActions.setPath(node.path);
	onNavigate?.(node.path);
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

// 扁平化树节点用于渲染
interface FlatNode {
	node: TreeNode;
	depth: number;
}

function flattenTree(nodes: TreeNode[], depth: number = 0): FlatNode[] {
	const result: FlatNode[] = [];
	for (const node of nodes) {
		result.push({ node, depth });
		if (node.expanded && node.children.length > 0) {
			result.push(...flattenTree(node.children, depth + 1));
		}
	}
	return result;
}

let flattenedNodes = $derived(flattenTree(roots));

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

<div class="h-full overflow-auto p-2">
	{#if loadingRoots}
		<div class="flex items-center justify-center py-4">
			<Loader2 class="text-muted-foreground h-5 w-5 animate-spin" />
		</div>
	{:else}
		<div class="space-y-0.5">
			{#each flattenedNodes as { node, depth } (node.path)}
				<div
					class="hover:bg-accent/50 flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-sm transition-colors"
					class:bg-accent={isCurrentPath(node.path)}
					class:font-medium={isInCurrentPath(node.path)}
					style="padding-left: {depth * 12 + 4}px;"
					onclick={() => selectNode(node)}
					onkeydown={(e) => e.key === 'Enter' && selectNode(node)}
					role="button"
					tabindex="0"
				>
					<!-- 展开/折叠按钮 -->
					<button
						type="button"
						class="hover:bg-accent flex h-4 w-4 shrink-0 items-center justify-center rounded"
						onclick={(e) => { e.stopPropagation(); toggleNode(node); }}
					>
						{#if node.loading}
							<Loader2 class="h-3 w-3 animate-spin" />
						{:else if node.expanded}
							<ChevronDown class="h-3 w-3" />
						{:else}
							<ChevronRight class="h-3 w-3" />
						{/if}
					</button>
					
					<!-- 图标 -->
					{#if node.isRoot}
						<HardDrive class="text-muted-foreground h-4 w-4 shrink-0" />
					{:else}
						<Folder class="text-muted-foreground h-4 w-4 shrink-0" />
					{/if}
					
					<!-- 名称 -->
					<span class="truncate">{node.name}</span>
				</div>
				
				<!-- 错误提示 -->
				{#if node.expanded && node.error}
					<div
						class="text-destructive truncate px-2 py-1 text-xs"
						style="padding-left: {(depth + 1) * 12 + 4}px;"
					>
						{node.error}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>
