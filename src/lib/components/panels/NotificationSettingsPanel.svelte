<script lang="ts">
	import { Bell } from '@lucide/svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
	import { Switch } from '$lib/components/ui/switch';
	import { Slider } from '$lib/components/ui/slider';

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
		const clamped = Math.min(10000, Math.max(1000, value));
		saveNotification({ durationMs: clamped });
	}

	function handleMaxVisibleChange(value: number) {
		const clamped = Math.min(5, Math.max(1, value));
		saveNotification({ maxVisible: clamped });
	}
</script>

<div class="space-y-6 p-6">
	<div class="space-y-2">
		<h3 class="flex items-center gap-2 text-lg font-semibold">
			<Bell class="h-5 w-5" />
			<span>通知</span>
		</h3>
		<p class="text-muted-foreground text-sm">配置 NeoView 全局通知 (toast) 的显示方式</p>
	</div>

	<div class="space-y-6">
		<!-- 显示通知 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">显示通知</h4>
			<div class="flex items-center justify-between gap-2">
				<Label class="text-sm">显示通知 (ShowMessageStyle)</Label>
				<Switch checked={enabled} onCheckedChange={handleToggleEnabled} />
			</div>
			<p class="text-muted-foreground text-xs">关闭后将不再显示任何 toast 提示。</p>
		</div>

		<!-- 通知样式 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">通知样式</h4>
			<NativeSelect
				class="w-full max-w-xs"
				bind:value={style}
				disabled={!enabled}
				onchange={() => handleStyleChange(style)}
			>
				<NativeSelectOption value="normal">普通</NativeSelectOption>
				<NativeSelectOption value="normalIconOnly">普通 (仅图标)</NativeSelectOption>
				<NativeSelectOption value="tiny">缩小显示</NativeSelectOption>
				<NativeSelectOption value="tinyIconOnly">缩小 (仅图标)</NativeSelectOption>
				<NativeSelectOption value="none">不显示</NativeSelectOption>
			</NativeSelect>
			<p class="text-muted-foreground text-xs">
				对应 NeeView 的 ShowMessageStyle：不显示 / 显示 / 缩小显示 等。
			</p>
		</div>

		<!-- 显示时间 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">显示时间</h4>
			<div class="flex items-center justify-between">
				<span class="text-sm">每条通知持续时间</span>
				<span class="text-muted-foreground text-xs">{(durationMs / 1000).toFixed(1)} 秒</span>
			</div>
			<Slider
				min={1000}
				max={10000}
				step={500}
				type="single"
				value={[durationMs]}
				onValueChange={(vals) => {
					const v = vals[0];
					if (typeof v === 'number') handleDurationChange(v);
				}}
				class="w-full max-w-xs"
			/>
		</div>

		<!-- 同时显示数量 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">同时显示数量</h4>
			<div class="flex items-center justify-between">
				<span class="text-sm">最多同时显示通知数</span>
				<span class="text-muted-foreground text-xs">{maxVisible}</span>
			</div>
			<Slider
				min={1}
				max={5}
				step={1}
				type="single"
				value={[maxVisible]}
				onValueChange={(vals) => {
					const v = vals[0];
					if (typeof v === 'number') handleMaxVisibleChange(v);
				}}
				class="w-full max-w-xs"
			/>
		</div>

		<!-- 其他通知占位 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">其他通知（占位）</h4>
			<p class="text-muted-foreground text-xs">以下选项仅作为通知类型的占位，当前版本中尚未接入具体逻辑。</p>
			<div class="space-y-2 text-xs text-muted-foreground">
				<div class="flex items-center justify-between gap-2">
					<span>文件操作结果通知</span>
					<Switch
						checked={placeholderFileOps}
						onCheckedChange={(v) => {
							placeholderFileOps = v;
							saveNotification();
						}}
					/>
				</div>
				<div class="flex items-center justify-between gap-2">
					<span>任务进度通知</span>
					<Switch
						checked={placeholderTaskProgress}
						onCheckedChange={(v) => {
							placeholderTaskProgress = v;
							saveNotification();
						}}
					/>
				</div>
				<div class="flex items-center justify-between gap-2">
					<span>性能提示通知</span>
					<Switch
						checked={placeholderPerformanceTips}
						onCheckedChange={(v) => {
							placeholderPerformanceTips = v;
							saveNotification();
						}}
					/>
				</div>
				<div class="flex items-center justify-between gap-2">
					<span>系统提示通知</span>
					<Switch
						checked={placeholderSystemMessages}
						onCheckedChange={(v) => {
							placeholderSystemMessages = v;
							saveNotification();
						}}
					/>
				</div>
			</div>
		</div>
	</div>
</div>
