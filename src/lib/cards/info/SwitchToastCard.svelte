<script lang="ts">
	/**
	 * 切换提示卡片
	 * 从 InfoPanel 提取
	 */
	import * as Separator from '$lib/components/ui/separator';
	import * as Table from '$lib/components/ui/table';
	import * as Switch from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { showToast } from '$lib/utils/toast';

	let switchToastEnableBook = $state(false);
	let switchToastEnablePage = $state(false);
	let switchToastEnableAction = $state(false); // 按键操作提示
	let switchToastEnableBoundary = $state(true); // 边界提示（最后一页/第一页）
	let switchToastBookTitleTemplate = $state('');
	let switchToastBookDescriptionTemplate = $state('');
	let switchToastPageTitleTemplate = $state('');
	let switchToastPageDescriptionTemplate = $state('');
	let switchToastPositionX = $state(20);
	let switchToastPositionY = $state(20);
	let switchToastOpacity = $state(0.92);
	let switchToastLiquidGlass = $state(false);

	function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			return fallback;
		}
		return Math.min(max, Math.max(min, value));
	}

	function parseNumberInput(value: string, min: number, max: number, fallback: number): number {
		const parsed = Number(value);
		return clampNumber(parsed, min, max, fallback);
	}

	function loadSwitchToastFromSettings() {
		const s = settingsManager.getSettings();
		const base = s.view?.switchToast ?? {
			enableBook: s.view?.showBookSwitchToast ?? false,
			enablePage: false,
			enableAction: false,
			enableBoundaryToast: true,
			bookTitleTemplate:
				'已切换到 {{book.displayName}}（第 {{book.currentPageDisplay}} / {{book.totalPages}} 页）',
			bookDescriptionTemplate: '路径：{{book.path}}',
			pageTitleTemplate: '第 {{page.indexDisplay}} / {{book.totalPages}} 页',
			pageDescriptionTemplate: '{{page.dimensionsFormatted}}  {{page.sizeFormatted}}',
			positionX: 20,
			positionY: 20,
			opacity: 0.92,
			liquidGlass: false
		};
		switchToastEnableBook = base.enableBook;
		switchToastEnablePage = base.enablePage;
		switchToastEnableAction = (base as { enableAction?: boolean }).enableAction ?? false;
		switchToastEnableBoundary =
			(base as { enableBoundaryToast?: boolean }).enableBoundaryToast ?? true;
		switchToastBookTitleTemplate = base.bookTitleTemplate ?? '';
		switchToastBookDescriptionTemplate = base.bookDescriptionTemplate ?? '';
		switchToastPageTitleTemplate = base.pageTitleTemplate ?? '';
		switchToastPageDescriptionTemplate = base.pageDescriptionTemplate ?? '';
		switchToastPositionX = clampNumber(base.positionX, 0, 4096, 20);
		switchToastPositionY = clampNumber(base.positionY, 0, 4096, 20);
		switchToastOpacity = clampNumber(base.opacity, 0.1, 1, 0.92);
		switchToastLiquidGlass = base.liquidGlass ?? false;
	}

	$effect(() => {
		loadSwitchToastFromSettings();
	});

	function updateSwitchToast(partial: {
		enableBook?: boolean;
		enablePage?: boolean;
		enableAction?: boolean;
		enableBoundaryToast?: boolean;
		bookTitleTemplate?: string;
		bookDescriptionTemplate?: string;
		pageTitleTemplate?: string;
		pageDescriptionTemplate?: string;
		positionX?: number;
		positionY?: number;
		opacity?: number;
		liquidGlass?: boolean;
	}) {
		const current = settingsManager.getSettings();
		const prev = current.view?.switchToast ?? {
			enableBook: current.view?.showBookSwitchToast ?? false,
			enablePage: false,
			enableAction: false,
			enableBoundaryToast: true,
			positionX: 20,
			positionY: 20,
			opacity: 0.92,
			liquidGlass: false
		};
		const next = { ...prev, ...partial };
		switchToastEnableBook = next.enableBook ?? false;
		switchToastEnablePage = next.enablePage ?? false;
		switchToastEnableAction = (next as { enableAction?: boolean }).enableAction ?? false;
		switchToastEnableBoundary =
			(next as { enableBoundaryToast?: boolean }).enableBoundaryToast ?? true;
		switchToastBookTitleTemplate = next.bookTitleTemplate ?? '';
		switchToastBookDescriptionTemplate = next.bookDescriptionTemplate ?? '';
		switchToastPageTitleTemplate = next.pageTitleTemplate ?? '';
		switchToastPageDescriptionTemplate = next.pageDescriptionTemplate ?? '';
		switchToastPositionX = clampNumber(next.positionX, 0, 4096, 20);
		switchToastPositionY = clampNumber(next.positionY, 0, 4096, 20);
		switchToastOpacity = clampNumber(next.opacity, 0.1, 1, 0.92);
		switchToastLiquidGlass = next.liquidGlass ?? false;
		settingsManager.updateNestedSettings('view', {
			switchToast: next as typeof current.view.switchToast,
			showBookSwitchToast: next.enableBook
		});
	}

	function showTestSwitchToast() {
		showToast({
			title: '切换提示测试',
			description: `X ${switchToastPositionX}px / Y ${switchToastPositionY}px / 透明度 ${Math.round(switchToastOpacity * 100)}%`,
			variant: 'info',
			duration: 2600,
			scope: 'switch'
		});
	}
