<script lang="ts">
	/**
	 * ZoomPanel - 缩放模式面板
	 * 包含缩放模式选择、页面布局设置、宽页拉伸模式
	 */
	import { Button } from '$lib/components/ui/button';
	import * as Separator from '$lib/components/ui/separator';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import {
		Maximize,
		Expand,
		StretchHorizontal,
		StretchVertical,
		Frame,
		AlignLeft,
		AlignRight,
		SplitSquareHorizontal,
		Rows2,
		SquareChevronLeft,
		SquareChevronRight,
		Equal,
		AlignVerticalSpaceAround,
		AlignHorizontalSpaceAround
	} from '@lucide/svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import type { ZoomMode, WidePageStretch } from '$lib/settings/settingsManager';
	import { appState, type StateSelector } from '$lib/core/state/appState';
	import { readable } from 'svelte/store';
	import { toggleZoomModeLock, requestZoomMode } from '$lib/stores';

	// Props
	interface Props {
		expanded: boolean;
	}
	let { expanded }: Props = $props();

	// 创建 appState store
	function createAppStateStore<T>(selector: StateSelector<T>) {
		const initial = selector(appState.getSnapshot());
		return readable(initial, (set) => appState.subscribe(selector, (value) => set(value)));
	}

	const viewerState = createAppStateStore((state) => state.viewer);

	// 设置状态
	let settings = $state(settingsManager.getSettings());
	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	// 派生状态
	let defaultZoomMode: ZoomMode = $derived(settings.view.defaultZoomMode);
	let currentZoomDisplayMode: ZoomMode = $derived(
		$viewerState.lockedZoomMode ?? $viewerState.currentZoomMode ?? defaultZoomMode
	);
	let splitHorizontalPages = $derived(settings.view.pageLayout?.splitHorizontalPages ?? false);
	let treatHorizontalAsDoublePage = $derived(
		settings.view.pageLayout?.treatHorizontalAsDoublePage ?? false
	);
	let singleFirstPageMode = $derived(settings.view.pageLayout?.singleFirstPageMode ?? 'restoreOrDefault');
	let singleLastPageMode = $derived(settings.view.pageLayout?.singleLastPageMode ?? 'restoreOrDefault');
	let singleFirstPage = $derived(singleFirstPageMode !== 'continue');
	let singleLastPage = $derived(singleLastPageMode === 'continue');
	let widePageStretch = $derived(settings.view.pageLayout?.widePageStretch ?? 'uniformHeight');

	// 缩放模式选项
	const zoomModeOptions: { mode: ZoomMode; label: string }[] = [
		{ mode: 'fit', label: '适应窗口' },
		{ mode: 'fill', label: '铺满整个窗口' },
		{ mode: 'fitWidth', label: '适应宽度' },
		{ mode: 'fitHeight', label: '适应高度' },
		{ mode: 'original', label: '原始大小' },
		{ mode: 'fitLeftAlign', label: '居左适应窗口' },
		{ mode: 'fitRightAlign', label: '居右适应窗口' }
	];

	// 缩放模式图标映射
	const zoomModeIconMap = {
		fit: Maximize,
		fill: Expand,
		fitWidth: StretchHorizontal,
		fitHeight: StretchVertical,
		original: Frame,
		fitLeftAlign: AlignLeft,
		fitRightAlign: AlignRight
	} as const satisfies Record<ZoomMode, typeof Maximize>;

	function getZoomModeIcon(mode: ZoomMode) {
		return zoomModeIconMap[mode] ?? Frame;
	}

	function handleZoomModeChange(mode: ZoomMode) {
		const applied = requestZoomMode(mode);
		if (!applied) return;
		if (settings.view.defaultZoomMode === mode) return;
		settingsManager.updateNestedSettings('view', { defaultZoomMode: mode });
	}

	function toggleSplitHorizontalPages() {
		settingsManager.updateNestedSettings('view', {
			pageLayout: {
				...settings.view.pageLayout,
				splitHorizontalPages: !splitHorizontalPages
			}
		});
	}

	function toggleTreatHorizontalAsDoublePage() {
		settingsManager.updateNestedSettings('view', {
			pageLayout: {
				...settings.view.pageLayout,
				treatHorizontalAsDoublePage: !treatHorizontalAsDoublePage
			}
		});
	}

	function toggleSingleFirstPage() {
		const newMode = singleFirstPage ? 'continue' : 'default';
		settingsManager.updateNestedSettings('view', {
			pageLayout: {
				...settings.view.pageLayout,
				singleFirstPageMode: newMode
			}
		});
	}

	function toggleSingleLastPage() {
		const newMode = singleLastPage ? 'default' : 'continue';
		settingsManager.updateNestedSettings('view', {
			pageLayout: {
				...settings.view.pageLayout,
				singleLastPageMode: newMode
			}
		});
	}

	function setWidePageStretch(mode: WidePageStretch) {
		settingsManager.updateNestedSettings('view', {
			pageLayout: {
				...settings.view.pageLayout,
				widePageStretch: mode
			}
		});
	}
