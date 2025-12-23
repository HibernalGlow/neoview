<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	let {
		autoUpscaleEnabled = $bindable(false),
		preUpscaleEnabled = $bindable(true),
		conditionalUpscaleEnabled = $bindable(false),
		conditionalMinWidth = $bindable(0),
		conditionalMinHeight = $bindable(0),
		currentImageUpscaleEnabled = $bindable(false),
		preloadPages = $bindable(3),
		backgroundConcurrency = $bindable(2)
	} = $props();

	// 处理开关变化
	function handleSettingChange() {
		dispatch('change');
	}
</script>

<div class="space-y-2">
	<div class="setting-row">
		<div class="flex items-center gap-2">
			<Switch 
				bind:checked={autoUpscaleEnabled} 
				onchange={handleSettingChange} 
			/>
			<Label>自动超分</Label>
		</div>
	</div>

	<div class="setting-row items-start">
		<div class="flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<Switch 
					bind:checked={preUpscaleEnabled} 
					onchange={handleSettingChange} 
				/>
				<Label>开启预超分</Label>
			</div>
			<div class="flex gap-4 pl-6 text-sm text-gray-500">
				<label class="flex items-center gap-2">
					<span>预超分页数</span>
					<input
						type="number"
						class="input-number w-20"
						min="0"
						max="10"
						bind:value={preloadPages}
						onchange={handleSettingChange}
						disabled={!preUpscaleEnabled}
					/>
				</label>
				<label class="flex items-center gap-2">
					<span>并发数</span>
					<input
						type="number"
						class="input-number w-20"
						min="1"
						max="4"
						bind:value={backgroundConcurrency}
						onchange={handleSettingChange}
						disabled={!preUpscaleEnabled}
					/>
				</label>
			</div>
		</div>
	</div>

	<div class="setting-row items-start">
		<div class="flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<Switch 
					bind:checked={conditionalUpscaleEnabled} 
					onchange={handleSettingChange} 
				/>
				<Label>满足条件才自动超分</Label>
			</div>
			<div class="flex gap-4 pl-6 text-sm text-gray-500">
				<label class="flex items-center gap-2">
					<span>最小宽度</span>
					<input
						type="number"
						class="input-number w-24"
						min="0"
						bind:value={conditionalMinWidth}
						onchange={handleSettingChange}
						disabled={!conditionalUpscaleEnabled}
					/>
					x
				</label>
				<label class="flex items-center gap-2">
					<span>最小高度</span>
					<input
						type="number"
						class="input-number w-24"
						min="0"
						bind:value={conditionalMinHeight}
						onchange={handleSettingChange}
						disabled={!conditionalUpscaleEnabled}
					/>
					x
				</label>
			</div>
		</div>
	</div>

	<div class="setting-row">
		<div class="flex items-center gap-2">
			<Switch 
				bind:checked={currentImageUpscaleEnabled} 
				onchange={handleSettingChange} 
			/>
			<Label>切换当前图原图/缓存</Label>
		</div>
	</div>
</div>