</script>

<div class="text-muted-foreground space-y-3 text-xs">
	<div class="space-y-2">
		<div class="flex items-center justify-between gap-2">
			<div>
				<div class="text-foreground text-[11px] font-semibold">提示悬浮窗</div>
				<div class="text-muted-foreground/60 text-[10px]">位置以窗口左上角为原点</div>
			</div>
			<Button variant="outline" size="sm" class="h-7 px-2 text-[10px]" onclick={showTestSwitchToast}>
				显示测试提示
			</Button>
		</div>
		<div class="grid grid-cols-2 gap-2">
			<label class="space-y-1">
				<span class="text-[10px]">X 轴</span>
				<input
					class="bg-background h-7 w-full rounded-md border px-2 text-[11px]"
					type="number"
					min="0"
					max="4096"
					value={switchToastPositionX}
					oninput={(e) =>
						updateSwitchToast({
							positionX: parseNumberInput((e.currentTarget as HTMLInputElement).value, 0, 4096, 20)
						})}
				/>
			</label>
			<label class="space-y-1">
				<span class="text-[10px]">Y 轴</span>
				<input
					class="bg-background h-7 w-full rounded-md border px-2 text-[11px]"
					type="number"
					min="0"
					max="4096"
					value={switchToastPositionY}
					oninput={(e) =>
						updateSwitchToast({
							positionY: parseNumberInput((e.currentTarget as HTMLInputElement).value, 0, 4096, 20)
						})}
				/>
			</label>
		</div>
		<label class="space-y-1">
			<div class="flex items-center justify-between">
				<span class="text-[10px]">透明度</span>
				<span class="font-mono text-[10px]">{Math.round(switchToastOpacity * 100)}%</span>
			</div>
			<input
				class="w-full accent-[var(--primary)]"
				type="range"
				min="0.1"
				max="1"
				step="0.01"
				value={switchToastOpacity}
				oninput={(e) =>
					updateSwitchToast({
						opacity: parseNumberInput((e.currentTarget as HTMLInputElement).value, 0.1, 1, 0.92)
					})}
			/>
		</label>
		<div class="flex items-center justify-between gap-2">
			<span>液态玻璃效果</span>
			<Switch.Root
				checked={switchToastLiquidGlass}
				onCheckedChange={(v) => updateSwitchToast({ liquidGlass: v })}
				class="scale-75"
			/>
		</div>
	</div>
	<Separator.Root class="my-1" />

	<div class="space-y-1">
		<div class="flex items-center justify-between gap-2">
			<span>切换书籍时显示提示</span>
			<Switch.Root
				checked={switchToastEnableBook}
				onCheckedChange={(v) => updateSwitchToast({ enableBook: v })}
				class="scale-75"
			/>
		</div>
	</div>
	<Separator.Root class="my-1" />
	<div class="space-y-1">
		<div class="flex items-center justify-between gap-2">
			<span>切换页面时显示提示</span>
			<Switch.Root
				checked={switchToastEnablePage}
				onCheckedChange={(v) => updateSwitchToast({ enablePage: v })}
				class="scale-75"
			/>
		</div>
	</div>
	<Separator.Root class="my-1" />
	<div class="space-y-1">
		<div class="flex items-center justify-between gap-2">
			<span>按键操作时显示提示</span>
			<Switch.Root
				checked={switchToastEnableAction}
				onCheckedChange={(v) => updateSwitchToast({ enableAction: v })}
				class="scale-75"
			/>
		</div>
		<div class="text-muted-foreground/60 text-[10px]">如"键盘: 下一页"、"滚轮: 放大"等</div>
	</div>
	<Separator.Root class="my-1" />
	<div class="space-y-1">
		<div class="flex items-center justify-between gap-2">
			<span>边界翻页时显示提示</span>
			<Switch.Root
				checked={switchToastEnableBoundary}
				onCheckedChange={(v) => updateSwitchToast({ enableBoundaryToast: v })}
				class="scale-75"
			/>
		</div>
		<div class="text-muted-foreground/60 text-[10px]">
			在最后一页继续后翻或第一页继续前翻时显示提示
		</div>
	</div>
	<Separator.Root class="my-1" />

	<!-- 书籍模板 -->
	<div class="space-y-2">
		<div class="text-foreground text-[11px] font-semibold">书籍提示模板</div>
		<textarea
			class="bg-background min-h-10 w-full rounded-md border px-2 py-1 font-mono text-[11px]"
			value={switchToastBookTitleTemplate}
			oninput={(e) => {
				const v = (e.currentTarget as HTMLTextAreaElement).value;
				updateSwitchToast({ bookTitleTemplate: v });
			}}
			placeholder={'例如：已切换到 {{book.emmTranslatedTitle}}'}
		></textarea>
		<textarea
			class="bg-background min-h-13 w-full rounded-md border px-2 py-1 font-mono text-[11px]"
			value={switchToastBookDescriptionTemplate}
			oninput={(e) => {
				const v = (e.currentTarget as HTMLTextAreaElement).value;
				updateSwitchToast({ bookDescriptionTemplate: v });
			}}
			placeholder={'例如：路径：{{book.path}}'}
		></textarea>

		<div class="bg-background/60 mt-1 overflow-hidden rounded-md border">
			<Table.Root class="w-full text-[11px]">
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-28 px-2 py-1">变量</Table.Head>
						<Table.Head class="px-2 py-1">说明</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					<Table.Row
						><Table.Cell class="px-2 py-1 font-mono">{'{{book.displayName}}'}</Table.Cell
						><Table.Cell class="px-2 py-1">书籍显示名</Table.Cell></Table.Row
					>
					<Table.Row
						><Table.Cell class="px-2 py-1 font-mono">{'{{book.currentPageDisplay}}'}</Table.Cell
						><Table.Cell class="px-2 py-1">当前页码</Table.Cell></Table.Row
					>
					<Table.Row
						><Table.Cell class="px-2 py-1 font-mono">{'{{book.totalPages}}'}</Table.Cell><Table.Cell
							class="px-2 py-1">总页数</Table.Cell
						></Table.Row
					>
					<Table.Row
						><Table.Cell class="px-2 py-1 font-mono">{'{{book.path}}'}</Table.Cell><Table.Cell
							class="px-2 py-1">书籍路径</Table.Cell
						></Table.Row
					>
				</Table.Body>
			</Table.Root>
		</div>
	</div>

	<!-- 页面模板 -->
	<div class="space-y-2">
		<div class="text-foreground text-[11px] font-semibold">页面提示模板</div>
		<textarea
			class="bg-background min-h-10 w-full rounded-md border px-2 py-1 font-mono text-[11px]"
			value={switchToastPageTitleTemplate}
			oninput={(e) => {
				const v = (e.currentTarget as HTMLTextAreaElement).value;
				updateSwitchToast({ pageTitleTemplate: v });
			}}
			placeholder={'例如：第 {{page.indexDisplay}} 页'}
		></textarea>
		<textarea
			class="bg-background min-h-13 w-full rounded-md border px-2 py-1 font-mono text-[11px]"
			value={switchToastPageDescriptionTemplate}
			oninput={(e) => {
				const v = (e.currentTarget as HTMLTextAreaElement).value;
				updateSwitchToast({ pageDescriptionTemplate: v });
			}}
			placeholder={'例如：{{page.dimensionsFormatted}}'}
		></textarea>

		<div class="bg-background/60 mt-1 overflow-hidden rounded-md border">
			<Table.Root class="w-full text-[11px]">
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-28 px-2 py-1">变量</Table.Head>
						<Table.Head class="px-2 py-1">说明</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					<Table.Row
						><Table.Cell class="px-2 py-1 font-mono">{'{{page.indexDisplay}}'}</Table.Cell
						><Table.Cell class="px-2 py-1">当前页码</Table.Cell></Table.Row
					>
					<Table.Row
						><Table.Cell class="px-2 py-1 font-mono">{'{{page.dimensionsFormatted}}'}</Table.Cell
						><Table.Cell class="px-2 py-1">分辨率</Table.Cell></Table.Row
					>
					<Table.Row
						><Table.Cell class="px-2 py-1 font-mono">{'{{page.sizeFormatted}}'}</Table.Cell
						><Table.Cell class="px-2 py-1">文件大小</Table.Cell></Table.Row
					>
					<Table.Row
						><Table.Cell class="px-2 py-1 font-mono">{'{{page.name}}'}</Table.Cell><Table.Cell
							class="px-2 py-1">页面文件名</Table.Cell
						></Table.Row
					>
				</Table.Body>
			</Table.Root>
		</div>
		<p class="text-muted-foreground mt-1 text-[10px]">
			页面模板同样可以使用 <span class="font-mono">{'{{book.*}}'}</span> 变量。
		</p>
	</div>
</div>
