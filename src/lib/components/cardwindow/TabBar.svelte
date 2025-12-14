<script lang="ts">
	/**
	 * TabBar - 卡片窗口标签栏组件
	 * 支持标签页切换、关闭、拖拽排序和添加新卡片
	 * Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 7.1, 7.2
	 */
	import { X, Plus, GripVertical } from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { cardRegistry } from '$lib/cards/registry';
	import type { CardTab } from '$lib/stores/cardWindowTabStore.svelte';
	import TabContextMenu from './TabContextMenu.svelte';

	interface Props {
		tabs: CardTab[];
		activeTabId: string;
		onTabClick: (tabId: string) => void;
		onTabClose: (tabId: string) => void;
		onTabReorder: (tabId: string, newOrder: number) => void;
		onAddCard: (cardId: string) => void;
		onTabDuplicate: (tabId: string) => void;
		showAddCardDropdown?: boolean;
	}

	let {
		tabs,
		activeTabId,
		onTabClick,
		onTabClose,
		onTabReorder,
		onAddCard,
		onTabDuplicate,
		showAddCardDropdown = $bindable(false)
	}: Props = $props();

	// 拖拽状态
	let draggedTabId = $state<string | null>(null);
	let dragOverTabId = $state<string | null>(null);
	let dragOverPosition = $state<'left' | 'right' | null>(null);

	// 右键菜单状态
	let contextMenuTabId = $state<string | null>(null);
	let contextMenuPosition = $state({ x: 0, y: 0 });
	let showContextMenu = $state(false);

	// 获取所有可用卡片（按分类分组）
	const cardGroups = $derived.by(() => {
		const groups: Record<string, { id: string; title: string; icon: typeof Plus }[]> = {};
		
		for (const [id, def] of Object.entries(cardRegistry)) {
			const panel = def.defaultPanel;
			if (!groups[panel]) {
				groups[panel] = [];
			}
			groups[panel].push({
				id,
				title: def.title,
				icon: def.icon
			});
		}
		
		return groups;
	});

	// 面板名称映射
	const panelNames: Record<string, string> = {
		benchmark: '性能测试',
		info: '信息',
		properties: '属性',
		upscale: '超分',
		history: '历史',
		bookmark: '书签',
		pageList: '页面列表',
		insights: '统计',
		folder: '文件夹',
		ai: 'AI'
	};

	// 拖拽处理
	function handleDragStart(e: DragEvent, tabId: string) {
		if (!e.dataTransfer) return;
		
		draggedTabId = tabId;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', tabId);
		
		// 设置拖拽预览
		const target = e.target as HTMLElement;
		if (target) {
			e.dataTransfer.setDragImage(target, 0, 0);
		}
	}

	function handleDragOver(e: DragEvent, tabId: string) {
		e.preventDefault();
		if (!e.dataTransfer || !draggedTabId || draggedTabId === tabId) return;
		
		e.dataTransfer.dropEffect = 'move';
		dragOverTabId = tabId;
		
		// 计算放置位置（左侧或右侧）
		const target = e.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const midpoint = rect.left + rect.width / 2;
		dragOverPosition = e.clientX < midpoint ? 'left' : 'right';
	}

	function handleDragLeave() {
		dragOverTabId = null;
		dragOverPosition = null;
	}

	function handleDrop(e: DragEvent, targetTabId: string) {
		e.preventDefault();
		if (!draggedTabId || draggedTabId === targetTabId) {
			resetDragState();
			return;
		}

		// 计算新位置
		const targetTab = tabs.find(t => t.id === targetTabId);
		const draggedTab = tabs.find(t => t.id === draggedTabId);
		
		if (!targetTab || !draggedTab) {
			resetDragState();
			return;
		}

		let newOrder = targetTab.order;
		if (dragOverPosition === 'right') {
			newOrder = targetTab.order + 1;
		}

		// 如果拖拽的标签页在目标之前，需要调整
		if (draggedTab.order < targetTab.order && dragOverPosition === 'left') {
			newOrder = targetTab.order - 1;
		}

		onTabReorder(draggedTabId, Math.max(0, newOrder));
		resetDragState();
	}

	function handleDragEnd() {
		resetDragState();
	}

	function resetDragState() {
		draggedTabId = null;
		dragOverTabId = null;
		dragOverPosition = null;
	}

	// 右键菜单处理
	function handleContextMenu(e: MouseEvent, tabId: string) {
		e.preventDefault();
		contextMenuTabId = tabId;
		contextMenuPosition = { x: e.clientX, y: e.clientY };
		showContextMenu = true;
	}

	function closeContextMenu() {
		showContextMenu = false;
		contextMenuTabId = null;
	}
