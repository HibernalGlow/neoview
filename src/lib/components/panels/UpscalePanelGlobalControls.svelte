<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';

	let {
		autoUpscaleEnabled = false,
		preUpscaleEnabled = true,
		conditionalUpscaleEnabled = false,
		conditionalMinWidth = 0,
		conditionalMinHeight = 0,
		currentImageUpscaleEnabled = false,
		useCachedFirst = true
	} = $props();

	// 创建响应式状态
	let autoUpscaleEnabledState = $state(autoUpscaleEnabled);
	let preUpscaleEnabledState = $state(preUpscaleEnabled);
	let conditionalUpscaleEnabledState = $state(conditionalUpscaleEnabled);
	let conditionalMinWidthState = $state(conditionalMinWidth);
	let conditionalMinHeightState = $state(conditionalMinHeight);
	let currentImageUpscaleEnabledState = $state(currentImageUpscaleEnabled);
	let useCachedFirstState = $state(useCachedFirst);

	// 监听变化并通知父组件
	$effect(() => {
		autoUpscaleEnabled = autoUpscaleEnabledState;
	});
	
	$effect(() => {
		preUpscaleEnabled = preUpscaleEnabledState;
	});
	
	$effect(() => {
		conditionalUpscaleEnabled = conditionalUpscaleEnabledState;
	});
	
	$effect(() => {
		conditionalMinWidth = conditionalMinWidthState;
	});
	
	$effect(() => {
		conditionalMinHeight = conditionalMinHeightState;
	});
	
	$effect(() => {
		currentImageUpscaleEnabled = currentImageUpscaleEnabledState;
	});
	
	$effect(() => {
		useCachedFirst = useCachedFirstState;
	});
</script>

<div class="section">
	<div class="setting-row">
		<div class="flex items-center gap-2">
			<Switch bind:checked={autoUpscaleEnabledState} />
			<Label>自动超分</Label>
		</div>
	</div>

	<div class="setting-row">
		<div class="flex items-center gap-2">
			<Switch bind:checked={preUpscaleEnabledState} />
			<Label>开启预超分</Label>
		</div>
	</div>

	<div class="setting-row items-start">
		<div class="flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<Switch bind:checked={conditionalUpscaleEnabledState} />
				<Label>满足条件才自动超分</Label>
			</div>
			<div class="flex gap-4 pl-6 text-sm text-gray-500">
				<label class="flex items-center gap-2">
					<span>最小宽度</span>
					<input
						type="number"
						class="input-number w-24"
						min="0"
						bind:value={conditionalMinWidthState}
						disabled={!conditionalUpscaleEnabledState}
					/>
					x
				</label>
				<label class="flex items-center gap-2">
					<span>最小高度</span>
					<input
						type="number"
						class="input-number w-24"
						min="0"
						bind:value={conditionalMinHeightState}
						disabled={!conditionalUpscaleEnabledState}
					/>
					x
				</label>
			</div>
		</div>
	</div>

	<div class="setting-row">
		<div class="flex items-center gap-2">
			<Switch bind:checked={currentImageUpscaleEnabledState} />
			<Label>本张图开启 Waifu2x (F2)</Label>
		</div>
	</div>

	<div class="setting-row">
		<div class="flex items-center gap-2">
			<Switch bind:checked={useCachedFirstState} />
			<Label>优先使用下载转换好的</Label>
		</div>
	</div>
</div>
