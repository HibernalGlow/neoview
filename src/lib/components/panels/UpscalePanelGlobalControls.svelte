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
</script>

<div class="section">
	<div class="setting-row">
		<div class="flex items-center gap-2">
			<Switch bind:checked={autoUpscaleEnabled} />
			<Label>自动超分</Label>
		</div>
	</div>

	<div class="setting-row">
		<div class="flex items-center gap-2">
			<Switch bind:checked={preUpscaleEnabled} />
			<Label>开启预超分</Label>
		</div>
	</div>

	<div class="setting-row items-start">
		<div class="flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<Switch bind:checked={conditionalUpscaleEnabled} />
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
						disabled={!conditionalUpscaleEnabled}
					/>
					x
				</label>
			</div>
		</div>
	</div>

	<div class="setting-row">
		<div class="flex items-center gap-2">
			<Switch bind:checked={currentImageUpscaleEnabled} />
			<Label>本张图开启 Waifu2x (F2)</Label>
		</div>
	</div>

	<div class="setting-row">
		<div class="flex items-center gap-2">
			<Switch bind:checked={useCachedFirst} />
			<Label>优先使用下载转换好的</Label>
		</div>
	</div>
</div>