</script>

<div class="h-9 bg-muted/50 flex items-center border-b px-1 gap-0.5 overflow-x-auto">
	<!-- 标签页列表 -->
	{#each tabs as tab (tab.id)}
		{@const isActive = tab.id === activeTabId}
		{@const isDragging = tab.id === draggedTabId}
		{@const isDragOver = tab.id === dragOverTabId}
		{@const Icon = tab.icon}
		
		<div
			class="group relative flex items-center gap-1 px-2 py-1 rounded-t text-xs cursor-pointer transition-all
				{isActive ? 'bg-background border-t border-x border-border -mb-px' : 'hover:bg-muted'}
				{isDragging ? 'opacity-50' : ''}
				{isDragOver && dragOverPosition === 'left' ? 'border-l-2 border-l-primary' : ''}
				{isDragOver && dragOverPosition === 'right' ? 'border-r-2 border-r-primary' : ''}"
			draggable="true"
			role="tab"
			tabindex="0"
			aria-selected={isActive}
			onclick={() => onTabClick(tab.id)}
			oncontextmenu={(e) => handleContextMenu(e, tab.id)}
			ondragstart={(e) => handleDragStart(e, tab.id)}
			ondragover={(e) => handleDragOver(e, tab.id)}
			ondragleave={handleDragLeave}
			ondrop={(e) => handleDrop(e, tab.id)}
			ondragend={handleDragEnd}
			onkeydown={(e) => e.key === 'Enter' && onTabClick(tab.id)}
		>
			<!-- 拖拽手柄 -->
			<GripVertical class="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
			
			<!-- 图标 -->
			{#if Icon}
				<Icon class="h-3.5 w-3.5 shrink-0" />
			{/if}
			
			<!-- 标题 -->
			<span class="truncate max-w-24">{tab.title}</span>
			
			<!-- 关闭按钮 -->
			<button
				type="button"
				class="ml-1 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
				onclick={(e) => {
					e.stopPropagation();
					onTabClose(tab.id);
				}}
				title="关闭标签页"
			>
				<X class="h-3 w-3" />
			</button>
		</div>
	{/each}

	<!-- 添加卡片按钮 -->
	<DropdownMenu.Root bind:open={showAddCardDropdown}>
		<DropdownMenu.Trigger class="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground" title="添加卡片 (Ctrl+T)">
			<Plus class="h-4 w-4" />
		</DropdownMenu.Trigger>
		<DropdownMenu.Content class="w-56 max-h-80 overflow-y-auto">
			{#each Object.entries(cardGroups) as [panelId, cards]}
				<DropdownMenu.Group>
					<DropdownMenu.Label>{panelNames[panelId] || panelId}</DropdownMenu.Label>
					{#each cards as card}
						{@const CardIcon = card.icon}
						<DropdownMenu.Item onclick={() => onAddCard(card.id)}>
							<CardIcon class="h-4 w-4 mr-2" />
							{card.title}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Group>
				<DropdownMenu.Separator />
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>

<!-- 右键菜单 -->
{#if showContextMenu && contextMenuTabId}
	<TabContextMenu
		tabId={contextMenuTabId}
		position={contextMenuPosition}
		onClose={closeContextMenu}
		onDuplicate={() => {
			if (contextMenuTabId) onTabDuplicate(contextMenuTabId);
			closeContextMenu();
		}}
		onCloseTab={() => {
			if (contextMenuTabId) onTabClose(contextMenuTabId);
			closeContextMenu();
		}}
	/>
{/if}
