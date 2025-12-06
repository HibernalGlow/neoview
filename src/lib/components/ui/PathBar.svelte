<script lang="ts">
	/**
	 * 路径面包屑导航栏 - 使用 shadcn-svelte Breadcrumb 重构
	 */
	import { FolderOpen } from '@lucide/svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { onMount } from 'svelte';
	import {
		ContextMenu,
		ContextMenuContent,
		ContextMenuTrigger,
		ContextMenuItem
	} from '$lib/components/ui/context-menu';

	interface BreadcrumbItem {
		name: string;
		path: string;
	}

	interface Props {
		currentPath: string;
		isArchive?: boolean;
		onNavigate?: (path: string) => void;
		onSetHomepage?: (path: string) => void;
	}

	let {
		currentPath = $bindable(''),
		isArchive = false,
		onNavigate,
		onSetHomepage
	}: Props = $props();

	/**
	 * 获取路径的面包屑导航 - 保持原有顺序（从根到当前）
	 */
	function getBreadcrumbs(path: string): BreadcrumbItem[] {
		if (!path) return [];

		// 检测路径分隔符
		const hasBackslash = path.includes('\\');
		const separator = hasBackslash ? '\\' : '/';

		const parts = path.split(/[\\/]/).filter(Boolean);
		const breadcrumbs: BreadcrumbItem[] = [];

		if (parts.length === 0) return breadcrumbs;

		// Windows 驱动器 (如 C:)
		if (parts[0].includes(':')) {
			const drivePath = parts[0] + separator;
			breadcrumbs.push({ name: parts[0], path: drivePath });

			// 添加子目录
			let currentPath = drivePath;
			for (let i = 1; i < parts.length; i++) {
				currentPath = currentPath + parts[i];
				breadcrumbs.push({ name: parts[i], path: currentPath });
				if (i < parts.length - 1) {
					currentPath += separator;
				}
			}
		} else {
			// Unix 路径
			breadcrumbs.push({ name: '/', path: '/' });
			let currentPath = '/';

			for (let i = 0; i < parts.length; i++) {
				if (i > 0) currentPath += '/';
				currentPath += parts[i];
				breadcrumbs.push({ name: parts[i], path: currentPath });
			}
		}
		return breadcrumbs;
	}

	let breadcrumbs = $state<BreadcrumbItem[]>([]);
	let isOverflow = $state(false);
	let containerEl = $state<HTMLDivElement | null>(null);

	let renderedBreadcrumbs = $state<BreadcrumbItem[]>([]);

	$effect(() => {
		breadcrumbs = getBreadcrumbs(currentPath);
	});

	$effect(() => {
		renderedBreadcrumbs = !isOverflow ? breadcrumbs : [...breadcrumbs].reverse();
	});

	function handleNavigate(path: string) {
		onNavigate?.(path);
	}

	function handleSetHomepage(path: string) {
		onSetHomepage?.(path);
	}

	// 编辑模式状态
	let isEditing = $state(false);
	let editValue = $state('');
	let inputElement = $state<HTMLInputElement | null>(null);

	function updateOverflow() {
		if (!containerEl) {
			isOverflow = false;
			return;
		}

		const el = containerEl;
		const next = el.scrollWidth - 1 > el.clientWidth;
		isOverflow = next;
	}

	onMount(() => {
		updateOverflow();

		let resizeObserver: ResizeObserver | null = null;
		if (typeof ResizeObserver !== 'undefined' && containerEl) {
			resizeObserver = new ResizeObserver(() => updateOverflow());
			resizeObserver.observe(containerEl);
		}

		const handleWindowResize = () => updateOverflow();
		window.addEventListener('resize', handleWindowResize);

		return () => {
			if (resizeObserver) {
				resizeObserver.disconnect();
			}
			window.removeEventListener('resize', handleWindowResize);
		};
	});

	$effect(() => {
		// breadcrumbs 变化后，等待一帧再重新计算溢出状态
		setTimeout(updateOverflow, 0);
	});

	function startEdit() {
		editValue = currentPath;
		isEditing = true;
		// 等待 DOM 更新后聚焦
		setTimeout(() => {
			inputElement?.focus();
			inputElement?.select();
		}, 0);
	}

	function cancelEdit() {
		isEditing = false;
	}

	async function submitEdit() {
		const path = editValue.trim();
		if (path && path !== currentPath) {
			// 尝试判断是文件还是文件夹
			// 这里简单处理：如果是文件浏览器支持的扩展名，尝试作为文件打开
			// 否则作为文件夹导航
			// 实际上应该由父组件或 API 来判断，但这里我们通过 onNavigate 传递
			// 父组件 FolderPanel 会处理导航

			// 如果是文件路径，我们希望 FolderPanel 能处理
			// FolderPanel 会通过 navigationCommand 来处理导航
			// 如果是文件，会尝试打开文件或只加载父目录
			// 我们需要更智能的跳转

			// 检查是否是文件扩展名
			const isFile =
				/\.(zip|cbz|rar|cbr|7z|pdf|mp4|mkv|avi|mov|nov|flv|webm|wmv|m4v|mpg|mpeg|jpg|jpeg|png|gif|webp|avif|jxl|bmp|tiff)$/i.test(
					path
				);

			if (isFile) {
				// 如果是文件，尝试打开它
				// 这里我们需要一种方式告诉父组件这是一个文件打开请求
				// 现有的 onNavigate 只是简单的回调
				// 我们可以尝试直接调用 store 或者 API，但最好通过 props 回调
				// 既然 onNavigate 最终调用 fileBrowserStore.navigateToPath
				// 我们可以在那里处理

				// 特殊处理：如果是文件，我们可能需要先打开书，然后同步文件树
				// 但 PathBar 是通用的，不应该耦合太多业务逻辑
				// 简单的做法：直接导航，让 FileBrowser 处理
				// 如果 FileBrowser 发现是文件，它应该能处理（或者我们需要修改 FileBrowser）

				// 实际上，FileBrowser.navigateToPath 主要用于文件夹
				// 如果输入的是文件路径，我们可能希望：
				// 1. 打开该文件（作为书籍）
				// 2. 跳转到该文件所在的文件夹

				// 由于 PathBar 不知道具体的 store，我们通过 onNavigate 传递
				// 约定：父组件需要处理文件路径
				onNavigate?.(path);
			} else {
				onNavigate?.(path);
			}
		}
		isEditing = false;
	}
