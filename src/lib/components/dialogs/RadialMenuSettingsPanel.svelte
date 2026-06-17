<script lang="ts">
	/**
	 * 轮盘菜单设置面板
	 * 用可点击轮盘槽位管理一级、二级、三级菜单。
	 */
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { radialMenuStore, type RadialMenuItem } from '$lib/stores/radialMenu';
	import { keyBindingsStore } from '$lib/stores/keybindings';
	import { getActionIcon } from '$lib/utils/actionIcons';
	import {
		ArrowDown,
		ArrowUp,
		CircleDot,
		MousePointer2,
		Plus,
		RotateCcw,
		Trash2
	} from '@lucide/svelte';

	interface ActionOption {
		action: string;
		name: string;
		category: string;
	}

	interface EditorSlot {
		id: string;
		item: RadialMenuItem | null;
		level: 1 | 2 | 3;
		index: number;
		parentId?: string;
		path: string[];
		disabled: boolean;
		d: string;
		labelX: number;
		labelY: number;
		label: string;
		hint: string;
	}

	const CENTER = 260;
	const MIN_SLOT_COUNT = 8;
	const BANDS: Record<1 | 2 | 3, { inner: number; outer: number }> = {
		1: { inner: 34, outer: 100 },
		2: { inner: 100, outer: 180 },
		3: { inner: 180, outer: 252 }
	};

	let selectedPath = $state<string[]>([]);
	let editorOpen = $state(false);

	const availableActions = $derived(
		keyBindingsStore.bindings
			.filter(
				(binding) =>
					!binding.action.startsWith('openRadialMenu.') &&
					!binding.action.startsWith('radialMenu.')
			)
			.map((binding) => ({
				action: binding.action,
				name: binding.name,
				category: binding.category
			}))
	);

	const actionsByCategory = $derived.by(() => {
		const groups = new Map<string, ActionOption[]>();
		for (const action of availableActions) {
			const group = groups.get(action.category) ?? [];
			group.push(action);
			groups.set(action.category, group);
		}
		return [...groups.entries()].map(([category, actions]) => ({ category, actions }));
	});

	const selectedItem = $derived.by(() => findItemByPath(radialMenuStore.config.items, selectedPath));
	const selectedLevel = $derived(Math.min(3, selectedPath.length || 1) as 1 | 2 | 3);
	const selectedAction = $derived(
		selectedItem?.action
			? keyBindingsStore.bindings.find((binding) => binding.action === selectedItem.action)
			: null
	);
	const SelectedActionIcon = $derived(
		selectedItem?.action ? getActionIcon(selectedItem.action) : CircleDot
	);
	const otherMenus = $derived(
		radialMenuStore.menus.filter((menu) => menu.id !== radialMenuStore.config.activeMenuId)
	);

	const editorSlots = $derived.by(() => {
		const rootItems = radialMenuStore.config.items;
		const level1Item = selectedPath[0] ? findItemById(rootItems, selectedPath[0]) : null;
		const level2Item =
			level1Item && selectedPath[1] ? findItemById(level1Item.children ?? [], selectedPath[1]) : null;

		return [
			...buildSlots(1, rootItems, undefined, []),
			...buildSlots(2, level1Item?.children ?? [], level1Item?.id, level1Item ? [level1Item.id] : []),
			...buildSlots(
				3,
				level2Item?.children ?? [],
				level2Item?.id,
				level1Item && level2Item ? [level1Item.id, level2Item.id] : []
			)
		];
	});

	const actualLayerCount = $derived.by(() => getMaxDepth(radialMenuStore.config.items));

	$effect(() => {
		const nextLayerCount = Math.max(1, actualLayerCount) as 1 | 2 | 3;
		if (radialMenuStore.config.layerCount !== nextLayerCount) {
			radialMenuStore.updateConfig({ layerCount: nextLayerCount });
		}
	});

	$effect(() => {
		if (selectedPath.length > 0 && !findItemByPath(radialMenuStore.config.items, selectedPath)) {
			selectedPath = selectedPath.slice(0, -1);
			editorOpen = false;
		}
	});

	function getSlotIndex(item: RadialMenuItem, fallbackIndex: number): number {
		return typeof item.slotIndex === 'number' && Number.isFinite(item.slotIndex)
			? item.slotIndex
			: fallbackIndex;
	}

	function getSlotCount(items: RadialMenuItem[]): number {
		const maxSlot = items.reduce(
			(max, item, index) => Math.max(max, getSlotIndex(item, index)),
			-1
		);
		return Math.max(MIN_SLOT_COUNT, maxSlot + 2, items.length + 1);
	}

	function buildSlots(
		level: 1 | 2 | 3,
		items: RadialMenuItem[],
		parentId: string | undefined,
		parentPath: string[]
	): EditorSlot[] {
		const hasParent = level === 1 || Boolean(parentId);
		const slotCount = getSlotCount(items);
		const sweep = radialMenuStore.config.sweepAngle / slotCount;
		const band = BANDS[level];
		const itemsBySlot = new Map<number, RadialMenuItem>();

		items.forEach((item, index) => {
			itemsBySlot.set(getSlotIndex(item, index), item);
		});

		return Array.from({ length: slotCount }, (_, index) => {
			const item = itemsBySlot.get(index) ?? null;
			const start = radialMenuStore.config.startAngle + index * sweep;
			const end = start + sweep;
			const labelPoint = polar((band.inner + band.outer) / 2, start + sweep / 2);
			const path = item ? [...parentPath, item.id] : parentPath;
			return {
				id: `${level}-${index}-${item?.id ?? 'empty'}`,
				item,
				level,
				index,
				parentId,
				path,
				disabled: !hasParent,
				d: sectorPath(band.inner, band.outer, start, end),
				labelX: labelPoint.x,
				labelY: labelPoint.y,
				label: item?.label || (hasParent ? '+' : getLevelName(level - 1)),
				hint: item ? getLevelName(level) : hasParent ? `添加${getLevelName(level)}菜单` : `先选择${getLevelName(level - 1)}菜单`
			};
		});
	}

	function polar(radius: number, angleDeg: number): { x: number; y: number } {
		const radians = ((angleDeg - 90) * Math.PI) / 180;
		return {
			x: CENTER + radius * Math.cos(radians),
			y: CENTER + radius * Math.sin(radians)
		};
	}

	function sectorPath(innerRadius: number, outerRadius: number, startAngle: number, endAngle: number): string {
		const outerStart = polar(outerRadius, startAngle);
		const outerEnd = polar(outerRadius, endAngle);
		const innerEnd = polar(innerRadius, endAngle);
		const innerStart = polar(innerRadius, startAngle);
		const largeArc = endAngle - startAngle > 180 ? 1 : 0;

		return [
			`M ${outerStart.x} ${outerStart.y}`,
			`A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
			`L ${innerEnd.x} ${innerEnd.y}`,
			`A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
			'Z'
		].join(' ');
	}

	function getActionName(action: string): string {
		const binding = keyBindingsStore.bindings.find((item) => item.action === action);
		return binding?.name ?? action;
	}

	function getShortLabel(label: string): string {
		return label.length > 5 ? `${label.slice(0, 5)}…` : label;
	}

	function getLevelName(level: number): string {
		if (level <= 1) return '一级';
		if (level === 2) return '二级';
		return '三级';
	}

	function findItemById(items: RadialMenuItem[], id: string): RadialMenuItem | null {
		for (const item of items) {
			if (item.id === id) return item;
			const child = findItemById(item.children ?? [], id);
			if (child) return child;
		}
		return null;
	}

	function findItemByPath(items: RadialMenuItem[], path: string[]): RadialMenuItem | null {
		let currentItems = items;
		let current: RadialMenuItem | null = null;
		for (const id of path) {
			current = currentItems.find((item) => item.id === id) ?? null;
			if (!current) return null;
			currentItems = current.children ?? [];
		}
		return current;
	}

	function getMaxDepth(items: RadialMenuItem[], depth = 1): 1 | 2 | 3 {
		let maxDepth = items.length > 0 ? depth : 1;
		for (const item of items) {
			if (item.children?.length) {
				maxDepth = Math.max(maxDepth, getMaxDepth(item.children, Math.min(3, depth + 1)));
			}
		}
		return Math.min(3, maxDepth) as 1 | 2 | 3;
	}

	function genId(): string {
		return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	function insertIntoItems(
		items: RadialMenuItem[],
		parentId: string | undefined,
		index: number,
		newItem: RadialMenuItem
	): RadialMenuItem[] {
		if (!parentId) {
			return [...items, { ...newItem, slotIndex: index }];
		}

		return items.map((item) => {
			if (item.id === parentId) {
				return {
					...item,
					children: [...(item.children ?? []), { ...newItem, slotIndex: index }]
				};
			}
			if (item.children?.length) {
				return { ...item, children: insertIntoItems(item.children, parentId, index, newItem) };
			}
			return item;
		});
	}

	function removeFromItems(items: RadialMenuItem[], id: string): RadialMenuItem[] {
		return items
			.filter((item) => item.id !== id)
			.map((item) =>
				item.children?.length ? { ...item, children: removeFromItems(item.children, id) } : item
			);
	}

	function addItemAt(slot: EditorSlot) {
		if (slot.disabled) return;
		const item: RadialMenuItem = {
			id: genId(),
			action: null,
			label: `新${getLevelName(slot.level)}菜单`,
			slotIndex: slot.index
		};

		const nextItems = insertIntoItems(radialMenuStore.config.items, slot.parentId, slot.index, item);
		radialMenuStore.updateConfig({
			items: nextItems,
			layerCount: Math.max(radialMenuStore.config.layerCount, slot.level) as 1 | 2 | 3
		});
		selectedPath = [...slot.path, item.id];
		editorOpen = true;
	}

	function switchMenu(menuId: string) {
		radialMenuStore.setActiveMenu(menuId);
		selectedPath = [];
	}

	function addMenu() {
		const id = radialMenuStore.addMenu();
		selectedPath = [];
		switchMenu(id);
	}

	function handleSlotClick(slot: EditorSlot) {
		if (slot.item) {
			selectedPath = slot.path;
			editorOpen = true;
			return;
		}
		addItemAt(slot);
	}

	function handleSlotHover(slot: EditorSlot) {
		if (slot.disabled || !slot.item) return;
	}

	function updateSelectedAction(action: string) {
		if (!selectedItem) return;
		radialMenuStore.updateItem(selectedItem.id, {
			action: action || null,
			moveToMenuId: undefined,
			label: action ? getActionName(action) : selectedItem.label
		});
	}

	function updateSelectedMode(mode: 'action' | 'moveTo') {
		if (!selectedItem) return;
		if (mode === 'action') {
			radialMenuStore.updateItem(selectedItem.id, { moveToMenuId: undefined });
			return;
		}
		const targetMenuId = otherMenus[0]?.id ?? radialMenuStore.addMenu(undefined, false);
		radialMenuStore.updateItem(selectedItem.id, {
			action: null,
			moveToMenuId: targetMenuId,
			label: selectedItem.label.startsWith('新') ? '切换轮盘' : selectedItem.label
		});
	}

	function updateSelectedMoveTo(menuId: string) {
		if (!selectedItem || !menuId) return;
		radialMenuStore.updateItem(selectedItem.id, {
			action: null,
			moveToMenuId: menuId
		});
	}

	function updateSelectedLabel(label: string) {
		if (!selectedItem) return;
		radialMenuStore.updateItem(selectedItem.id, { label: label.trim() || '未命名' });
	}

	function removeSelectedItem() {
		if (!selectedItem) return;
		const nextItems = removeFromItems(radialMenuStore.config.items, selectedItem.id);
		radialMenuStore.updateConfig({ items: nextItems, layerCount: getMaxDepth(nextItems) });
		selectedPath = selectedPath.slice(0, -1);
		editorOpen = false;
	}

	function addChildToSelected() {
		if (!selectedItem || selectedPath.length >= 3) return;
		const level = (selectedPath.length + 1) as 2 | 3;
		const newItem: RadialMenuItem = {
			id: genId(),
			action: null,
			label: `新${getLevelName(level)}菜单`,
			slotIndex: getSlotCount(selectedItem.children ?? []) - 1
		};
		const nextItems = insertIntoItems(
			radialMenuStore.config.items,
			selectedItem.id,
			selectedItem.children?.length ?? 0,
			newItem
		);
		radialMenuStore.updateConfig({
			items: nextItems,
			layerCount: Math.max(radialMenuStore.config.layerCount, level) as 1 | 2 | 3
		});
		selectedPath = [...selectedPath, newItem.id];
	}
</script>

<div class="flex flex-col gap-4 p-6 text-foreground">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="space-y-1">
			<h3 class="flex items-center gap-2 text-lg font-semibold">
				<CircleDot class="h-5 w-5 text-primary" />
				轮盘菜单
			</h3>
			<p class="text-muted-foreground text-sm">
				{radialMenuStore.config.enabled ? '已启用' : '已停用'} · 当前 {getLevelName(actualLayerCount)}菜单 · 移动鼠标确认路径，点击槽位管理
			</p>
		</div>
		<div class="flex gap-2">
			<select
				class="border-input bg-background h-9 rounded-md border px-3 text-sm"
				value={radialMenuStore.config.activeMenuId}
				onchange={(event) => switchMenu((event.currentTarget as HTMLSelectElement).value)}
			>
				{#each radialMenuStore.menus as menu (menu.id)}
					<option value={menu.id}>{menu.name}</option>
				{/each}
			</select>
			<Button variant="outline" size="sm" onclick={addMenu}>
				<Plus class="mr-2 h-4 w-4" />
				新轮盘
			</Button>
			<Button variant="outline" size="sm" onclick={() => radialMenuStore.resetConfig()}>
				<RotateCcw class="mr-2 h-4 w-4" />
				清空
			</Button>
		</div>
	</div>

	<div class="grid gap-4 xl:grid-cols-[minmax(28rem,1fr)_22rem]">
		<section class="rounded-lg border bg-card/60 p-4">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
				<div>
					<h4 class="text-sm font-medium">轮盘编辑预览</h4>
					<p class="text-muted-foreground text-xs">多层同屏显示；鼠标经过扇区确认当前路径，点击空槽新增，点击已有槽编辑。</p>
				</div>
				<label class="flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
					<span class="text-muted-foreground">启用</span>
					<input
						type="checkbox"
						class="h-4 w-4 accent-primary"
						checked={radialMenuStore.config.enabled}
						onchange={(event) =>
							radialMenuStore.updateConfig({
								enabled: (event.currentTarget as HTMLInputElement).checked
							})}
					/>
				</label>
			</div>

			<div class="flex justify-center overflow-auto">
				<svg viewBox="0 0 520 520" class="h-[min(68vh,36rem)] min-h-[28rem] w-full max-w-[36rem]">
					<circle cx={CENTER} cy={CENTER} r="252" class="fill-background stroke-border" />
					<circle cx={CENTER} cy={CENTER} r="180" class="fill-background stroke-border" />
					<circle cx={CENTER} cy={CENTER} r="100" class="fill-background stroke-border" />
					<circle cx={CENTER} cy={CENTER} r="34" class="fill-background stroke-border" />

					{#each editorSlots as slot (slot.id)}
						{@const isSelected = slot.item && selectedPath[selectedPath.length - 1] === slot.item.id}
						{@const isInSelectedPath = slot.item && selectedPath.includes(slot.item.id)}
						{@const SlotIcon = slot.item?.action ? getActionIcon(slot.item.action) : CircleDot}
						<g
							class:cursor-pointer={!slot.disabled}
							class:opacity-35={slot.disabled}
							onpointerenter={() => handleSlotHover(slot)}
							onpointermove={() => handleSlotHover(slot)}
							onclick={() => handleSlotClick(slot)}
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									handleSlotClick(slot);
								}
							}}
							tabindex={slot.disabled ? -1 : 0}
							role="button"
							aria-label={slot.hint}
						>
							<path
								d={slot.d}
								class={slot.item
									? isSelected
										? 'fill-primary/25 stroke-primary stroke-2'
										: isInSelectedPath
											? 'fill-primary/15 stroke-primary/70'
											: 'fill-muted/35 stroke-border hover:fill-primary/10'
									: 'fill-background stroke-border hover:fill-muted/50'}
							/>
							{#if slot.item}
								<foreignObject
									x={slot.labelX - 38}
									y={slot.labelY - 20}
									width="76"
									height="40"
									class="pointer-events-none"
								>
									<div
										class="flex h-full w-full flex-col items-center justify-center gap-0.5 overflow-hidden text-center"
									>
										<SlotIcon class="h-4 w-4 shrink-0 text-foreground" />
										<div class="max-w-full truncate px-1 text-[11px] font-medium leading-tight text-foreground">
											{getShortLabel(slot.label)}
										</div>
									</div>
								</foreignObject>
							{:else if !slot.disabled}
								<text
									x={slot.labelX}
									y={slot.labelY}
									text-anchor="middle"
									dominant-baseline="middle"
									class="pointer-events-none fill-muted-foreground text-[18px]"
								>
									+
								</text>
							{/if}
						</g>
					{/each}

					<circle cx={CENTER} cy={CENTER} r="24" class="fill-card stroke-border" />
				</svg>
			</div>
		</section>

		<aside class="flex flex-col gap-3 rounded-lg border bg-card/60 p-4">
			<div class="space-y-1">
				<h4 class="text-sm font-medium">槽位管理</h4>
				<p class="text-muted-foreground text-xs">
					{#if selectedItem}
						正在编辑 {getLevelName(selectedLevel)}菜单
					{:else}
						点左侧轮盘槽位开始添加或编辑
					{/if}
				</p>
			</div>

			{#if selectedItem}
				<label class="grid gap-1.5 text-sm">
					<span class="text-muted-foreground text-xs font-medium">当前轮盘名</span>
					<Input
						value={radialMenuStore.activeMenu.name}
						onchange={(event) =>
							radialMenuStore.updateMenuName(
								radialMenuStore.activeMenu.id,
								(event.currentTarget as HTMLInputElement).value
							)}
					/>
				</label>

				<div class="flex items-center gap-2 rounded-lg border bg-background/70 p-3">
					<div class="bg-muted flex h-9 w-9 items-center justify-center rounded-md">
						<SelectedActionIcon class="h-4 w-4" />
					</div>
					<div class="min-w-0">
						<div class="truncate text-sm font-medium">{selectedItem.label}</div>
						<div class="text-muted-foreground truncate text-xs">
							{selectedAction?.name ?? '未绑定动作'}
						</div>
					</div>
				</div>

				<label class="grid gap-1.5 text-sm">
					<span class="text-muted-foreground text-xs font-medium">槽位类型</span>
					<select
						class="border-input bg-background h-9 rounded-md border px-3 text-sm"
						value={selectedItem.moveToMenuId ? 'moveTo' : 'action'}
						onchange={(event) =>
							updateSelectedMode((event.currentTarget as HTMLSelectElement).value as 'action' | 'moveTo')}
					>
						<option value="action">执行动作</option>
						<option value="moveTo">跳转轮盘</option>
					</select>
				</label>

				{#if selectedItem.moveToMenuId}
					<label class="grid gap-1.5 text-sm">
						<span class="text-muted-foreground text-xs font-medium">目标轮盘</span>
						<select
							class="border-input bg-background h-9 rounded-md border px-3 text-sm"
							value={selectedItem.moveToMenuId}
							onchange={(event) => updateSelectedMoveTo((event.currentTarget as HTMLSelectElement).value)}
						>
							{#each otherMenus as menu (menu.id)}
								<option value={menu.id}>{menu.name}</option>
							{/each}
						</select>
					</label>
				{:else}
					<label class="grid gap-1.5 text-sm">
						<span class="text-muted-foreground text-xs font-medium">动作</span>
					<select
						class="border-input bg-background h-9 rounded-md border px-3 text-sm"
						value={selectedItem.action ?? ''}
						onchange={(event) => updateSelectedAction((event.currentTarget as HTMLSelectElement).value)}
					>
						<option value="">未绑定</option>
						{#each actionsByCategory as group (group.category)}
							<optgroup label={group.category}>
								{#each group.actions as action (action.action)}
									<option value={action.action}>{action.name}</option>
								{/each}
							</optgroup>
						{/each}
					</select>
					</label>
				{/if}

				<label class="grid gap-1.5 text-sm">
					<span class="text-muted-foreground text-xs font-medium">显示文字</span>
					<Input
						value={selectedItem.label}
						onchange={(event) =>
							updateSelectedLabel((event.currentTarget as HTMLInputElement).value)}
					/>
				</label>

				<div class="grid grid-cols-2 gap-2">
					<Button
						variant="outline"
						size="sm"
						onclick={() => radialMenuStore.moveItem(selectedItem.id, 'up')}
					>
						<ArrowUp class="mr-2 h-4 w-4" />
						前移
					</Button>
					<Button
						variant="outline"
						size="sm"
						onclick={() => radialMenuStore.moveItem(selectedItem.id, 'down')}
					>
						<ArrowDown class="mr-2 h-4 w-4" />
						后移
					</Button>
				</div>

				{#if selectedPath.length < 3}
					<Button variant="outline" size="sm" onclick={addChildToSelected}>
						<Plus class="mr-2 h-4 w-4" />
						添加下一级菜单
					</Button>
				{/if}

				<Button
					variant="ghost"
					size="sm"
					class="justify-start text-destructive hover:text-destructive"
					onclick={removeSelectedItem}
				>
					<Trash2 class="mr-2 h-4 w-4" />
					删除这个槽位
				</Button>
			{:else}
				<div class="text-muted-foreground flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm">
					<MousePointer2 class="mb-3 h-7 w-7 opacity-50" />
					点击轮盘上的任意空白扇区添加菜单项。
				</div>
			{/if}
		</aside>
	</div>

	<section class="grid gap-3 rounded-lg border bg-card/60 p-4 md:grid-cols-2 xl:grid-cols-5">
		<label class="grid gap-1.5 text-sm">
			<span class="text-muted-foreground text-xs font-medium">样式</span>
			<select
				class="border-input bg-background h-9 rounded-md border px-3 text-sm"
				value={radialMenuStore.config.variant}
				onchange={(event) =>
					radialMenuStore.updateConfig({
						variant: (event.currentTarget as HTMLSelectElement).value as 'slice' | 'bubble'
					})}
			>
				<option value="slice">扇形</option>
				<option value="bubble">气泡</option>
			</select>
		</label>

		<label class="grid gap-1.5 text-sm">
			<span class="text-muted-foreground text-xs font-medium">半径 (px)</span>
			<Input
				type="number"
				min="60"
				max="300"
				value={radialMenuStore.config.radius}
				onchange={(event) =>
					radialMenuStore.updateConfig({
						radius: Number((event.currentTarget as HTMLInputElement).value)
					})}
			/>
		</label>

		<label class="grid gap-1.5 text-sm">
			<span class="text-muted-foreground text-xs font-medium">内圆死区 (px)</span>
			<Input
				type="number"
				min="0"
				max="100"
				value={radialMenuStore.config.innerRadius}
				onchange={(event) =>
					radialMenuStore.updateConfig({
						innerRadius: Number((event.currentTarget as HTMLInputElement).value)
					})}
			/>
		</label>

		<label class="grid gap-1.5 text-sm">
			<span class="text-muted-foreground text-xs font-medium">起始角度</span>
			<Input
				type="number"
				min="-180"
				max="180"
				value={radialMenuStore.config.startAngle}
				onchange={(event) =>
					radialMenuStore.updateConfig({
						startAngle: Number((event.currentTarget as HTMLInputElement).value)
					})}
			/>
		</label>

		<label class="grid gap-1.5 text-sm">
			<span class="text-muted-foreground text-xs font-medium">扫描角度</span>
			<Input
				type="number"
				min="90"
				max="360"
				value={radialMenuStore.config.sweepAngle}
				onchange={(event) =>
					radialMenuStore.updateConfig({
						sweepAngle: Number((event.currentTarget as HTMLInputElement).value)
					})}
			/>
		</label>
	</section>
</div>

{#if editorOpen && selectedItem}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
		role="presentation"
		onclick={() => (editorOpen = false)}
	>
		<div
			class="bg-background w-full max-w-md space-y-4 rounded-lg border p-5 shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-label="编辑轮盘槽位"
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => event.stopPropagation()}
		>
			<div class="flex items-start justify-between gap-3">
				<div class="space-y-1">
					<h4 class="text-base font-semibold">编辑槽位</h4>
					<p class="text-muted-foreground text-xs">
						{getLevelName(selectedLevel)}菜单 · 第 {selectedItem.slotIndex ?? 0} 槽
					</p>
				</div>
				<Button variant="ghost" size="sm" onclick={() => (editorOpen = false)}>关闭</Button>
			</div>

			<div class="flex items-center gap-2 rounded-lg border bg-card/70 p-3">
				<div class="bg-muted flex h-9 w-9 items-center justify-center rounded-md">
					<SelectedActionIcon class="h-4 w-4" />
				</div>
				<div class="min-w-0">
					<div class="truncate text-sm font-medium">{selectedItem.label}</div>
					<div class="text-muted-foreground truncate text-xs">
						{selectedAction?.name ?? (selectedItem.moveToMenuId ? '跳转轮盘' : '未绑定动作')}
					</div>
				</div>
			</div>

			<label class="grid gap-1.5 text-sm">
				<span class="text-muted-foreground text-xs font-medium">槽位类型</span>
				<select
					class="border-input bg-background h-9 rounded-md border px-3 text-sm"
					value={selectedItem.moveToMenuId ? 'moveTo' : 'action'}
					onchange={(event) =>
						updateSelectedMode((event.currentTarget as HTMLSelectElement).value as 'action' | 'moveTo')}
				>
					<option value="action">执行动作</option>
					<option value="moveTo">跳转轮盘</option>
				</select>
			</label>

			{#if selectedItem.moveToMenuId}
				<label class="grid gap-1.5 text-sm">
					<span class="text-muted-foreground text-xs font-medium">目标轮盘</span>
					<select
						class="border-input bg-background h-9 rounded-md border px-3 text-sm"
						value={selectedItem.moveToMenuId}
						onchange={(event) => updateSelectedMoveTo((event.currentTarget as HTMLSelectElement).value)}
					>
						{#each otherMenus as menu (menu.id)}
							<option value={menu.id}>{menu.name}</option>
						{/each}
					</select>
				</label>
			{:else}
				<label class="grid gap-1.5 text-sm">
					<span class="text-muted-foreground text-xs font-medium">动作</span>
					<select
						class="border-input bg-background h-9 rounded-md border px-3 text-sm"
						value={selectedItem.action ?? ''}
						onchange={(event) => updateSelectedAction((event.currentTarget as HTMLSelectElement).value)}
					>
						<option value="">未绑定</option>
						{#each actionsByCategory as group (group.category)}
							<optgroup label={group.category}>
								{#each group.actions as action (action.action)}
									<option value={action.action}>{action.name}</option>
								{/each}
							</optgroup>
						{/each}
					</select>
				</label>
			{/if}

			<label class="grid gap-1.5 text-sm">
				<span class="text-muted-foreground text-xs font-medium">显示文字</span>
				<Input
					value={selectedItem.label}
					onchange={(event) => updateSelectedLabel((event.currentTarget as HTMLInputElement).value)}
				/>
			</label>

			<div class="flex flex-wrap gap-2">
				{#if selectedPath.length < 3}
					<Button variant="outline" size="sm" onclick={addChildToSelected}>
						<Plus class="mr-2 h-4 w-4" />
						添加下一级
					</Button>
				{/if}
				<Button
					variant="ghost"
					size="sm"
					class="text-destructive hover:text-destructive"
					onclick={removeSelectedItem}
				>
					<Trash2 class="mr-2 h-4 w-4" />
					删除槽位
				</Button>
			</div>
		</div>
	</div>
{/if}
