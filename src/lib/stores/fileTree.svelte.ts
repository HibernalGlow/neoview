import { writable } from 'svelte/store';
import type { FsItem } from '$lib/types';

export interface FileTreeNode {
	path: string;
	name: string;
	parent: string | null;
	depth: number;
	isDir: boolean;
	isExpanded: boolean;
	isLoading: boolean;
	children: string[];
	hasChildren: boolean;
	initialized: boolean;
}

interface FileTreeState {
	rootPaths: string[];
	nodes: Record<string, FileTreeNode>;
	selectedPath: string | null;
}

const initialState: FileTreeState = {
	rootPaths: [],
	nodes: {},
	selectedPath: null
};

function createPlaceholderNode(path: string, parent: string | null): FileTreeNode {
	return {
		path,
		name: deriveNameFromPath(path),
		parent,
		depth: parent ? 1 : 0,
		isDir: true,
		isExpanded: false,
		isLoading: false,
		children: [],
		hasChildren: true,
		initialized: false
	};
}

function deriveNameFromPath(path: string) {
	if (!path) return '';
	if (path === '/') return '/';
	const sanitized = path.replace(/\\/g, '/').replace(/\/$/, '');
	const parts = sanitized.split('/').filter(Boolean);
	return parts.at(-1) ?? path;
}

function createFileTreeStore() {
	const { subscribe, update, set } = writable<FileTreeState>(initialState);
	let currentState = initialState;

	subscribe((state) => {
		currentState = state;
	});

	function ensureRoot(path: string, name?: string) {
		update((state) => {
			const nodes = { ...state.nodes };
			if (!nodes[path]) {
				nodes[path] = {
					...createPlaceholderNode(path, null),
					depth: 0,
					name: name ?? deriveNameFromPath(path)
				};
			}

			const rootPaths = state.rootPaths.includes(path)
				? state.rootPaths
				: [...state.rootPaths, path];

			return { ...state, nodes, rootPaths };
		});
	}

	function ensureNode(args: {
		path: string;
		name: string;
		parent: string | null;
		depth: number;
		isDir?: boolean;
		hasChildren?: boolean;
	}) {
		update((state) => {
			const nodes = { ...state.nodes };
			const existing = nodes[args.path];

			if (existing) {
				nodes[args.path] = {
					...existing,
					name: args.name ?? existing.name,
					parent: args.parent,
					depth: args.depth,
					isDir: args.isDir ?? existing.isDir,
					hasChildren: args.hasChildren ?? existing.hasChildren
				};
				return { ...state, nodes };
			}

			nodes[args.path] = {
				path: args.path,
				name: args.name ?? deriveNameFromPath(args.path),
				parent: args.parent,
				depth: args.depth,
				isDir: args.isDir ?? true,
				isExpanded: false,
				isLoading: false,
				children: [],
				hasChildren: args.hasChildren ?? true,
				initialized: false
			};

			return { ...state, nodes };
		});
	}

	function setNodeLoading(path: string, isLoading: boolean) {
		update((state) => {
			const node = state.nodes[path];
			if (!node) return state;
			return {
				...state,
				nodes: {
					...state.nodes,
					[path]: { ...node, isLoading }
				}
			};
		});
	}

	function setChildren(parentPath: string, children: FsItem[]) {
		update((state) => {
			const nodes = { ...state.nodes };
			const parentNode = nodes[parentPath] ?? createPlaceholderNode(parentPath, null);
			const sortedChildren = [...children].sort((a, b) => a.name.localeCompare(b.name));
			const childPaths: string[] = [];

			for (const child of sortedChildren) {
				const depth = (parentNode?.depth ?? -1) + 1;
				nodes[child.path] = {
					path: child.path,
					name: child.name,
					parent: parentPath,
					depth,
					isDir: Boolean(child.isDir),
					isExpanded: nodes[child.path]?.isExpanded ?? false,
					isLoading: false,
					children: nodes[child.path]?.children ?? [],
					hasChildren: Boolean(child.isDir),
					initialized: nodes[child.path]?.initialized ?? false
				};
				childPaths.push(child.path);
			}

			nodes[parentPath] = {
				...parentNode,
				children: childPaths,
				hasChildren: childPaths.length > 0,
				initialized: true,
				isDir: true
			};

			return { ...state, nodes };
		});
	}

	function setExpanded(path: string, isExpanded: boolean) {
		update((state) => {
			const node = state.nodes[path];
			if (!node) return state;
			return {
				...state,
				nodes: {
					...state.nodes,
					[path]: { ...node, isExpanded }
				}
			};
		});
	}

	function updateNode(path: string, partial: Partial<FileTreeNode>) {
		update((state) => {
			const node = state.nodes[path];
			if (!node) return state;
			return {
				...state,
				nodes: {
					...state.nodes,
					[path]: { ...node, ...partial }
				}
			};
		});
	}

	function expandNode(path: string) {
		setExpanded(path, true);
	}

	function collapseNode(path: string) {
		setExpanded(path, false);
	}

	function setSelectedPath(path: string | null) {
		update((state) => ({ ...state, selectedPath: path ?? null }));
	}

	// 选择路径（导航）
	function selectPath(path: string) {
		update((state) => ({ ...state, selectedPath: path }));
	}

	return {
		subscribe,
		getState: () => currentState,
		ensureRoot,
		ensureNode,
		setChildren,
		setNodeLoading,
		setExpanded,
		updateNode,
		expandNode,
		collapseNode,
		setSelectedPath,
		selectPath,
		reset: () => set(initialState)
	};
}

export const fileTreeStore = createFileTreeStore();
