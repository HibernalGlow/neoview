<script lang="ts">
	import { Eye, Mouse, Settings } from '@lucide/svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
	import { Switch } from '$lib/components/ui/switch';
	import { Input } from '$lib/components/ui/input';
	import { Slider } from '$lib/components/ui/slider';
	import type { BookSettingSelectMode } from '$lib/settings/settingsManager';
	import {
		BOOK_SETTING_SELECT_MODE_OPTIONS,
		getBookSettingSelectModeDescription
	} from '$lib/settings/bookSettingSelectModes';

	let currentSettings = $state(settingsManager.getSettings());

	const defaultPageLayoutState = {
		splitHorizontalPages: false,
		treatHorizontalAsDoublePage: false,
		singleFirstPageMode: 'restoreOrDefault' as BookSettingSelectMode,
		singleLastPageMode: 'restoreOrDefault' as BookSettingSelectMode
	};

	function ensurePageLayoutDefaults(target = currentSettings) {
		if (!target.view.pageLayout) {
			target.view.pageLayout = { ...defaultPageLayoutState };
			return;
		}

		target.view.pageLayout = {
			splitHorizontalPages:
				target.view.pageLayout.splitHorizontalPages ?? defaultPageLayoutState.splitHorizontalPages,
			treatHorizontalAsDoublePage:
				target.view.pageLayout.treatHorizontalAsDoublePage ?? defaultPageLayoutState.treatHorizontalAsDoublePage,
			singleFirstPageMode:
				target.view.pageLayout.singleFirstPageMode ?? defaultPageLayoutState.singleFirstPageMode,
			singleLastPageMode:
				target.view.pageLayout.singleLastPageMode ?? defaultPageLayoutState.singleLastPageMode
		};
	}

	function handleSelectModeChange(field: 'singleFirstPageMode' | 'singleLastPageMode', value: BookSettingSelectMode) {
		settingsManager.updateNestedSettings('view', {
			pageLayout: {
				...currentSettings.view.pageLayout,
				[field]: value
			}
		});
	}

	// 订阅设置变化
	settingsManager.addListener((s) => {
		currentSettings = s;
		// 确保 mouseCursor 对象存在
		if (!currentSettings.view.mouseCursor) {
			currentSettings.view.mouseCursor = {
				autoHide: true,
				hideDelay: 1.0,
				showMovementThreshold: 26,
				showOnButtonClick: true
			};
		}
		ensurePageLayoutDefaults();
		if (!currentSettings.view.autoRotate) {
			currentSettings.view.autoRotate = { mode: 'none' };
		}
	});

	// 初始化时确保 mouseCursor 对象存在
	$effect(() => {
		if (!currentSettings.view.mouseCursor) {
			currentSettings.view.mouseCursor = {
				autoHide: true,
				hideDelay: 1.0,
				showMovementThreshold: 26,
				showOnButtonClick: true
			};
		}
		ensurePageLayoutDefaults();
		if (!currentSettings.view.autoRotate) {
			currentSettings.view.autoRotate = { mode: 'none' };
		}
	});
</script>

