<script lang="ts">
	/**
	 * RotatePanel - 旋转设置面板
	 * 包含手动旋转和自动旋转模式设置
	 */
	import { Button } from '$lib/components/ui/button';
	import * as Separator from '$lib/components/ui/separator';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { RotateCw, RotateCcw, Ban, Smartphone } from '@lucide/svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { rotateClockwise } from '$lib/stores';

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

	// 派生状态
	let autoRotateMode = $derived(settings.view.autoRotate?.mode ?? 'none');

	// 设置自动旋转模式
	function setAutoRotateMode(mode: 'none' | 'left' | 'right' | 'horizontalLeft' | 'horizontalRight' | 'forcedLeft' | 'forcedRight') {
		settingsManager.updateNestedSettings('view', { autoRotate: { mode } });
	}
</script>

{#if expanded}
	<div class="flex flex-wrap items-center justify-center gap-1 border-t border-border/50 pt-1">
		<span class="text-muted-foreground mr-2 text-xs">手动旋转</span>
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button variant="ghost" size="icon" class="h-7 w-7" onclick={rotateClockwise}>
					<RotateCw class="h-3.5 w-3.5" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>顺时针旋转 90°</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Separator.Root orientation="vertical" class="mx-2 h-5" />

		<span class="text-muted-foreground mr-2 text-xs">自动旋转</span>
		<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button
						variant={autoRotateMode === 'none' ? 'default' : 'ghost'}
						size="icon"
						class="h-7 w-7 rounded-full"
						onclick={() => setAutoRotateMode('none')}
					>
						<Ban class="h-3.5 w-3.5" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content><p>关闭自动旋转</p></Tooltip.Content>
			</Tooltip.Root>

			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button
						variant={autoRotateMode === 'left' ? 'default' : 'ghost'}
						size="icon"
						class="h-7 w-7 rounded-full"
						onclick={() => setAutoRotateMode('left')}
					>
						<RotateCcw class="h-3.5 w-3.5" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content><p>纵向左旋</p></Tooltip.Content>
			</Tooltip.Root>

			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button
						variant={autoRotateMode === 'right' ? 'default' : 'ghost'}
						size="icon"
						class="h-7 w-7 rounded-full"
						onclick={() => setAutoRotateMode('right')}
					>
						<RotateCw class="h-3.5 w-3.5" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content><p>纵向右旋</p></Tooltip.Content>
			</Tooltip.Root>
		</div>

		<Separator.Root orientation="vertical" class="mx-2 h-5" />

		<span class="text-muted-foreground mr-2 text-xs">横屏</span>
		<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button
						variant={autoRotateMode === 'horizontalLeft' ? 'default' : 'ghost'}
						size="icon"
						class="h-7 w-7 rounded-full"
						onclick={() => setAutoRotateMode('horizontalLeft')}
					>
						<Smartphone class="h-3.5 w-3.5 -rotate-90" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content><p>横屏左旋 90°</p></Tooltip.Content>
			</Tooltip.Root>

			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button
						variant={autoRotateMode === 'horizontalRight' ? 'default' : 'ghost'}
						size="icon"
						class="h-7 w-7 rounded-full"
						onclick={() => setAutoRotateMode('horizontalRight')}
					>
						<Smartphone class="h-3.5 w-3.5 rotate-90" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content><p>横屏右旋 90°</p></Tooltip.Content>
			</Tooltip.Root>
		</div>

		<Separator.Root orientation="vertical" class="mx-2 h-5" />

		<span class="text-muted-foreground mr-2 text-xs">强制</span>
		<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button
						variant={autoRotateMode === 'forcedLeft' ? 'default' : 'ghost'}
						size="icon"
						class="h-7 w-7 rounded-full"
						onclick={() => setAutoRotateMode('forcedLeft')}
					>
						<RotateCcw class="h-3.5 w-3.5" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content><p>始终左旋 90°</p></Tooltip.Content>
			</Tooltip.Root>

			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button
						variant={autoRotateMode === 'forcedRight' ? 'default' : 'ghost'}
						size="icon"
						class="h-7 w-7 rounded-full"
						onclick={() => setAutoRotateMode('forcedRight')}
					>
						<RotateCw class="h-3.5 w-3.5" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content><p>始终右旋 90°</p></Tooltip.Content>
			</Tooltip.Root>
		</div>
	</div>
{/if}
