<script lang="ts">
	import { Eye, Mouse, Settings, Monitor, BookOpen, Palette } from '@lucide/svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
	import { Switch } from '$lib/components/ui/switch';
	import { Input } from '$lib/components/ui/input';
	import { Slider } from '$lib/components/ui/slider';
	import * as Tabs from '$lib/components/ui/tabs';

	let activeTab = $state('display');

	let currentSettings = $state(settingsManager.getSettings());

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
		if (!currentSettings.view.pageLayout) {
			currentSettings.view.pageLayout = {
				splitHorizontalPages: false,
				treatHorizontalAsDoublePage: false,
				singleFirstPageMode: 'restoreOrDefault',
				singleLastPageMode: 'restoreOrDefault'
			};
		}
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
		if (!currentSettings.view.pageLayout) {
			currentSettings.view.pageLayout = {
				splitHorizontalPages: false,
				treatHorizontalAsDoublePage: false,
				singleFirstPageMode: 'restoreOrDefault',
				singleLastPageMode: 'restoreOrDefault'
			};
		}
		if (!currentSettings.view.autoRotate) {
			currentSettings.view.autoRotate = { mode: 'none' };
		}
	});
</script>

<div class="space-y-4 p-6">
	<div class="space-y-2">
		<h3 class="flex items-center gap-2 text-lg font-semibold">
			<Eye class="h-5 w-5" />
			视图设置
		</h3>
		<p class="text-muted-foreground text-sm">配置图片查看和显示选项</p>
	</div>

	<Tabs.Root bind:value={activeTab} class="w-full">
		<Tabs.List class="grid w-full grid-cols-3">
			<Tabs.Trigger value="display" class="gap-1.5 text-xs">
				<Monitor class="h-3.5 w-3.5" />
				显示
			</Tabs.Trigger>
			<Tabs.Trigger value="page" class="gap-1.5 text-xs">
				<BookOpen class="h-3.5 w-3.5" />
				页面
			</Tabs.Trigger>
			<Tabs.Trigger value="mouse" class="gap-1.5 text-xs">
				<Mouse class="h-3.5 w-3.5" />
				鼠标
			</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="display" class="mt-4 space-y-4">
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
				<div class="flex items-center justify-between gap-2">
					<Label class="text-sm">切换书籍时显示提示</Label>
					<Switch
						checked={currentSettings.view.showBookSwitchToast}
						onCheckedChange={(checked) =>
							settingsManager.updateNestedSettings('view', {
								showBookSwitchToast: checked
							})}
					/>
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
					disabled={currentSettings.view.backgroundMode !== 'solid'}
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
					<NativeSelectOption value="ambient">✨ 流光溢彩</NativeSelectOption>
				</NativeSelect>
			</div>
			<!-- 流光溢彩提示 -->
			{#if currentSettings.view.backgroundMode === 'ambient'}
				<p class="text-xs text-muted-foreground">✨ 从图片中提取主色调，生成类似苹果灵动岛的流动渐变效果。详细设置请使用「流光溢彩」卡片。</p>
			{/if}
		</div>
		</Tabs.Content>

		<Tabs.Content value="page" class="mt-4 space-y-4">
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
				<optgroup label="纵向图片">
					<NativeSelectOption value="left">纵向页面左旋</NativeSelectOption>
					<NativeSelectOption value="right">纵向页面右旋</NativeSelectOption>
				</optgroup>
				<optgroup label="横屏图片">
					<NativeSelectOption value="horizontalLeft">横屏页面左旋 90°</NativeSelectOption>
					<NativeSelectOption value="horizontalRight">横屏页面右旋 90°</NativeSelectOption>
				</optgroup>
				<optgroup label="强制旋转">
					<NativeSelectOption value="forcedLeft">始终左旋 90°</NativeSelectOption>
					<NativeSelectOption value="forcedRight">始终右旋 90°</NativeSelectOption>
				</optgroup>
			</NativeSelect>
			<p class="text-muted-foreground text-xs">
				基于图片宽高比自动旋转。横屏模式对宽高比≥1.2的图片生效，强制模式会忽略图片方向始终旋转。
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
		</Tabs.Content>

		<Tabs.Content value="mouse" class="mt-4 space-y-4">
		<!-- 鼠标设置 -->
		<div class="space-y-4">
			<h4 class="flex items-center gap-2 text-sm font-semibold">
				<Mouse class="h-4 w-4" />
				鼠标光标
			</h4>

			<div class="space-y-3 pl-6">
				<!-- 自动隐藏光标 -->
				<div class="space-y-2">
					<div class="flex items-center justify-between gap-2">
						<Label class="text-sm">自动隐藏光标</Label>
						<Switch
							checked={currentSettings.view.mouseCursor.autoHide}
							onCheckedChange={(checked) => {
								const latest = settingsManager.getSettings();
								settingsManager.updateNestedSettings('view', {
									mouseCursor: { ...latest.view.mouseCursor, autoHide: checked }
								});
							}}
						/>
					</div>
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
									value={currentSettings.view.mouseCursor.hideDelay}
									oninput={(e) => {
										const val = parseFloat((e.target as HTMLInputElement).value);
										if (!Number.isNaN(val)) {
											const latest = settingsManager.getSettings();
											settingsManager.updateNestedSettings('view', {
												mouseCursor: { ...latest.view.mouseCursor, hideDelay: Math.max(0.5, Math.min(val, 5.0)) }
											});
										}
									}}
									class="w-20"
								/>
								<span class="text-muted-foreground text-xs">秒</span>
							</div>
						</div>
						<Slider
							min={0.5}
							max={5.0}
							step={0.1}
							value={currentSettings.view.mouseCursor.hideDelay as any}
							onValueChange={(v) => {
								const latest = settingsManager.getSettings();
								settingsManager.updateNestedSettings('view', {
									mouseCursor: { ...latest.view.mouseCursor, hideDelay: Array.isArray(v) ? v[0] : v }
								});
							}}
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
									value={currentSettings.view.mouseCursor.showMovementThreshold}
									oninput={(e) => {
										const val = parseInt((e.target as HTMLInputElement).value, 10);
										if (!Number.isNaN(val)) {
											const latest = settingsManager.getSettings();
											settingsManager.updateNestedSettings('view', {
												mouseCursor: { ...latest.view.mouseCursor, showMovementThreshold: Math.max(5, Math.min(val, 100)) }
											});
										}
									}}
									class="w-20"
								/>
								<span class="text-muted-foreground text-xs">像素</span>
							</div>
						</div>
						<Slider
							min={5}
							max={100}
							step={1}
							value={currentSettings.view.mouseCursor.showMovementThreshold as any}
							onValueChange={(v) => {
								const latest = settingsManager.getSettings();
								settingsManager.updateNestedSettings('view', {
									mouseCursor: { ...latest.view.mouseCursor, showMovementThreshold: Array.isArray(v) ? v[0] : v }
								});
							}}
							class="w-full max-w-xs"
							type="single"
						/>
					</div>

					<!-- 操作鼠标按钮以重新显示 -->
					<div class="space-y-2">
						<div class="flex items-center justify-between gap-2">
							<Label class="text-sm">操作鼠标按钮以重新显示</Label>
							<Switch
								checked={currentSettings.view.mouseCursor.showOnButtonClick}
								onCheckedChange={(checked) => {
									const latest = settingsManager.getSettings();
									settingsManager.updateNestedSettings('view', {
										mouseCursor: { ...latest.view.mouseCursor, showOnButtonClick: checked }
									});
								}}
							/>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- 悬停滚动设置 -->
		<div class="space-y-3">
			<h4 class="flex items-center gap-2 text-sm font-semibold">
				<Mouse class="h-4 w-4" />
				悬停滚动
			</h4>
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<span class="text-sm">滚动倍率</span>
					<div class="flex items-center gap-2">
						<Input
							type="number"
							min="0.5"
							max="10"
							step="0.5"
							value={currentSettings.image.hoverScrollSpeed ?? 2.0}
							oninput={(event) => {
								const target = event.target as HTMLInputElement;
								const raw = parseFloat(target.value);
								if (!Number.isNaN(raw)) {
									const clamped = Math.max(0.5, Math.min(raw, 10));
									settingsManager.updateNestedSettings('image', {
										hoverScrollSpeed: clamped
									});
								}
							}}
							class="w-20"
						/>
						<span class="text-muted-foreground text-xs">倍</span>
					</div>
				</div>
				<Slider
					min={0.5}
					max={10}
					step={0.5}
					bind:value={currentSettings.image.hoverScrollSpeed as any}
					class="w-full max-w-xs"
					type="single"
				/>
				<p class="text-muted-foreground text-xs">
					控制鼠标悬停滚动的速度倍率，数值越大滚动越快。
				</p>
			</div>
		</div>
		</Tabs.Content>
	</Tabs.Root>
</div>
