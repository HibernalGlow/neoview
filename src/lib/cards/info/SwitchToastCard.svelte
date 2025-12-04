<script lang="ts">
/**
 * 切换提示卡片
 * 从 InfoPanel 提取
 */
import * as Separator from '$lib/components/ui/separator';
import * as Table from '$lib/components/ui/table';
import * as Switch from '$lib/components/ui/switch';
import { settingsManager } from '$lib/settings/settingsManager';

let switchToastEnableBook = $state(false);
let switchToastEnablePage = $state(false);
let switchToastBookTitleTemplate = $state('');
let switchToastBookDescriptionTemplate = $state('');
let switchToastPageTitleTemplate = $state('');
let switchToastPageDescriptionTemplate = $state('');

function loadSwitchToastFromSettings() {
	const s = settingsManager.getSettings();
	const base = s.view?.switchToast ?? {
		enableBook: s.view?.showBookSwitchToast ?? false,
		enablePage: false,
		bookTitleTemplate: '已切换到 {{book.displayName}}（第 {{book.currentPageDisplay}} / {{book.totalPages}} 页）',
		bookDescriptionTemplate: '路径：{{book.path}}',
		pageTitleTemplate: '第 {{page.indexDisplay}} / {{book.totalPages}} 页',
		pageDescriptionTemplate: '{{page.dimensionsFormatted}}  {{page.sizeFormatted}}'
	};
	switchToastEnableBook = base.enableBook;
	switchToastEnablePage = base.enablePage;
	switchToastBookTitleTemplate = base.bookTitleTemplate ?? '';
	switchToastBookDescriptionTemplate = base.bookDescriptionTemplate ?? '';
	switchToastPageTitleTemplate = base.pageTitleTemplate ?? '';
	switchToastPageDescriptionTemplate = base.pageDescriptionTemplate ?? '';
}

$effect(() => {
	loadSwitchToastFromSettings();
});

function updateSwitchToast(partial: {
	enableBook?: boolean;
	enablePage?: boolean;
	bookTitleTemplate?: string;
	bookDescriptionTemplate?: string;
	pageTitleTemplate?: string;
	pageDescriptionTemplate?: string;
}) {
	const current = settingsManager.getSettings();
	const prev = current.view?.switchToast ?? {
		enableBook: current.view?.showBookSwitchToast ?? false,
		enablePage: false
	};
	const next = { ...prev, ...partial };
	switchToastEnableBook = next.enableBook ?? false;
	switchToastEnablePage = next.enablePage ?? false;
	switchToastBookTitleTemplate = next.bookTitleTemplate ?? '';
	switchToastBookDescriptionTemplate = next.bookDescriptionTemplate ?? '';
	switchToastPageTitleTemplate = next.pageTitleTemplate ?? '';
	switchToastPageDescriptionTemplate = next.pageDescriptionTemplate ?? '';
	settingsManager.updateNestedSettings('view', {
		switchToast: next,
		showBookSwitchToast: next.enableBook
	});
}
</script>

