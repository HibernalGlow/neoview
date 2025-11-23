	<script lang="ts">
		import { createEventDispatcher } from 'svelte';
		import type { FsItem } from '$lib/types';
		import { Folder, File, Image as ImageIcon, FileArchive, ChevronDown, ChevronRight } from '@lucide/svelte';

		interface TreeNode {
			name: string;
			path: string;
			isDir: boolean;
			item?: FsItem;
			children: Map<string, TreeNode>;
			fileCount: number; // 此节点下的文件总数
			expanded: boolean;
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

		// 构建树状结构
		function buildTree(items: FsItem[]): TreeNode {
			const root: TreeNode = {
				name: '',
				path: '',
				isDir: true,
				children: new Map(),
				fileCount: 0,
				expanded: true
			};

			items.forEach((item) => {
				const parts = item.path.split(/[\\/]/).filter((p) => p);
				let currentNode = root;

			// 遍历路径的每一部分
			parts.forEach((part, index) => {
				const isLast = index === parts.length - 1;
				const partPath = parts.slice(0, index + 1).join('/');

				if (!currentNode.children.has(part)) {
					currentNode.children.set(part, {
						name: part,
						path: partPath,
						isDir: !isLast || item.isDir,
						item: isLast ? item : undefined,
						children: new Map(),
						fileCount: 0,
						expanded: false
					});
				}

				const node = currentNode.children.get(part)!;

				// 如果是最后一个部分且是文件，增加文件计数
				if (isLast && !item.isDir) {
					// 向上传播文件计数
					let parent: TreeNode | undefined = currentNode;
					while (parent) {
						parent.fileCount++;
						// 这里需要一个父节点引用，暂时简化处理
						break;
					}
				}

				currentNode = node;
			});
		});

		// 计算每个节点的文件数
		function calculateFileCount(node: TreeNode): number {
			if (!node.isDir && node.item) {
				return 1;
			}

			let count = 0;
			node.children.forEach((child) => {
				count += calculateFileCount(child);
			});
			node.fileCount = count;
			return count;
		}

		calculateFileCount(root);
		return root;
	}

	let treeRoot = $derived(buildTree(items));
	let expandedNodes = $state(new Set<string>());

	function normalizePath(path: string): string {
		return path.replace(/\\/g, '/').replace(/\/+$/, '');
	}

	let normalizedCurrentPath = $derived(currentPath ? normalizePath(currentPath) : '');
	let lastScrolledPath = $state('');

	function ensureCurrentPathExpanded() {
		if (!normalizedCurrentPath) return;
		const parts = normalizedCurrentPath.split('/');
		// 不清空已有展开状态，只追加当前路径链路，避免其他展开节点被折叠
		const next = new Set<string>(expandedNodes);
		let changed = false;
		let segment = '';
		for (let i = 0; i < parts.length; i++) {
			const p = parts[i];
			if (!p) continue;
			segment = i === 0 ? p : `${segment}/${p}`;
			if (!next.has(segment)) {
				next.add(segment);
				changed = true;
			}
		}
		if (changed) {
			expandedNodes = next;
		}
	}

	// 切换节点展开状态
	function toggleNode(path: string) {
		if (expandedNodes.has(path)) {
			expandedNodes.delete(path);
		} else {
			expandedNodes.add(path);
		}
		expandedNodes = new Set(expandedNodes); // 触发响应式更新
	}

	// 渲染树节点
	function renderNode(node: TreeNode, level: number = 0): any[] {
		const result: any[] = [];

		node.children.forEach((child) => {
			const isExpanded = expandedNodes.has(child.path);

			result.push({
				node: child,
				level,
				isExpanded
			});

			// 如果展开且有子节点，递归渲染
			if (isExpanded && child.children.size > 0) {
				result.push(...renderNode(child, level + 1));
			}
		});

		return result;
	}

	let flattenedTree = $derived(renderNode(treeRoot));

	$effect(() => {
		if (!normalizedCurrentPath) return;
		if (normalizedCurrentPath === lastScrolledPath) return;
		ensureCurrentPathExpanded();
		queueMicrotask(() => {
			if (!normalizedCurrentPath) return;
			const el = document.querySelector<HTMLDivElement>(
				`.file-tree-view [data-path="${normalizedCurrentPath}"]`
			);
			if (el) {
				el.scrollIntoView({ block: 'nearest' });
			}
			lastScrolledPath = normalizedCurrentPath;
		});
	});

	// 处理项目点击
	function handleItemClick(item: FsItem, index: number) {
		dispatch('itemClick', { item, index });
	}

	// 处理项目右键
	function handleItemContextMenu(event: MouseEvent, item: FsItem) {
		console.log('[FileTreeView] handleItemContextMenu', {
			clientX: event.clientX,
			clientY: event.clientY,
			targetTag: (event.target as HTMLElement | null)?.tagName,
			path: item.path
		});
		dispatch('itemContextMenu', { event, item });
	}

	// 处理项目双击
	function handleItemDoubleClick(item: FsItem, index: number) {
		dispatch('itemDoubleClick', { item, index });
	}

	// 切换项目选中状态
	function toggleItemSelection(path: string) {
		const next = new Set(selectedItems);
		if (next.has(path)) {
			next.delete(path);
		} else {
			next.add(path);
		}
		dispatch('selectionChange', { selectedItems: next });
	}

	// 获取文件图标
	function getFileIcon(item: FsItem) {
		if (item.isDir) return Folder;
		if (item.isImage) return ImageIcon;
		if (item.name.match(/\.(zip|cbz|rar|cbr|7z)$/i)) return FileArchive;
		return File;
	}
	</script>

<div class="file-tree-view flex-1 overflow-y-auto p-2">
	<div class="mb-2 px-2 text-xs text-muted-foreground">
		找到 {items.length} 个结果
	</div>

	{#each flattenedTree as { node, level, isExpanded }, index}
		{@const item = node.item}
		{@const hasChildren = node.children.size > 0}
		{@const Icon = item ? getFileIcon(item) : Folder}
		{@const nodePath = normalizePath(item?.path ?? node.path)}
		{@const isActive = normalizedCurrentPath && nodePath === normalizedCurrentPath}

		<div
			class="tree-node flex cursor-pointer items-center gap-1 rounded px-2 py-1 {isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/70'}"
			style="padding-left: {level * 16 + 8}px"
			data-path={nodePath}
			role="button"
			tabindex="0"
			onclick={() => {
				if (item) {
					handleItemClick(item, index);
				} else if (hasChildren) {
					toggleNode(node.path);
				}
			}}
			onkeydown={(event: KeyboardEvent) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					if (item) {
						handleItemClick(item, index);
					} else if (hasChildren) {
						toggleNode(node.path);
					}
				}
			}}
			ondblclick={() => {
				if (item) {
					handleItemDoubleClick(item, index);
				}
			}}
			oncontextmenu={(e) => {
				if (item) {
					e.preventDefault();
					handleItemContextMenu(e, item);
				}
			}}
		>
			<!-- 展开/折叠图标：所有目录节点始终显示箭头 -->
			{#if node.isDir}
				<button
					class="shrink-0 rounded p-0.5 hover:bg-gray-200"
					onclick={(e) => {
						e.stopPropagation();
						dispatch('toggleNode', {
							path: node.path,
							fsPath: item?.path ?? node.path,
							isDir: node.isDir,
							hasChildren
						});
						toggleNode(node.path);
					}}
				>
					{#if isExpanded}
						<ChevronDown class="h-3.5 w-3.5 text-gray-600" />
					{:else}
						<ChevronRight class="h-3.5 w-3.5 text-gray-600" />
					{/if}
				</button>
			{:else}
				<div class="w-4"></div>
			{/if}

			<!-- 勾选框（勾选模式） -->
			{#if isCheckMode && item}
				<button
					class="shrink-0"
					onclick={(e) => {
						e.stopPropagation();
						toggleItemSelection(item.path);
					}}
				>
					<div
						class="flex h-4 w-4 items-center justify-center rounded border-2 transition-colors {selectedItems.has(
							item.path
						)
							? 'border-blue-500 bg-blue-500'
							: 'border-gray-300 hover:border-blue-400'}"
					>
						{#if selectedItems.has(item.path)}
							<svg class="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="3"
									d="M5 13l4 4L19 7"
								></path>
							</svg>
						{/if}
					</div>
				</button>
			{/if}

			<!-- 文件/文件夹图标 -->
			<Icon
				class="h-4 w-4 shrink-0 {node.isDir
					? 'text-blue-500'
					: item?.isImage
						? 'text-green-500'
						: 'text-gray-500'}"
			/>

			<!-- 名称 -->
			<span
				class="flex-1 truncate text-sm {item && !item.isDir
					? 'text-foreground'
					: 'font-medium text-foreground'} {isActive ? 'font-semibold' : ''}"
			>
				{node.name}
			</span>

			<!-- 文件数量标记 -->
			{#if hasChildren && node.fileCount > 0}
				<span class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
					{node.fileCount}
				</span>
			{/if}

			<!-- 来源标记（如果有） -->
			{#if item?.source}
				{#if item.source === 'bookmark'}
					<span
						class="shrink-0 rounded border border-yellow-200 bg-yellow-100 px-1 py-0.5 text-[9px] text-yellow-700"
					>
						书签
					</span>
				{:else if item.source === 'history'}
					<span
						class="shrink-0 rounded border border-blue-200 bg-blue-100 px-1 py-0.5 text-[9px] text-blue-700"
					>
						历史
					</span>
				{:else if item.source === 'local'}
					<span
						class="shrink-0 rounded border border-gray-200 bg-gray-100 px-1 py-0.5 text-[9px] text-gray-600"
					>
						本地
					</span>
				{/if}
			{/if}
		</div>
	{/each}
</div>

<style>
	.file-tree-view {
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
	}

	.tree-node {
		transition: background-color 0.15s ease;
	}

	.tree-node:focus {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}
</style>
