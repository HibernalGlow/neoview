<script lang="ts">
	import { Eye, Mouse, Settings } from '@lucide/svelte';
	import { settingsManager } from '$lib/settings/settingsManager';

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
			<select
				class="w-full max-w-xs rounded-md border p-2"
				bind:value={currentSettings.view.defaultZoomMode}
			>
				<option value="fit">适应窗口</option>
				<option value="fitWidth">适应宽度</option>
				<option value="fitHeight">适应高度</option>
				<option value="original">原始大小</option>
			</select>
		</div>

		<!-- 显示选项 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">显示选项</h4>
			<div class="space-y-2">
				<label class="flex items-center gap-2">
					<input type="checkbox" class="rounded" bind:checked={currentSettings.view.showGrid} />
					<span class="text-sm">显示网格</span>
				</label>
				<label class="flex items-center gap-2">
					<input type="checkbox" class="rounded" bind:checked={currentSettings.view.showInfoBar} />
					<span class="text-sm">显示信息栏</span>
				</label>
			</div>
		</div>

		<!-- 阅读设置 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">阅读设置</h4>
			<div class="space-y-2">
				<div class="space-y-2">
					<span class="text-sm">阅读方向</span>
					<select
						class="w-full max-w-xs rounded-md border p-2"
						bind:value={currentSettings.book.readingDirection}
						onchange={() => settingsManager.updateNestedSettings('book', { readingDirection: currentSettings.book.readingDirection })}
					>
						<option value="left-to-right">左到右（西式）</option>
						<option value="right-to-left">右到左（日式）</option>
					</select>
					<p class="text-muted-foreground text-xs">
						选择阅读方向。右到左模式适用于日式漫画，会反向排列双页模式中的图片。
					</p>
				</div>
			</div>
		</div>

		<!-- 背景颜色 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">背景颜色</h4>
			<input
				type="color"
				class="h-10 w-20 rounded-md border"
				bind:value={currentSettings.view.backgroundColor}
			/>
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
						<input
							type="checkbox"
							class="rounded"
							bind:checked={currentSettings.view.mouseCursor.autoHide}
						/>
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
								<input
									type="number"
									min="0.5"
									max="5.0"
									step="0.1"
									bind:value={currentSettings.view.mouseCursor.hideDelay}
									class="w-16 rounded-md border px-2 py-1 text-sm"
								/>
								<span class="text-muted-foreground text-xs">秒</span>
							</div>
						</div>
						<input
							type="range"
							min="0.5"
							max="5.0"
							step="0.1"
							bind:value={currentSettings.view.mouseCursor.hideDelay}
							class="w-full max-w-xs"
						/>
					</div>

					<!-- 重新显示的移动距离 -->
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-sm">重新显示的移动距离</span>
							<div class="flex items-center gap-2">
								<input
									type="number"
									min="5"
									max="100"
									step="1"
									bind:value={currentSettings.view.mouseCursor.showMovementThreshold}
									class="w-16 rounded-md border px-2 py-1 text-sm"
								/>
								<span class="text-muted-foreground text-xs">像素</span>
							</div>
						</div>
						<input
							type="range"
							min="5"
							max="100"
							step="1"
							bind:value={currentSettings.view.mouseCursor.showMovementThreshold}
							class="w-full max-w-xs"
						/>
					</div>

					<!-- 操作鼠标按钮以重新显示 -->
					<div class="space-y-2">
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								class="rounded"
								bind:checked={currentSettings.view.mouseCursor.showOnButtonClick}
							/>
							<span class="text-sm">操作鼠标按钮以重新显示</span>
						</label>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