<div class="space-y-3 text-xs text-muted-foreground">
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

	<!-- 书籍模板 -->
	<div class="space-y-2">
		<div class="text-[11px] font-semibold text-foreground">书籍提示模板</div>
		<textarea
			class="w-full min-h-10 rounded-md border bg-background px-2 py-1 text-[11px] font-mono"
			value={switchToastBookTitleTemplate}
			oninput={(e) => {
				const v = (e.currentTarget as HTMLTextAreaElement).value;
				updateSwitchToast({ bookTitleTemplate: v });
			}}
			placeholder={'例如：已切换到 {{book.emmTranslatedTitle}}'}
		></textarea>
		<textarea
			class="w-full min-h-13 rounded-md border bg-background px-2 py-1 text-[11px] font-mono"
			value={switchToastBookDescriptionTemplate}
			oninput={(e) => {
				const v = (e.currentTarget as HTMLTextAreaElement).value;
				updateSwitchToast({ bookDescriptionTemplate: v });
			}}
			placeholder={'例如：路径：{{book.path}}'}
		></textarea>

		<div class="mt-1 rounded-md border bg-background/60 overflow-hidden">
			<Table.Root class="w-full text-[11px]">
				<Table.Header>
					<Table.Row>
						<Table.Head class="px-2 py-1 w-28">变量</Table.Head>
						<Table.Head class="px-2 py-1">说明</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					<Table.Row><Table.Cell class="px-2 py-1 font-mono">{'{{book.displayName}}'}</Table.Cell><Table.Cell class="px-2 py-1">书籍显示名</Table.Cell></Table.Row>
					<Table.Row><Table.Cell class="px-2 py-1 font-mono">{'{{book.currentPageDisplay}}'}</Table.Cell><Table.Cell class="px-2 py-1">当前页码</Table.Cell></Table.Row>
					<Table.Row><Table.Cell class="px-2 py-1 font-mono">{'{{book.totalPages}}'}</Table.Cell><Table.Cell class="px-2 py-1">总页数</Table.Cell></Table.Row>
					<Table.Row><Table.Cell class="px-2 py-1 font-mono">{'{{book.path}}'}</Table.Cell><Table.Cell class="px-2 py-1">书籍路径</Table.Cell></Table.Row>
				</Table.Body>
			</Table.Root>
		</div>
	</div>

	<!-- 页面模板 -->
	<div class="space-y-2">
		<div class="text-[11px] font-semibold text-foreground">页面提示模板</div>
		<textarea
			class="w-full min-h-10 rounded-md border bg-background px-2 py-1 text-[11px] font-mono"
			value={switchToastPageTitleTemplate}
			oninput={(e) => {
				const v = (e.currentTarget as HTMLTextAreaElement).value;
				updateSwitchToast({ pageTitleTemplate: v });
			}}
			placeholder={'例如：第 {{page.indexDisplay}} 页'}
		></textarea>
		<textarea
			class="w-full min-h-13 rounded-md border bg-background px-2 py-1 text-[11px] font-mono"
			value={switchToastPageDescriptionTemplate}
			oninput={(e) => {
				const v = (e.currentTarget as HTMLTextAreaElement).value;
				updateSwitchToast({ pageDescriptionTemplate: v });
			}}
			placeholder={'例如：{{page.dimensionsFormatted}}'}
		></textarea>

		<div class="mt-1 rounded-md border bg-background/60 overflow-hidden">
			<Table.Root class="w-full text-[11px]">
				<Table.Header>
					<Table.Row>
						<Table.Head class="px-2 py-1 w-28">变量</Table.Head>
						<Table.Head class="px-2 py-1">说明</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					<Table.Row><Table.Cell class="px-2 py-1 font-mono">{'{{page.indexDisplay}}'}</Table.Cell><Table.Cell class="px-2 py-1">当前页码</Table.Cell></Table.Row>
					<Table.Row><Table.Cell class="px-2 py-1 font-mono">{'{{page.dimensionsFormatted}}'}</Table.Cell><Table.Cell class="px-2 py-1">分辨率</Table.Cell></Table.Row>
					<Table.Row><Table.Cell class="px-2 py-1 font-mono">{'{{page.sizeFormatted}}'}</Table.Cell><Table.Cell class="px-2 py-1">文件大小</Table.Cell></Table.Row>
					<Table.Row><Table.Cell class="px-2 py-1 font-mono">{'{{page.name}}'}</Table.Cell><Table.Cell class="px-2 py-1">页面文件名</Table.Cell></Table.Row>
				</Table.Body>
			</Table.Root>
		</div>
		<p class="mt-1 text-[10px] text-muted-foreground">
			页面模板同样可以使用 <span class="font-mono">{'{{book.*}}'}</span> 变量。
		</p>
	</div>
</div>
