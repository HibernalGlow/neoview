<script lang="ts">
	/**
	 * 轮盘菜单设置面板
	 * 配置 ray-menu 视觉参数、层数和菜单项列表（支持3层嵌套）
	 */

	import { radialMenuStore } from '$lib/stores/radialMenu';
	import type { RadialMenuItem } from '$lib/stores/radialMenu';
	import { keyBindingsStore } from '$lib/stores/keybindings';

	// 获取所有可用 action 列表（排除轮盘自身的触发动作）
	const availableActions = $derived(
		keyBindingsStore.bindings
			.filter((b) => !b.action.startsWith('openRadialMenu.'))
			.map((b) => ({
				action: b.action,
				name: b.name,
				category: b.category
			}))
	);

	// 按 category 分组
	const actionsByCategory = $derived.by(() => {
		const map = new Map<string, typeof availableActions>();
		for (const a of availableActions) {
			if (!map.has(a.category)) map.set(a.category, []);
			map.get(a.category)!.push(a);
		}
		return map;
	});

	function getActionName(action: string): string {
		const binding = keyBindingsStore.bindings.find((b) => b.action === action);
		return binding?.name ?? action;
	}

	/** 扁平化 items 树用于渲染 */
	interface FlatItem {
		item: RadialMenuItem;
		depth: number; // 0=root, 1=child, 2=grandchild
		parentId: string | null;
		canAddChild: boolean;
	}

	const flatItems = $derived.by(() => {
		const result: FlatItem[] = [];
		const maxDepth = radialMenuStore.config.layerCount - 1;

		function walk(items: RadialMenuItem[], depth: number, parentId: string | null) {
			for (const item of items) {
				result.push({
					item,
					depth,
					parentId,
					canAddChild: depth < maxDepth,
				});
				if (item.children?.length) {
					walk(item.children, depth + 1, item.id);
				}
			}
		}

		walk(radialMenuStore.config.items, 0, null);
		return result;
	});

	function addItem(parentId?: string) {
		radialMenuStore.addItem(parentId);
	}

	function updateItemAction(id: string, action: string) {
		radialMenuStore.updateItem(id, {
			action,
			label: getActionName(action),
		});
	}

	function updateItemLabel(id: string, label: string) {
		radialMenuStore.updateItem(id, { label });
	}

	function updateItemIcon(id: string, icon: string) {
		radialMenuStore.updateItem(id, { icon: icon || undefined });
	}

	function removeItem(id: string) {
		radialMenuStore.removeItem(id);
	}

	function moveItem(id: string, direction: 'up' | 'down') {
		radialMenuStore.moveItem(id, direction);
	}

	function setLayerCount(count: 1 | 2 | 3) {
		radialMenuStore.setLayerCount(count);
	}

	function resetToDefault() {
		radialMenuStore.resetConfig();
	}

	const layerLabel = $derived(
		radialMenuStore.config.layerCount === 1
			? '1层（仅根菜单）'
			: radialMenuStore.config.layerCount === 2
				? '2层（根+子菜单）'
				: '3层（根+子+孙菜单）'
	);
</script>

