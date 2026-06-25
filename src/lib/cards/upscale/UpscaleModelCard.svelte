<script lang="ts">
	import { open } from '@tauri-apps/plugin-dialog';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import {
		DEFAULT_MANGA_JANAI_MODEL_DIR,
		GPU_OPTIONS,
		MODEL_LABELS,
		NOISE_LEVEL_OPTIONS,
		TILE_SIZE_OPTIONS,
		availableModels,
		gpuId,
		isPyO3Available,
		mangaJanaiModelDir,
		noiseLevel,
		saveSettings,
		scale,
		selectedModel,
		tileEnabled,
		tileSize
	} from '$lib/stores/upscale/upscalePanelStore.svelte';
	import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';

	let isRefreshingModels = $state(false);
	let modelDirError = $state('');

	function getModelLabel(modelName: string): string {
		return MODEL_LABELS[modelName] || modelName.replace(/^MODEL_/, '').replace(/_/g, ' ');
	}

	function getModelScale(modelName: string): number | null {
		if (modelName.includes('UP1X')) return 1;
		if (modelName.includes('UP2X') || modelName.includes('_X2') || modelName.startsWith('2x_'))
			return 2;
		if (modelName.includes('UP3X') || modelName.includes('_X3') || modelName.startsWith('3x_'))
			return 3;
		if (modelName.includes('UP4X') || modelName.includes('_X4') || modelName.startsWith('4x_'))
			return 4;
		return null;
	}

	async function refreshMangaJanaiModels() {
		modelDirError = '';
		isRefreshingModels = true;
		try {
			const modelDir = mangaJanaiModelDir.value.trim() || DEFAULT_MANGA_JANAI_MODEL_DIR;
			mangaJanaiModelDir.value = modelDir;
			saveSettings();
			await pyo3UpscaleManager.setMangaJanaiModelDir(modelDir);
			availableModels.value = pyo3UpscaleManager.getAvailableModels();
		} catch (error) {
			console.error('Failed to refresh MangaJaNai models', error);
			modelDirError = error instanceof Error ? error.message : String(error);
		} finally {
			isRefreshingModels = false;
		}
	}

	async function selectMangaJanaiModelDir() {
		const selected = await open({
			directory: true,
			multiple: false,
			defaultPath: mangaJanaiModelDir.value || DEFAULT_MANGA_JANAI_MODEL_DIR
		});

		const path = Array.isArray(selected) ? selected[0] : selected;
		if (!path) return;

		mangaJanaiModelDir.value = path;
		await refreshMangaJanaiModels();
	}

	function handleModelChange(value: string) {
		selectedModel.value = value;

		const nextScale = getModelScale(value);
		if (nextScale) {
			scale.value = nextScale;
		}

		saveSettings();
	}
</script>

<div class="space-y-3 text-xs">
	{#if !isPyO3Available.value}
		<div class="text-muted-foreground py-4 text-center">
			<p>超分功能不可用</p>
			<p class="mt-1 text-[10px]">请检查 sr_vulkan / PyO3 模块是否可用</p>
		</div>
	{:else}
		<div class="space-y-1">
			<Label class="text-xs">模型</Label>
			<select
				class="bg-muted h-7 w-full rounded border-0 px-2 text-xs"
				value={selectedModel.value}
				onchange={(e) => handleModelChange(e.currentTarget.value)}
			>
				{#each availableModels.value as model}
					<option value={model}>{getModelLabel(model)}</option>
				{/each}
			</select>
		</div>

		<div class="space-y-1">
			<div class="flex items-center justify-between gap-2">
				<Label class="text-muted-foreground text-[10px]">MangaJaNai 模型目录</Label>
				<Button
					variant="ghost"
					size="sm"
					class="h-6 px-2 text-[10px]"
					onclick={() => {
						mangaJanaiModelDir.value = DEFAULT_MANGA_JANAI_MODEL_DIR;
						void refreshMangaJanaiModels();
					}}
				>
					默认
				</Button>
			</div>
			<div class="flex gap-1">
				<input
					class="bg-muted h-7 min-w-0 flex-1 rounded border-0 px-2 text-[10px]"
					value={mangaJanaiModelDir.value}
					onchange={(e) => {
						mangaJanaiModelDir.value = e.currentTarget.value;
						saveSettings();
					}}
					onkeydown={(e) => {
						if (e.key === 'Enter') void refreshMangaJanaiModels();
					}}
				/>
				<Button
					variant="outline"
					size="icon"
					class="h-7 w-7"
					title="选择目录"
					onclick={selectMangaJanaiModelDir}
				>
					<FolderOpenIcon class="size-3.5" />
				</Button>
				<Button
					variant="outline"
					size="icon"
					class="h-7 w-7"
					title="刷新模型"
					loading={isRefreshingModels}
					onclick={refreshMangaJanaiModels}
				>
					<RefreshCwIcon class="size-3.5" />
				</Button>
			</div>
			{#if modelDirError}
				<p class="text-destructive text-[10px]">{modelDirError}</p>
			{/if}
		</div>

		<div class="grid grid-cols-2 gap-2">
			<div class="space-y-1">
				<Label class="text-muted-foreground text-[10px]">放大倍率</Label>
				<select
					class="bg-muted h-6 w-full rounded border-0 px-2 text-xs"
					value={scale.value}
					onchange={(e) => {
						scale.value = parseInt(e.currentTarget.value);
						saveSettings();
					}}
				>
					<option value={1}>1x</option>
					<option value={2}>2x</option>
					<option value={3}>3x</option>
					<option value={4}>4x</option>
				</select>
			</div>

			<div class="space-y-1">
				<div class="flex items-center justify-between gap-2">
					<Label class="text-muted-foreground text-[10px]">Tile Size</Label>
					<label class="text-muted-foreground flex items-center gap-1 text-[10px]">
						<Switch
							checked={tileEnabled.value}
							onclick={() => {
								tileEnabled.value = !tileEnabled.value;
								saveSettings();
							}}
						/>
						<span>{tileEnabled.value ? 'On' : 'Off'}</span>
					</label>
				</div>
				<select
					class="bg-muted h-6 w-full rounded border-0 px-2 text-xs"
					value={tileSize.value}
					disabled={!tileEnabled.value}
					onchange={(e) => {
						tileSize.value = parseInt(e.currentTarget.value);
						saveSettings();
					}}
				>
					{#each TILE_SIZE_OPTIONS as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>

			<div class="space-y-1">
				<Label class="text-muted-foreground text-[10px]">降噪等级</Label>
				<select
					class="bg-muted h-6 w-full rounded border-0 px-2 text-xs"
					value={noiseLevel.value}
					onchange={(e) => {
						noiseLevel.value = parseInt(e.currentTarget.value);
						saveSettings();
					}}
				>
					{#each NOISE_LEVEL_OPTIONS as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>

			<div class="space-y-1">
				<Label class="text-muted-foreground text-[10px]">GPU</Label>
				<select
					class="bg-muted h-6 w-full rounded border-0 px-2 text-xs"
					value={gpuId.value}
					onchange={(e) => {
						gpuId.value = parseInt(e.currentTarget.value);
						saveSettings();
					}}
				>
					{#each GPU_OPTIONS as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="text-muted-foreground border-t pt-2 text-[10px]">
			<p>当前: {getModelLabel(selectedModel.value)} @ {scale.value}x</p>
		</div>
	{/if}
</div>
