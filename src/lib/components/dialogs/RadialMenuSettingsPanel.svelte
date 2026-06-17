<script lang="ts">
	/**
	 * 轮盘菜单设置面板
	 * 配置 ray-menu 视觉参数和菜单项列表
	 */

	import { radialMenuStore } from '$lib/stores/radialMenu';
	import { keyBindingsStore } from '$lib/stores/keybindings';
	import { createDefaultRadialMenu } from '$lib/stores/radialMenu/defaults';

	// 获取所有可用 action 列表
	const availableActions = $derived(
		keyBindingsStore.bindings.map((b) => ({
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

	function addItem() {
		const newId = `action_${Date.now()}`;
		radialMenuStore.addItem({ id: newId, label: '新项目' });
	}

	function updateItemId(index: number, action: string) {
		const item = radialMenuStore.config.items[index];
		if (item) {
			radialMenuStore.updateItem(item.id, {
				id: action,
				label: getActionName(action)
			});
		}
	}

	function updateItemLabel(index: number, label: string) {
		const item = radialMenuStore.config.items[index];
		if (item) {
			radialMenuStore.updateItem(item.id, { label });
		}
	}

	function updateItemIcon(index: number, icon: string) {
		const item = radialMenuStore.config.items[index];
		if (item) {
			radialMenuStore.updateItem(item.id, { icon: icon || undefined });
		}
	}

	function removeItem(index: number) {
		const item = radialMenuStore.config.items[index];
		if (item) {
			radialMenuStore.removeItem(item.id);
		}
	}

	function moveItem(index: number, direction: 'up' | 'down') {
		const item = radialMenuStore.config.items[index];
		if (item) {
			radialMenuStore.moveItem(item.id, direction);
		}
	}

	function resetToDefault() {
		radialMenuStore.config = createDefaultRadialMenu();
		radialMenuStore.saveToStorage();
	}
</script>

<div class="radial-settings">
	<h3>轮盘菜单设置</h3>

	<!-- 视觉参数 -->
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
			<h4>菜单项 ({radialMenuStore.config.items.length})</h4>
			<button class="add-btn" onclick={addItem}>＋ 添加</button>
		</div>

		<div class="items-list">
			{#each radialMenuStore.config.items as item, index (item.id + index)}
				<div class="item-row">
					<div class="item-controls">
						<button
							class="move-btn"
							disabled={index === 0}
							onclick={() => moveItem(index, 'up')}
							title="上移">↑</button
						>
						<button
							class="move-btn"
							disabled={index === radialMenuStore.config.items.length - 1}
							onclick={() => moveItem(index, 'down')}
							title="下移">↓</button
						>
					</div>

					<div class="item-fields">
						<div class="item-field-row">
							<select
								value={item.id}
								onchange={(e) => updateItemId(index, (e.target as HTMLSelectElement).value)}
							>
								<option value={item.id}>{item.id}（当前）</option>
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
								value={item.icon ?? ''}
								onchange={(e) => updateItemIcon(index, (e.target as HTMLInputElement).value)}
								class="icon-input"
							/>
						</div>
						<input
							type="text"
							placeholder="显示标签"
							value={item.label}
							onchange={(e) => updateItemLabel(index, (e.target as HTMLInputElement).value)}
							class="label-input"
						/>
					</div>

					<button class="remove-btn" onclick={() => removeItem(index)} title="删除">✕</button>
				</div>
			{/each}
		</div>
	</div>

	<div class="actions">
		<button onclick={resetToDefault}>恢复默认</button>
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
	}

	.add-btn:hover {
		background: var(--bg-hover, #2a2a4e);
	}

	.items-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
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

	.move-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.move-btn:not(:disabled):hover {
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

	.remove-btn {
		width: 24px;
		height: 24px;
		border: 1px solid #c44;
		border-radius: 3px;
		background: rgba(200, 60, 60, 0.2);
		color: #f88;
		cursor: pointer;
		font-size: 11px;
		padding: 0;
		flex-shrink: 0;
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