<div class="radial-settings">
	<h3>轮盘菜单设置</h3>

	<!-- 视觉参数 -->
	<div class="settings-row">
		<label>层数</label>
		<select
			value={radialMenuStore.config.layerCount}
			onchange={(e) => setLayerCount(Number((e.target as HTMLSelectElement).value) as 1 | 2 | 3)}
		>
			<option value={1}>1层（仅根菜单）</option>
			<option value={2}>2层（根+子菜单）</option>
			<option value={3}>3层（根+子+孙菜单）</option>
		</select>
	</div>

	<div class="settings-row">
		<label>半径 (px)</label>
		<input
			type="number"
			min="60"
			max="300"
			value={radialMenuStore.config.radius}
			onchange={(e) =>
				radialMenuStore.updateConfig({ radius: Number((e.target as HTMLInputElement).value) })}
		/>
	</div>

	<div class="settings-row">
		<label>内圆死区 (px)</label>
		<input
			type="number"
			min="0"
			max="100"
			value={radialMenuStore.config.innerRadius}
			onchange={(e) =>
				radialMenuStore.updateConfig({
					innerRadius: Number((e.target as HTMLInputElement).value)
				})}
		/>
	</div>

	<div class="settings-row">
		<label>样式</label>
		<select
			value={radialMenuStore.config.variant}
			onchange={(e) =>
				radialMenuStore.updateConfig({
					variant: (e.target as HTMLSelectElement).value as 'slice' | 'bubble'
				})}
		>
			<option value="slice">扇形 (slice)</option>
			<option value="bubble">气泡 (bubble)</option>
		</select>
	</div>

	<div class="settings-row">
		<label>起始角度 (°)</label>
		<input
			type="number"
			min="-180"
			max="180"
			value={radialMenuStore.config.startAngle}
			onchange={(e) =>
				radialMenuStore.updateConfig({
					startAngle: Number((e.target as HTMLInputElement).value)
				})}
		/>
	</div>

	<div class="settings-row">
		<label>扫描角度 (°)</label>
		<input
			type="number"
			min="90"
			max="360"
			value={radialMenuStore.config.sweepAngle}
			onchange={(e) =>
				radialMenuStore.updateConfig({
					sweepAngle: Number((e.target as HTMLInputElement).value)
				})}
		/>
	</div>

	<div class="settings-row">
		<label>
			<input
				type="checkbox"
				checked={radialMenuStore.config.enabled}
				onchange={(e) =>
					radialMenuStore.updateConfig({ enabled: (e.target as HTMLInputElement).checked })}
			/>
			启用轮盘菜单
		</label>
	</div>

	<!-- 菜单项列表 -->
	<div class="items-section">
		<div class="items-header">
			<h4>菜单项 ({flatItems.length}) — {layerLabel}</h4>
			<button class="add-btn" onclick={() => addItem()}>＋ 添加根项</button>
		</div>

		{#if flatItems.length === 0}
			<div class="empty-hint">
				暂无菜单项，点击"添加根项"开始绑定。右键短按或 Enter 长按唤出轮盘。
			</div>
		{:else}
			<div class="items-list">
				{#each flatItems as fi (fi.item.id)}
					<div class="item-row" style="margin-left: {fi.depth * 20}px">
						<div class="item-depth-badge">{fi.depth + 1}</div>

						<div class="item-controls">
							<button
								class="move-btn"
								onclick={() => moveItem(fi.item.id, 'up')}
								title="上移">↑</button
							>
							<button
								class="move-btn"
								onclick={() => moveItem(fi.item.id, 'down')}
								title="下移">↓</button
							>
						</div>

						<div class="item-fields">
							<div class="item-field-row">
								<select
									value={fi.item.action ?? ''}
									onchange={(e) =>
										updateItemAction(fi.item.id, (e.target as HTMLSelectElement).value)}
								>
									<option value="">— 未绑定 —</option>
									{#each [...actionsByCategory.entries()] as [category, actions] (category)}
										<optgroup label={category}>
											{#each actions as a (a.action)}
												<option value={a.action}>{a.name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
								<input
									type="text"
									placeholder="图标"
									value={fi.item.icon ?? ''}
									onchange={(e) => updateItemIcon(fi.item.id, (e.target as HTMLInputElement).value)}
									class="icon-input"
								/>
							</div>
							<input
								type="text"
								placeholder="显示标签"
								value={fi.item.label}
								onchange={(e) => updateItemLabel(fi.item.id, (e.target as HTMLInputElement).value)}
								class="label-input"
							/>
						</div>

						<div class="item-actions">
							{#if fi.canAddChild}
								<button
									class="child-btn"
									onclick={() => addItem(fi.item.id)}
									title="添加子项">＋</button
								>
							{/if}
							<button class="remove-btn" onclick={() => removeItem(fi.item.id)} title="删除"
								>✕</button
							>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<div class="actions">
		<button onclick={resetToDefault}>恢复默认（清空）</button>
	</div>
</div>

<style>
	.radial-settings {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.radial-settings h3 {
		margin: 0 0 4px 0;
		font-size: 16px;
	}

	.settings-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.settings-row label {
		min-width: 120px;
		font-size: 13px;
	}

	.settings-row select,
	.settings-row input[type='number'] {
		padding: 4px 8px;
		border: 1px solid var(--border-color, #444);
		border-radius: 4px;
		background: var(--bg-color, #1a1a2e);
		color: var(--text-color, #e0e0e0);
		font-size: 13px;
	}

	.items-section {
		border-top: 1px solid var(--border-color, #333);
		padding-top: 8px;
	}

	.items-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}

	.items-header h4 {
		margin: 0;
		font-size: 14px;
	}

	.add-btn {
		padding: 4px 10px;
		border: 1px solid var(--border-color, #444);
		border-radius: 4px;
		background: var(--bg-color, #1a1a2e);
		color: var(--text-color, #e0e0e0);
		cursor: pointer;
		font-size: 12px;
		white-space: nowrap;
	}

	.add-btn:hover {
		background: var(--bg-hover, #2a2a4e);
	}

	.empty-hint {
		padding: 16px;
		text-align: center;
		color: var(--text-muted, #888);
		font-size: 13px;
		border: 1px dashed var(--border-color, #444);
		border-radius: 4px;
	}

	.items-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.item-row {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		padding: 6px;
		border: 1px solid var(--border-color, #333);
		border-radius: 4px;
		background: var(--bg-color, rgba(26, 26, 46, 0.5));
	}

	.item-depth-badge {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--bg-hover, #2a2a4e);
		color: var(--text-color, #e0e0e0);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		flex-shrink: 0;
		margin-top: 2px;
	}

	.item-controls {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.move-btn {
		width: 24px;
		height: 20px;
		border: 1px solid var(--border-color, #444);
		border-radius: 3px;
		background: var(--bg-color, #1a1a2e);
		color: var(--text-color, #e0e0e0);
		cursor: pointer;
		font-size: 11px;
		padding: 0;
	}

	.move-btn:hover {
		background: var(--bg-hover, #2a2a4e);
	}

	.item-fields {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.item-field-row {
		display: flex;
		gap: 4px;
	}

	.item-field-row select {
		flex: 1;
		padding: 2px 4px;
		font-size: 12px;
		border: 1px solid var(--border-color, #444);
		border-radius: 3px;
		background: var(--bg-color, #1a1a2e);
		color: var(--text-color, #e0e0e0);
	}

	.icon-input {
		width: 50px;
		padding: 2px 4px;
		font-size: 12px;
		text-align: center;
		border: 1px solid var(--border-color, #444);
		border-radius: 3px;
		background: var(--bg-color, #1a1a2e);
		color: var(--text-color, #e0e0e0);
	}

	.label-input {
		padding: 2px 4px;
		font-size: 12px;
		border: 1px solid var(--border-color, #444);
		border-radius: 3px;
		background: var(--bg-color, #1a1a2e);
		color: var(--text-color, #e0e0e0);
	}

	.item-actions {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex-shrink: 0;
	}

	.child-btn {
		width: 24px;
		height: 20px;
		border: 1px solid var(--border-color, #444);
		border-radius: 3px;
		background: var(--bg-color, #1a1a2e);
		color: var(--text-color, #e0e0e0);
		cursor: pointer;
		font-size: 11px;
		padding: 0;
	}

	.child-btn:hover {
		background: var(--bg-hover, #2a2a4e);
	}

	.remove-btn {
		width: 24px;
		height: 20px;
		border: 1px solid #c44;
		border-radius: 3px;
		background: rgba(200, 60, 60, 0.2);
		color: #f88;
		cursor: pointer;
		font-size: 11px;
		padding: 0;
	}

	.remove-btn:hover {
		background: rgba(200, 60, 60, 0.4);
	}

	.actions {
		margin-top: 8px;
	}

	.actions button {
		padding: 6px 12px;
		border: 1px solid var(--border-color, #444);
		border-radius: 4px;
		background: var(--bg-color, #1a1a2e);
		color: var(--text-color, #e0e0e0);
		cursor: pointer;
		font-size: 13px;
	}

	.actions button:hover {
		background: var(--bg-hover, #2a2a4e);
	}
</style>
