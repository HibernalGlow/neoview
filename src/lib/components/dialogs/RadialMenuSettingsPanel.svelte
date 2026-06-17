<script lang="ts">
	/**
	 * 轮盘菜单设置面板
	 * 配置 ray-menu 视觉参数、层数和菜单项列表。
	 */
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { radialMenuStore, type RadialMenuItem } from '$lib/stores/radialMenu';
	import { keyBindingsStore } from '$lib/stores/keybindings';
	import { ArrowDown, ArrowUp, CircleDot, Plus, RotateCcw, Trash2 } from '@lucide/svelte';

	interface ActionOption {
		action: string;
		name: string;
		category: string;
	}

	interface FlatItem {
		item: RadialMenuItem;
		depth: number;
		canAddChild: boolean;
	}

	const availableActions = $derived(
		keyBindingsStore.bindings
			.filter((binding) => !binding.action.startsWith('openRadialMenu.'))
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

	const flatItems = $derived.by(() => {
		const result: FlatItem[] = [];
		const maxDepth = radialMenuStore.config.layerCount - 1;

		function walk(items: RadialMenuItem[], depth: number) {
			for (const item of items) {
				result.push({
					item,
					depth,
					canAddChild: depth < maxDepth
				});
				if (item.children?.length) {
					walk(item.children, depth + 1);
				}
			}
		}

		walk(radialMenuStore.config.items, 0);
		return result;
	});

	const layerLabel = $derived(
		radialMenuStore.config.layerCount === 1
			? '1层'
			: radialMenuStore.config.layerCount === 2
				? '2层'
				: '3层'
	);

	function getActionName(action: string): string {
		const binding = keyBindingsStore.bindings.find((item) => item.action === action);
		return binding?.name ?? action;
	}

	function toNumber(value: string, fallback: number, min: number, max: number): number {
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) return fallback;
		return Math.min(max, Math.max(min, parsed));
	}

	function updateItemAction(id: string, action: string) {
		radialMenuStore.updateItem(id, {
			action: action || null,
			label: action ? getActionName(action) : '新项目'
		});
	}

	function updateItemLabel(id: string, label: string) {
		radialMenuStore.updateItem(id, { label: label.trim() || '未命名' });
	}

	function updateItemIcon(id: string, icon: string) {
		radialMenuStore.updateItem(id, { icon: icon.trim() || undefined });
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
				{radialMenuStore.config.enabled ? '已启用' : '已停用'} · {layerLabel} · {flatItems.length} 项
			</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" size="sm" onclick={() => radialMenuStore.resetConfig()}>
				<RotateCcw class="mr-2 h-4 w-4" />
				恢复默认
			</Button>
			<Button size="sm" onclick={() => radialMenuStore.addItem()}>
				<Plus class="mr-2 h-4 w-4" />
				添加根项
			</Button>
		</div>
	</div>

	<section class="grid gap-3 rounded-lg border bg-card/60 p-4 md:grid-cols-2 xl:grid-cols-3">
		<label class="grid gap-1.5 text-sm">
			<span class="text-muted-foreground text-xs font-medium">层数</span>
			<select
				class="border-input bg-background h-9 rounded-md border px-3 text-sm"
				value={radialMenuStore.config.layerCount}
				onchange={(event) =>
					radialMenuStore.setLayerCount(
						Number((event.currentTarget as HTMLSelectElement).value) as 1 | 2 | 3
					)}
			>
				<option value={1}>1层</option>
				<option value={2}>2层</option>
				<option value={3}>3层</option>
			</select>
		</label>

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

		<label class="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
			<span class="text-muted-foreground text-xs font-medium">启用轮盘</span>
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

		<label class="grid gap-1.5 text-sm">
			<span class="text-muted-foreground text-xs font-medium">半径 (px)</span>
			<Input
				type="number"
				min="60"
				max="300"
				value={radialMenuStore.config.radius}
				onchange={(event) =>
					radialMenuStore.updateConfig({
						radius: toNumber((event.currentTarget as HTMLInputElement).value, 150, 60, 300)
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
						innerRadius: toNumber(
							(event.currentTarget as HTMLInputElement).value,
							40,
							0,
							100
						)
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
						startAngle: toNumber(
							(event.currentTarget as HTMLInputElement).value,
							-90,
							-180,
							180
						)
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
						sweepAngle: toNumber(
							(event.currentTarget as HTMLInputElement).value,
							360,
							90,
							360
						)
					})}
			/>
		</label>
	</section>

	<section class="flex flex-col gap-3 rounded-lg border bg-card/60 p-4">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div>
				<h4 class="text-sm font-medium">菜单项</h4>
				<p class="text-muted-foreground text-xs">根项、子项和孙项会按当前层数保存。</p>
			</div>
			<Button variant="outline" size="sm" onclick={() => radialMenuStore.addItem()}>
				<Plus class="mr-2 h-4 w-4" />
				添加根项
			</Button>
		</div>

		{#if flatItems.length === 0}
			<div class="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
				暂无菜单项。
			</div>
		{:else}
			<div class="flex flex-col gap-2">
				{#each flatItems as flatItem (flatItem.item.id)}
					<div
						class="grid gap-2 rounded-lg border bg-background/70 p-3 md:grid-cols-[auto_auto_minmax(0,1fr)_auto]"
						style={`margin-left: ${flatItem.depth * 18}px`}
					>
						<div class="bg-muted text-muted-foreground flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium">
							{flatItem.depth + 1}
						</div>

						<div class="flex md:flex-col gap-1">
							<Button
								variant="ghost"
								size="icon"
								class="h-7 w-7"
								onclick={() => radialMenuStore.moveItem(flatItem.item.id, 'up')}
								title="上移"
							>
								<ArrowUp class="h-4 w-4" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								class="h-7 w-7"
								onclick={() => radialMenuStore.moveItem(flatItem.item.id, 'down')}
								title="下移"
							>
								<ArrowDown class="h-4 w-4" />
							</Button>
						</div>

						<div class="grid min-w-0 gap-2">
							<div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem]">
								<select
									class="border-input bg-background h-9 min-w-0 rounded-md border px-3 text-sm"
									value={flatItem.item.action ?? ''}
									onchange={(event) =>
										updateItemAction(
											flatItem.item.id,
											(event.currentTarget as HTMLSelectElement).value
										)}
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
								<Input
									placeholder="图标"
									value={flatItem.item.icon ?? ''}
									onchange={(event) =>
										updateItemIcon(flatItem.item.id, (event.currentTarget as HTMLInputElement).value)}
								/>
							</div>
							<Input
								placeholder="显示标签"
								value={flatItem.item.label}
								onchange={(event) =>
									updateItemLabel(flatItem.item.id, (event.currentTarget as HTMLInputElement).value)}
							/>
						</div>

						<div class="flex gap-1 md:flex-col">
							{#if flatItem.canAddChild}
								<Button
									variant="ghost"
									size="icon"
									class="h-8 w-8"
									onclick={() => radialMenuStore.addItem(flatItem.item.id)}
									title="添加子项"
								>
									<Plus class="h-4 w-4" />
								</Button>
							{/if}
							<Button
								variant="ghost"
								size="icon"
								class="h-8 w-8 text-destructive hover:text-destructive"
								onclick={() => radialMenuStore.removeItem(flatItem.item.id)}
								title="删除"
							>
								<Trash2 class="h-4 w-4" />
							</Button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
