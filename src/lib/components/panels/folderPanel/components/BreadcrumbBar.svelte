<script lang="ts">
/**
 * BreadcrumbBar - 面包屑导航栏
 * 参考 NeeView 的 BreadcrumbBar 设计
 * 支持点击导航和直接输入路径
 */
import { ChevronRight, Folder, HardDrive, MoreHorizontal, Edit2 } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
import { tabCurrentPath, folderTabActions } from '../stores/folderTabStore.svelte';

// 使用页签 store 的 currentPath
const currentPath = tabCurrentPath;

interface Props {
	onNavigate?: (path: string) => void;
}

let { onNavigate }: Props = $props();

// 编辑模式状态
let isEditing = $state(false);
let editValue = $state('');
let inputRef: HTMLInputElement | null = $state(null);

function startEditing() {
	editValue = $currentPath;
	isEditing = true;
	// 下一帧聚焦输入框
	requestAnimationFrame(() => {
		inputRef?.focus();
		inputRef?.select();
	});
}

function cancelEditing() {
	isEditing = false;
	editValue = '';
}

function confirmEditing() {
	if (editValue.trim()) {
		// 规范化路径
		let normalizedPath = editValue.trim().replace(/\\/g, '/');
		// 确保 Windows 盘符格式正确
		if (/^[a-zA-Z]:/.test(normalizedPath) && !normalizedPath.endsWith('/')) {
			// 如果只是盘符，添加斜杠
			if (normalizedPath.length === 2) {
				normalizedPath += '/';
			}
		}
		folderTabActions.setPath(normalizedPath);
		onNavigate?.(normalizedPath);
	}
	isEditing = false;
}

function handleInputKeyDown(e: KeyboardEvent) {
	if (e.key === 'Enter') {
		e.preventDefault();
		confirmEditing();
	} else if (e.key === 'Escape') {
		e.preventDefault();
		cancelEditing();
	}
}

function handleInputBlur() {
	// 延迟取消，允许点击确认按钮
	setTimeout(() => {
		if (isEditing) {
			cancelEditing();
		}
	}, 150);
}

interface BreadcrumbItem {
	name: string;
	path: string;
	isRoot: boolean;
}

// 解析路径为面包屑项
function parsePath(path: string): BreadcrumbItem[] {
	if (!path) return [];

	const normalized = path.replace(/\\/g, '/');
	const parts = normalized.split('/').filter(Boolean);

	const items: BreadcrumbItem[] = [];

	// Windows 盘符处理
	if (path.includes(':')) {
		const drive = parts[0];
		items.push({
			name: drive,
			path: drive,
			isRoot: true
		});

		let currentPath = drive;
		for (let i = 1; i < parts.length; i++) {
			currentPath += '/' + parts[i];
			items.push({
				name: parts[i],
				path: currentPath,
				isRoot: false
			});
		}
	} else {
		// Unix 路径
		let currentPath = '';
		for (const part of parts) {
			currentPath += '/' + part;
			items.push({
				name: part,
				path: currentPath,
				isRoot: items.length === 0
			});
		}
	}

	return items;
}

// 计算可见的面包屑项（响应式宽度）
let containerRef: HTMLDivElement | null = $state(null);
let maxVisibleItems = $state(5);

$effect(() => {
	if (!containerRef) return;

	const observer = new ResizeObserver((entries) => {
		const width = entries[0]?.contentRect.width ?? 300;
		// 根据宽度动态计算可显示的项数
		maxVisibleItems = Math.max(2, Math.floor(width / 80));
	});

	observer.observe(containerRef);

	return () => observer.disconnect();
});

let breadcrumbItems = $derived(parsePath($currentPath));

let visibleItems = $derived(() => {
	if (breadcrumbItems.length <= maxVisibleItems) {
		return { collapsed: [], visible: breadcrumbItems };
	}

	// 始终显示第一个（根）和最后几个
	const collapsed = breadcrumbItems.slice(1, breadcrumbItems.length - maxVisibleItems + 1);
	const visible = [
		breadcrumbItems[0],
		...breadcrumbItems.slice(breadcrumbItems.length - maxVisibleItems + 1)
	];

	return { collapsed, visible };
});

function handleNavigate(path: string) {
	folderTabActions.setPath(path);
	onNavigate?.(path);
}
</script>

<div
	bind:this={containerRef}
	class="flex min-h-[28px] items-center gap-0.5 overflow-hidden px-2 py-1"
>
	{#if isEditing}
		<!-- 编辑模式 -->
		<div class="flex flex-1 items-center gap-1">
			<input
				bind:this={inputRef}
				type="text"
				bind:value={editValue}
				onkeydown={handleInputKeyDown}
				onblur={handleInputBlur}
				class="bg-background border-input h-6 flex-1 rounded border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
				placeholder="输入路径..."
			/>
		</div>
	{:else}
		<!-- 面包屑模式 -->
		<!-- 根图标 -->
		{#if breadcrumbItems.length > 0}
			<Button
				variant="ghost"
				size="sm"
				class="h-6 gap-1 px-1.5"
				onclick={() => handleNavigate(breadcrumbItems[0].path)}
			>
				{#if breadcrumbItems[0].isRoot}
					<HardDrive class="h-3.5 w-3.5" />
				{:else}
					<Folder class="h-3.5 w-3.5" />
				{/if}
				<span class="max-w-[80px] truncate text-xs">{breadcrumbItems[0].name}</span>
			</Button>
		{/if}

		<!-- 折叠的项 -->
		{#if visibleItems().collapsed.length > 0}
			<ChevronRight class="text-muted-foreground h-3.5 w-3.5 shrink-0" />

			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					<Button variant="ghost" size="sm" class="h-6 w-6 p-0">
						<MoreHorizontal class="h-3.5 w-3.5" />
					</Button>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start">
					{#each visibleItems().collapsed as item}
						<DropdownMenu.Item onclick={() => handleNavigate(item.path)}>
							<Folder class="mr-2 h-4 w-4" />
							{item.name}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}

		<!-- 可见的项（跳过第一个，因为已经显示了） -->
		{#each visibleItems().visible.slice(1) as item}
			<ChevronRight class="text-muted-foreground h-3.5 w-3.5 shrink-0" />

			<Button
				variant="ghost"
				size="sm"
				class="h-6 min-w-0 max-w-[120px] px-1.5"
				onclick={() => handleNavigate(item.path)}
			>
				<span class="truncate text-xs">{item.name}</span>
			</Button>
		{/each}

		<!-- 编辑按钮 -->
		<div class="flex-1"></div>
		<Button
			variant="ghost"
			size="icon"
			class="h-6 w-6 shrink-0"
			onclick={startEditing}
		>
			<Edit2 class="h-3 w-3" />
		</Button>
	{/if}
</div>