</script>

{#if expanded}
	<div class="flex flex-wrap items-center justify-center gap-1 border-t border-border/50 pt-1">
		<span class="text-muted-foreground mr-2 text-xs">缩放模式</span>
		<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
			{#each zoomModeOptions as { mode, label }}
				{@const ZoomIcon = getZoomModeIcon(mode)}
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={currentZoomDisplayMode === mode ? 'default' : 'ghost'}
							size="icon"
							class={`h-7 w-7 rounded-full ${$viewerState.lockedZoomMode === mode ? 'ring-primary ring-2' : ''}`}
							onclick={() => handleZoomModeChange(mode)}
						>
							<ZoomIcon class="h-3.5 w-3.5" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>{label}{$viewerState.lockedZoomMode === mode ? '（锁定）' : ''}</p>
					</Tooltip.Content>
				</Tooltip.Root>
			{/each}
		</div>

		<Separator.Root orientation="vertical" class="mx-2 h-5" />

		<span class="text-muted-foreground mr-2 text-xs">页面布局</span>
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={splitHorizontalPages ? 'default' : 'ghost'}
					size="icon"
					class="h-7 w-7"
					onclick={toggleSplitHorizontalPages}
				>
					<SplitSquareHorizontal class="h-3.5 w-3.5" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>自动分割横向页{splitHorizontalPages ? '（开）' : '（关）'}</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={treatHorizontalAsDoublePage ? 'default' : 'ghost'}
					size="icon"
					class="h-7 w-7"
					onclick={toggleTreatHorizontalAsDoublePage}
				>
					<Rows2 class="h-3.5 w-3.5" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>横向页视为双页{treatHorizontalAsDoublePage ? '（开）' : '（关）'}</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Separator.Root orientation="vertical" class="mx-2 h-5" />

		<span class="text-muted-foreground mr-2 text-xs">双页独立</span>
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={singleFirstPage ? 'default' : 'ghost'}
					size="icon"
					class="h-7 w-7"
					onclick={toggleSingleFirstPage}
				>
					<SquareChevronLeft class="h-3.5 w-3.5" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>首页独立显示{singleFirstPage ? '（开）' : '（关）'}</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={singleLastPage ? 'default' : 'ghost'}
					size="icon"
					class="h-7 w-7"
					onclick={toggleSingleLastPage}
				>
					<SquareChevronRight class="h-3.5 w-3.5" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>尾页独立显示{singleLastPage ? '（开）' : '（关）'}</p>
			</Tooltip.Content>
		</Tooltip.Root>

		<Separator.Root orientation="vertical" class="mx-2 h-5" />

		<span class="text-muted-foreground mr-2 text-xs">宽页拉伸</span>
		<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button
						variant={widePageStretch === 'none' ? 'default' : 'ghost'}
						size="icon"
						class="h-7 w-7 rounded-full"
						onclick={() => setWidePageStretch('none')}
					>
						<Equal class="h-3.5 w-3.5" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>无对齐（保持原始比例）</p>
				</Tooltip.Content>
			</Tooltip.Root>

			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button
						variant={widePageStretch === 'uniformHeight' ? 'default' : 'ghost'}
						size="icon"
						class="h-7 w-7 rounded-full"
						onclick={() => setWidePageStretch('uniformHeight')}
					>
						<AlignVerticalSpaceAround class="h-3.5 w-3.5" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>高度对齐（双页高度统一）</p>
				</Tooltip.Content>
			</Tooltip.Root>

			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button
						variant={widePageStretch === 'uniformWidth' ? 'default' : 'ghost'}
						size="icon"
						class="h-7 w-7 rounded-full"
						onclick={() => setWidePageStretch('uniformWidth')}
					>
						<AlignHorizontalSpaceAround class="h-3.5 w-3.5" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>宽度对齐（双页宽度统一）</p>
				</Tooltip.Content>
			</Tooltip.Root>
		</div>
	</div>
{/if}
