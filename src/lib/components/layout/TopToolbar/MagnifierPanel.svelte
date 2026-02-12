<script lang="ts">
	/**
	 * MagnifierPanel - 放大镜设置面板
	 * 包含缩放倍率和镜片大小设置
	 */
	import { Button } from '$lib/components/ui/button';
	import * as Separator from '$lib/components/ui/separator';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Slider } from '$lib/components/ui/slider';
	import { ScanSearch, Plus, Minus } from '@lucide/svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { appState, type StateSelector } from '$lib/core/state/appState';
	import { readable } from 'svelte/store';

	// Props
	interface Props {
		expanded: boolean;
	}
	let { expanded }: Props = $props();

	// 设置状态
	let settings = $state(settingsManager.getSettings());
	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	// Get persistent settings
	let zoom = $derived(settings.view.magnifier?.zoom ?? 2.0);
	let size = $derived(settings.view.magnifier?.size ?? 200);

	// 更新放大镜设置
	function updateMagnifierSettings(changes: Partial<{ zoom: number; size: number }>) {
        settingsManager.updateNestedSettings('view', {
            magnifier: {
                ...settings.view.magnifier,
                ...changes
            }
        });
	}

	function handleZoomChange(value: number[]) {
		updateMagnifierSettings({ zoom: value[0] });
	}

	function handleSizeChange(value: number[]) {
		updateMagnifierSettings({ size: value[0] });
	}
</script>

{#if expanded}
	<div class="flex flex-wrap items-center justify-center gap-1 border-t border-border/50 pt-1">
		<span class="text-muted-foreground mr-2 text-xs flex items-center gap-1">
            <ScanSearch class="h-3 w-3" />
            放大倍率
        </span>
		<div class="bg-muted/60 inline-flex items-center gap-2 rounded-full px-3 py-1 shadow-inner min-w-[150px]">
            <span class="text-xs w-8 text-right">{zoom.toFixed(1)}x</span>
            <Slider
                value={[zoom]}
                min={1.0}
                max={5.0}
                step={0.1}
                class="w-24"
                onValueChange={handleZoomChange}
            />
		</div>

		<Separator.Root orientation="vertical" class="mx-2 h-5" />

		<span class="text-muted-foreground mr-2 text-xs">镜片大小</span>
		<div class="bg-muted/60 inline-flex items-center gap-2 rounded-full px-3 py-1 shadow-inner min-w-[150px]">
             <span class="text-xs w-8 text-right">{size}px</span>
             <Slider
                value={[size]}
                min={100}
                max={500}
                step={10}
                class="w-24"
                onValueChange={handleSizeChange}
            />
		</div>
	</div>
{/if}