<div class="space-y-6 p-6">
	<div class="space-y-2">
		<h3 class="flex items-center gap-2 text-lg font-semibold">
			<Eye class="h-5 w-5" />
			视图设置
		</h3>
		<p class="text-muted-foreground text-sm">配置图片查看和显示选项</p>
	</div>

	<div class="space-y-4">
		<!-- 缩放模式 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">默认缩放模式</h4>
			<NativeSelect
				class="w-full max-w-xs"
				bind:value={currentSettings.view.defaultZoomMode}
			>
				<NativeSelectOption value="fit">适应窗口</NativeSelectOption>
				<NativeSelectOption value="fill">铺满整个窗口</NativeSelectOption>
				<NativeSelectOption value="fitWidth">适应宽度</NativeSelectOption>
				<NativeSelectOption value="fitHeight">适应高度</NativeSelectOption>
				<NativeSelectOption value="original">原始大小</NativeSelectOption>
			</NativeSelect>
		</div>

		<!-- 显示选项 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">显示选项</h4>
			<div class="space-y-2">
				<div class="flex items-center justify-between gap-2">
					<Label class="text-sm">显示网格</Label>
					<Switch
						checked={currentSettings.view.showGrid}
						onCheckedChange={(checked) =>
							settingsManager.updateNestedSettings('view', {
								showGrid: checked
							})}
					/>
				</div>
				<div class="flex items-center justify-between gap-2">
					<Label class="text-sm">显示信息栏</Label>
					<Switch
						checked={currentSettings.view.showInfoBar}
						onCheckedChange={(checked) =>
							settingsManager.updateNestedSettings('view', {
								showInfoBar: checked
							})}
					/>
				</div>
			</div>
		</div>

		<!-- 横向页面设置 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">横向页面</h4>
			<div class="space-y-2">
				<div class="flex items-center justify-between gap-2">
					<Label class="text-sm">分割横向页面</Label>
					<Switch
						checked={currentSettings.view.pageLayout.splitHorizontalPages}
						onCheckedChange={(checked) =>
							settingsManager.updateNestedSettings('view', {
								pageLayout: {
									...currentSettings.view.pageLayout,
									splitHorizontalPages: checked
								}
							})}
					/>
				</div>
				<p class="text-muted-foreground text-xs">
					将单张横向图片拆成左右两页，翻页时按阅读方向依次显示。
				</p>
				<div class="flex items-center justify-between gap-2">
					<Label class="text-sm">横向页面视为双页</Label>
					<Switch
						checked={currentSettings.view.pageLayout.treatHorizontalAsDoublePage}
						onCheckedChange={(checked) =>
							settingsManager.updateNestedSettings('view', {
								pageLayout: {
									...currentSettings.view.pageLayout,
									treatHorizontalAsDoublePage: checked
								}
							})}
					/>
				</div>
				<p class="text-muted-foreground text-xs">
					在双页模式下，让横向图片独占整幅跨页，避免与下一页拼接。
				</p>
			</div>
		</div>

		<!-- 自动旋转 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">自动旋转</h4>
			<NativeSelect
				class="w-full max-w-xs"
				bind:value={currentSettings.view.autoRotate.mode}
				onchange={() =>
					settingsManager.updateNestedSettings('view', {
						autoRotate: {
							mode: currentSettings.view.autoRotate.mode
						}
					})}
			>
				<NativeSelectOption value="none">关闭</NativeSelectOption>
				<NativeSelectOption value="left">纵向页面左旋</NativeSelectOption>
				<NativeSelectOption value="right">纵向页面右旋</NativeSelectOption>
				<NativeSelectOption value="forcedLeft">始终左旋 90°</NativeSelectOption>
				<NativeSelectOption value="forcedRight">始终右旋 90°</NativeSelectOption>
			</NativeSelect>
			<p class="text-muted-foreground text-xs">
				基于图片宽高比自动旋转。强制模式会忽略图片方向始终旋转。
			</p>
		</div>

		<!-- 阅读设置 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">阅读设置</h4>
			<div class="space-y-2">
				<div class="space-y-2">
					<Label class="text-sm">阅读方向</Label>
					<NativeSelect
						class="w-full max-w-xs"
						bind:value={currentSettings.book.readingDirection}
						onchange={() =>
							settingsManager.updateNestedSettings('book', {
								readingDirection: currentSettings.book.readingDirection
							})}
					>
						<NativeSelectOption value="left-to-right">左到右（西式）</NativeSelectOption>
						<NativeSelectOption value="right-to-left">右到左（日式）</NativeSelectOption>
					</NativeSelect>
					<p class="text-muted-foreground text-xs">
						选择阅读方向。右到左模式适用于日式漫画，会反向排列双页模式中的图片。
					</p>
				</div>
				<div class="space-y-2">
					<Label class="text-sm">超过尾页时的行为</Label>
					<NativeSelect
						class="w-full max-w-xs"
						bind:value={currentSettings.book.tailOverflowBehavior}
						onchange={() =>
							settingsManager.updateNestedSettings('book', {
								tailOverflowBehavior: currentSettings.book.tailOverflowBehavior
							})}
					>
						<NativeSelectOption value="doNothing">无变化（忽略操作）</NativeSelectOption>
						<NativeSelectOption value="stayOnLastPage">无变化（停留在尾页）</NativeSelectOption>
						<NativeSelectOption value="nextBook">进入下一本书籍</NativeSelectOption>
						<NativeSelectOption value="loopTopBottom">循环（尾页回首页）</NativeSelectOption>
						<NativeSelectOption value="seamlessLoop">无缝循环</NativeSelectOption>
						<NativeSelectOption value="promptDialog">在对话框中选择</NativeSelectOption>
					</NativeSelect>
					<p class="text-muted-foreground text-xs">
						定义翻页超过尾页时的处理方式，方便在书籍之间或书内循环阅读。
					</p>
				</div>
			</div>
		</div>

		<!-- 背景颜色 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">背景颜色</h4>
			<div class="flex items-center gap-2">
				<Input
					type="color"
					class="h-10 w-20"
					bind:value={currentSettings.view.backgroundColor}
					onchange={() =>
						settingsManager.updateNestedSettings('view', {
							backgroundColor: currentSettings.view.backgroundColor
						})}
					disabled={currentSettings.view.backgroundMode === 'auto'}
				/>
				<NativeSelect
					class="w-full max-w-xs"
					bind:value={currentSettings.view.backgroundMode}
					onchange={() =>
						settingsManager.updateNestedSettings('view', {
							backgroundMode: currentSettings.view.backgroundMode
						})}
				>
					<NativeSelectOption value="solid">固定颜色</NativeSelectOption>
					<NativeSelectOption value="auto">自动匹配图片</NativeSelectOption>
				</NativeSelect>
			</div>
		</div>

		<!-- 鼠标设置 -->
		<div class="space-y-4">
			<h4 class="flex items-center gap-2 text-sm font-semibold">
				<Mouse class="h-4 w-4" />
				鼠标设置
			</h4>

			<div class="space-y-3 pl-6">
				<!-- 自动隐藏光标 -->
				<div class="space-y-2">
					<label class="flex items-center gap-2">
						<Switch bind:checked={currentSettings.view.mouseCursor.autoHide} />
						<span class="text-sm font-medium">自动隐藏光标</span>
					</label>
					<p class="text-muted-foreground text-xs">
						没有鼠标操作时隐藏光标。如果在设定时间内未操作鼠标，则隐藏光标。
					</p>
				</div>

				{#if currentSettings.view.mouseCursor.autoHide}
					<!-- 隐藏时间 -->
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-sm">隐藏时间（秒）</span>
							<div class="flex items-center gap-2">
								<Input
									type="number"
									min="0.5"
									max="5.0"
									step="0.1"
									bind:value={currentSettings.view.mouseCursor.hideDelay}
									class="w-20"
								/>
								<span class="text-muted-foreground text-xs">秒</span>
							</div>
						</div>
						<Slider
							min={0.5}
							max={5.0}
							step={0.1}
							bind:value={currentSettings.view.mouseCursor.hideDelay as any}
							class="w-full max-w-xs"
							type="single"
						/>
					</div>

					<!-- 重新显示的移动距离 -->
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-sm">重新显示的移动距离</span>
							<div class="flex items-center gap-2">
								<Input
									type="number"
									min="5"
									max="100"
									step="1"
									bind:value={currentSettings.view.mouseCursor.showMovementThreshold}
									class="w-20"
								/>
								<span class="text-muted-foreground text-xs">像素</span>
							</div>
						</div>
						<Slider
							min={5}
							max={100}
							step={1}
							bind:value={currentSettings.view.mouseCursor.showMovementThreshold as any}
							class="w-full max-w-xs"
							type="single"
						/>
					</div>

					<!-- 操作鼠标按钮以重新显示 -->
					<div class="space-y-2">
						<label class="flex items-center gap-2">
							<Switch bind:checked={currentSettings.view.mouseCursor.showOnButtonClick} />
							<span class="text-sm">操作鼠标按钮以重新显示</span>
						</label>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
