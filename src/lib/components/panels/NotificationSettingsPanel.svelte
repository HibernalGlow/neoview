<script lang="ts">
	import { Bell, Settings2, Clock, Filter } from '@lucide/svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
	import { Switch } from '$lib/components/ui/switch';
	import { Input } from '$lib/components/ui/input';
	import * as Tabs from '$lib/components/ui/tabs';

	let activeTab = $state('basic');

	type MessageStyle = 'none' | 'normal' | 'normalIconOnly' | 'tiny' | 'tinyIconOnly';

	let enabled = $state(true);
	let style = $state<MessageStyle>('normal');
	let durationMs = $state(3000);
	let maxVisible = $state(3);
	let placeholderFileOps = $state(true);
	let placeholderTaskProgress = $state(true);
	let placeholderPerformanceTips = $state(false);
	let placeholderSystemMessages = $state(true);

	function loadFromSettings() {
		const s = settingsManager.getSettings();
		const base = s.view?.notification ?? {
			messageStyle: 'normal' as MessageStyle,
			durationMs: 3000,
			maxVisible: 3
		};
		const p = base.placeholders ?? {
			fileOperations: true,
			taskProgress: true,
			performanceTips: false,
			systemMessages: true
		};

		enabled = base.messageStyle !== 'none';
		style = base.messageStyle;
		durationMs = base.durationMs ?? 3000;
		maxVisible = base.maxVisible ?? 3;
		placeholderFileOps = p.fileOperations ?? true;
		placeholderTaskProgress = p.taskProgress ?? true;
		placeholderPerformanceTips = p.performanceTips ?? false;
		placeholderSystemMessages = p.systemMessages ?? true;
	}

	$effect(() => {
		loadFromSettings();
	});

	function saveNotification(partial?: Partial<{ messageStyle: MessageStyle; durationMs: number; maxVisible: number }>) {
		const next: { messageStyle: MessageStyle; durationMs: number; maxVisible: number } = {
			messageStyle: style,
			durationMs,
			maxVisible,
			...partial
		};
		const placeholders = {
			fileOperations: placeholderFileOps,
			taskProgress: placeholderTaskProgress,
			performanceTips: placeholderPerformanceTips,
			systemMessages: placeholderSystemMessages
		};

		enabled = next.messageStyle !== 'none';
		style = next.messageStyle;
		durationMs = next.durationMs;
		maxVisible = next.maxVisible;

		settingsManager.updateNestedSettings('view', {
			notification: {
				...next,
				placeholders
			}
		});
	}

	function handleToggleEnabled(value: boolean) {
		if (!value) {
			saveNotification({ messageStyle: 'none' });
		} else {
			const nextStyle: MessageStyle = style === 'none' ? 'normal' : style;
			saveNotification({ messageStyle: nextStyle });
		}
	}

	function handleStyleChange(value: MessageStyle) {
		saveNotification({ messageStyle: value });
	}

	function handleDurationChange(value: number) {
		if (!Number.isFinite(value)) return;
		const clampedSec = Math.min(10, Math.max(1, value));
		const ms = Math.round(clampedSec * 1000);
		durationMs = ms;
		saveNotification();
	}

	function handleMaxVisibleChange(value: number) {
		if (!Number.isFinite(value)) return;
		const clamped = Math.min(5, Math.max(1, Math.round(value)));
		maxVisible = clamped;
		saveNotification();
	}
</script>

