<script lang="ts">
	/**
	 * 轮盘菜单设置面板
	 * 配置扇区数、层数、距离、每个 slot 绑定哪个 action
	 */

	import { radialMenuStore } from '$lib/stores/radialMenu';
	import { keyBindingsStore } from '$lib/stores/keybindings';
	import { createDefaultRadialMenu } from '$lib/stores/radialMenu/defaults';
	import type { SectorCount, LayerCount } from '$lib/stores/radialMenu';

	// 获取所有可用 action 列表
	const availableActions = $derived(
		keyBindingsStore.bindings.map(b => ({ action: b.action, name: b.name, category: b.category }))
	);

	// 按 category 分组
	const actionsByCategory = $derived(() => {
		const map = new Map<string, typeof availableActions>();
		for (const a of availableActions) {
			if (!map.has(a.category)) map.set(a.category, []);
			map.get(a.category)!.push(a);
		}
		return map;
	});

	// 生成所有 slot key（按层→扇区排序）
	const slotKeys = $derived.by(() => {
		const keys: string[] = [];
		for (let layer = 1; layer <= radialMenuStore.config.layers; layer++) {
			for (let sector = 0; sector < radialMenuStore.config.sectorCount; sector++) {
				keys.push(`${layer}:${sector}`);
			}
		}
		return keys;
	});

	// 扇区方向名称
	const sectorNames = ['右', '右下', '下', '左下', '左', '左上', '上', '右上', '右2', '右下2', '下2', '左下2'];

	function updateSectorCount(value: number) {
		const validValues: SectorCount[] = [4, 8, 12];
		const v = validValues.includes(value as SectorCount) ? (value as SectorCount) : 8;
		radialMenuStore.updateConfig({ sectorCount: v });
	}

	function updateLayers(value: number) {
		const validValues: LayerCount[] = [1, 2, 3];
		const v = validValues.includes(value as LayerCount) ? (value as LayerCount) : 3;
		radialMenuStore.updateConfig({ layers: v });
	}

	function updateSlot(key: string, action: string) {
		radialMenuStore.setSlot(key, action || null);
	}

	function resetToDefault() {
		radialMenuStore.config = createDefaultRadialMenu();
		radialMenuStore.saveToStorage();
	}
</script>

<div class="radial-settings">
	<h3>轮盘菜单设置</h3>

	<!-- 基本参数 -->
	<div class="settings-row">
		<label>扇区数</label>
		<select value={radialMenuStore.config.sectorCount} onchange={(e) => updateSectorCount(Number((e.target as HTMLSelectElement).value))}>
			<option value={4}>4</option>
			<option value={8}>8</option>
			<option value={12}>12</option>
		</select>
	</div>

	<div class="settings-row">
		<label>层数</label>
		<select value={radialMenuStore.config.layers} onchange={(e) => updateLayers(Number((e.target as HTMLSelectElement).value))}>
			<option value={1}>1</option>
			<option value={2}>2</option>
			<option value={3}>3</option>
		</select>
	</div>

	<div class="settings-row">
		<label>死区半径 (px)</label>
		<input type="number" min="16" max="100" value={radialMenuStore.config.deadZonePx}
			onchange={(e) => radialMenuStore.updateConfig({ deadZonePx: Number((e.target as HTMLInputElement).value) })} />
	</div>

	<div class="settings-row">
		<label>层间距 (px)</label>
		<input type="number" min="20" max="120" value={radialMenuStore.config.layerStepPx}
			onchange={(e) => radialMenuStore.updateConfig({ layerStepPx: Number((e.target as HTMLInputElement).value) })} />
	</div>

	<div class="settings-row">
		<label>键盘步进 (px)</label>
		<input type="number" min="20" max="120" value={radialMenuStore.config.keyboardStepPx}
			onchange={(e) => radialMenuStore.updateConfig({ keyboardStepPx: Number((e.target as HTMLInputElement).value) })} />
	</div>

	<div class="settings-row">
		<label>
			<input type="checkbox" checked={radialMenuStore.config.fallbackToInner}
				onchange={(e) => radialMenuStore.updateConfig({ fallbackToInner: (e.target as HTMLInputElement).checked })} />
			空槽位时向内层查找
		</label>
	</div>

	<!-- Slot 绑定 -->
	<div class="slots-section">
		<h4>槽位绑定</h4>
		<div class="slots-grid">
			{#each slotKeys as key (key)}
				<div class="slot-row">
					<span class="slot-label">
						L{key.split(':')[0]} · {sectorNames[Number(key.split(':')[1])] ?? key.split(':')[1]}
					</span>
					<select value={radialMenuStore.config.slots[key]?.action ?? ''} onchange={(e) => updateSlot(key, (e.target as HTMLSelectElement).value)}>
						<option value="">（无）</option>
						{#each [...actionsByCategory().entries()] as [category, actions] (category)}
							<optgroup label={category}>
								{#each actions as a (a.action)}
									<option value={a.action}>{a.name}</option>
								{/each}
							</optgroup>
						{/each}
					</select>
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
	.settings-row input[type="number"] {
		padding: 4px 8px;
		border: 1px solid var(--border-color, #444);
		border-radius: 4px;
		background: var(--bg-color, #1a1a2e);
		color: var(--text-color, #e0e0e0);
		font-size: 13px;
	}

	.slots-section h4 {
		margin: 8px 0;
		font-size: 14px;
	}

	.slots-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 6px;
	}

	.slot-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.slot-label {
		font-size: 11px;
		min-width: 60px;
		opacity: 0.7;
	}

	.slot-row select {
		flex: 1;
		padding: 2px 4px;
		font-size: 12px;
		border: 1px solid var(--border-color, #444);
		border-radius: 3px;
		background: var(--bg-color, #1a1a2e);
		color: var(--text-color, #e0e0e0);
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