</script>

<div
	bind:this={containerEl}
	class="flex h-8 items-center justify-end gap-1 overflow-x-auto whitespace-nowrap px-2 py-1"
>
	{#if isEditing}
		<form
			class="flex h-full flex-1 items-center"
			onsubmit={(e) => {
				e.preventDefault();
				submitEdit();
			}}
		>
			<input
				bind:this={inputElement}
				bind:value={editValue}
				class="border-primary bg-background h-full w-full rounded border px-2 text-sm focus:outline-none"
				onblur={cancelEdit}
				onkeydown={(e) => {
					if (e.key === 'Escape') cancelEdit();
				}}
			/>
		</form>
	{:else}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="hover:bg-accent/10 flex h-full flex-1 cursor-text items-center rounded px-1 transition-colors"
			onclick={startEdit}
		>
			{#if currentPath}
				<Breadcrumb.Root>
					<Breadcrumb.List class="flex flex-nowrap items-center gap-1 whitespace-nowrap">
						<!-- 面包屑路径 -->
						{#each renderedBreadcrumbs as breadcrumb}
							<Breadcrumb.Separator />
							<Breadcrumb.Item>
								<ContextMenu>
									<ContextMenuTrigger>
										{#if breadcrumb.path === currentPath}
											<Breadcrumb.Page style="color: var(--foreground);">
												{breadcrumb.name}
											</Breadcrumb.Page>
										{:else}
											<Breadcrumb.Link
												href="#"
												class="text-muted-foreground hover:text-foreground"
												style="color: var(--foreground);"
												onclick={(e) => {
													e.stopPropagation();
													handleNavigate(breadcrumb.path);
												}}
											>
												{breadcrumb.name}
											</Breadcrumb.Link>
										{/if}
									</ContextMenuTrigger>
									<ContextMenuContent>
										<ContextMenuItem onclick={() => handleSetHomepage(breadcrumb.path)}>
											<HomeIcon class="mr-2 h-4 w-4" />
											设置为主页
										</ContextMenuItem>
									</ContextMenuContent>
								</ContextMenu>
							</Breadcrumb.Item>
						{/each}
					</Breadcrumb.List>
				</Breadcrumb.Root>
			{:else}
				<div class="text-muted-foreground flex items-center gap-2 text-sm">
					<FolderOpen class="h-4 w-4" />
					<span>选择文件夹开始浏览</span>
				</div>
			{/if}
		</div>
	{/if}
</div>