<div class="space-y-3 p-4">
	<div class="space-y-1">
		<h3 class="flex items-center gap-2 text-base font-bold">
			<Bell class="h-4.5 w-4.5" />
			<span>通知</span>
		</h3>
		<p class="text-muted-foreground text-[11px]">配置 NeoView 全局通知 (toast) 的显示方式</p>
	</div>

	<Tabs.Root bind:value={activeTab} class="w-full">
		<Tabs.List class="grid h-8 w-full grid-cols-3 p-1">
			<Tabs.Trigger value="basic" class="gap-1.5 text-[10px] py-1">
				<Settings2 class="h-3 w-3" />
				基本
			</Tabs.Trigger>
			<Tabs.Trigger value="display" class="gap-1.5 text-[10px] py-1">
				<Clock class="h-3 w-3" />
				显示
			</Tabs.Trigger>
			<Tabs.Trigger value="types" class="gap-1.5 text-[10px] py-1">
				<Filter class="h-3 w-3" />
				类型
			</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="basic" class="mt-3 space-y-3">
		<!-- 显示通知 -->
		<div class="space-y-1.5">
			<h4 class="text-xs font-bold">显示通知</h4>
			<div class="flex items-center justify-between gap-2">
				<Label class="text-xs">启用通知显示</Label>
				<Switch checked={enabled} onCheckedChange={handleToggleEnabled} class="scale-75" />
			</div>
		</div>

		<!-- 通知样式 -->
		<div class="space-y-1.5">
			<h4 class="text-xs font-bold">通知样式</h4>
			<NativeSelect
				class="w-full max-w-xs h-8 text-xs"
				bind:value={style}
				disabled={!enabled}
				onchange={() => handleStyleChange(style)}
			>
				<NativeSelectOption value="normal">普通</NativeSelectOption>
				<NativeSelectOption value="normalIconOnly">仅图标</NativeSelectOption>
				<NativeSelectOption value="tiny">缩小</NativeSelectOption>
				<NativeSelectOption value="tinyIconOnly">缩小 (仅图标)</NativeSelectOption>
				<NativeSelectOption value="none">不显示</NativeSelectOption>
			</NativeSelect>
		</div>

		</Tabs.Content>

		<Tabs.Content value="display" class="mt-3 space-y-3">
		<!-- 显示时间 -->
		<div class="space-y-1.5">
			<Label class="text-xs font-bold">显示时间 (秒)</Label>
			<div class="flex items-center gap-2">
				<Input
					type="number"
					min="1"
					max="10"
					step="0.5"
					class="h-7 w-20 text-xs"
					value={(durationMs / 1000).toFixed(1)}
					oninput={(e) => {
						const v = parseFloat((e.currentTarget as HTMLInputElement).value);
						if (!Number.isNaN(v)) handleDurationChange(v);
					}}
				/>
			</div>
		</div>

		<!-- 同时显示数量 -->
		<div class="space-y-1.5">
			<Label class="text-xs font-bold">最大并显数</Label>
			<div class="flex items-center gap-2">
				<Input
					type="number"
					min="1"
					max="5"
					step="1"
					class="h-7 w-20 text-xs"
					value={maxVisible}
					oninput={(e) => {
						const v = parseInt((e.currentTarget as HTMLInputElement).value, 10);
						if (!Number.isNaN(v)) handleMaxVisibleChange(v);
					}}
				/>
			</div>
		</div>

		</Tabs.Content>

		<Tabs.Content value="types" class="mt-3 space-y-3">
		<!-- 通知类型 -->
		<div class="space-y-1.5">
			<Label class="text-xs font-bold">启用通知类型</Label>
			<div class="space-y-1 text-xs text-muted-foreground">
				<div class="flex items-center justify-between gap-2">
					<span class="text-xs text-foreground">文件操作结果</span>
					<Switch
						checked={placeholderFileOps}
						onCheckedChange={(v) => {
							placeholderFileOps = v;
							saveNotification();
						}}
						class="scale-75"
					/>
				</div>
				<div class="flex items-center justify-between gap-2">
					<span class="text-xs text-foreground">任务进度</span>
					<Switch
						checked={placeholderTaskProgress}
						onCheckedChange={(v) => {
							placeholderTaskProgress = v;
							saveNotification();
						}}
						class="scale-75"
					/>
				</div>
				<div class="flex items-center justify-between gap-2">
					<span class="text-xs text-foreground">系统与性能提示</span>
					<Switch
						checked={placeholderSystemMessages}
						onCheckedChange={(v) => {
							placeholderSystemMessages = v;
							saveNotification();
						}}
						class="scale-75"
					/>
				</div>
			</div>
		</div>
		</Tabs.Content>
	</Tabs.Root>
</div>
