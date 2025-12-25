<script lang="ts">
/**
 * PenetrateSettingsBar - 穿透模式设置栏组件
 * 类似 MigrationBar 的展开栏风格
 */
import { Package, Image, Layers, Settings, ChevronDown, ChevronRight } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';

// 是否展开详细设置
let showDetails = $state(false);

function toggleDetails() {
	showDetails = !showDetails;
}
</script>

<div class="border-b px-2 py-1.5 text-xs">
	<div class="flex items-center gap-2">
		<!-- 标题和展开按钮 -->
		<button
			type="button"
			class="text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
			onclick={toggleDetails}
		>
			{#if showDetails}
				<ChevronDown class="h-3.5 w-3.5" />
			{:else}
				<ChevronRight class="h-3.5 w-3.5" />
			{/if}
			<Layers class="h-3.5 w-3.5" />
			<span>穿透设置</span>
		</button>

		<!-- 快捷设置：穿透层数 -->
		<div class="flex items-center gap-1.5 ml-2">
			<span class="text-muted-foreground">层数:</span>
			<select
				class="h-6 bg-background border rounded text-xs px-1"
				value={$fileBrowserStore.penetrateMaxDepth}
				onchange={(e) => fileBrowserStore.setPenetrateMaxDepth(parseInt((e.target as HTMLSelectElement).value))}
			>
				<option value="1">1层</option>
				<option value="2">2层</option>
				<option value="3">3层</option>
				<option value="5">5层</option>
				<option value="10">10层</option>
				<option value="99">无限</option>
			</select>
		</div>

		<!-- 快捷设置：内部文件显示 -->
		<div class="flex items-center gap-1.5">
			<Package class="h-3.5 w-3.5 text-muted-foreground" />
			<select
				class="h-6 bg-background border rounded text-xs px-1"
				value={$fileBrowserStore.penetrateShowInnerFile}
				onchange={(e) => fileBrowserStore.setPenetrateShowInnerFile((e.target as HTMLSelectElement).value as 'none' | 'penetrate' | 'always')}
			>
				<option value="none">不显示</option>
				<option value="penetrate">穿透时</option>
				<option value="always">始终</option>
			</select>
		</div>

		<!-- 快捷设置：媒体文件夹 -->
		<div class="flex items-center gap-1.5">
			<Image class="h-3.5 w-3.5 text-muted-foreground" />
			<Button
				variant={$fileBrowserStore.penetratePureMediaFolderOpen ? 'default' : 'outline'}
				size="sm"
				class="h-6 text-[11px] px-2"
				onclick={() => fileBrowserStore.setPenetratePureMediaFolderOpen(!$fileBrowserStore.penetratePureMediaFolderOpen)}
			>
				{$fileBrowserStore.penetratePureMediaFolderOpen ? '直接打开' : '进入文件夹'}
			</Button>
		</div>

		<div class="flex-1"></div>

		<!-- 详细设置按钮 -->
		<Button
			variant="ghost"
			size="sm"
			class="text-muted-foreground h-6 px-2 text-[11px]"
			onclick={toggleDetails}
		>
			<Settings class="mr-1 h-3.5 w-3.5" />
			<span>{showDetails ? '收起' : '更多'}</span>
		</Button>
	</div>

	<!-- 详细设置面板 -->
	{#if showDetails}
		<div class="mt-2 space-y-2 border-t pt-2">
			<!-- 穿透层数说明 -->
			<div class="flex items-start gap-2">
				<Layers class="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
				<div class="flex-1">
					<div class="flex items-center gap-2">
						<span class="text-foreground font-medium">穿透层数</span>
						<select
							class="h-6 bg-background border rounded text-xs px-1"
							value={$fileBrowserStore.penetrateMaxDepth}
							onchange={(e) => fileBrowserStore.setPenetrateMaxDepth(parseInt((e.target as HTMLSelectElement).value))}
						>
							<option value="1">1层</option>
							<option value="2">2层</option>
							<option value="3">3层（默认）</option>
							<option value="5">5层</option>
							<option value="10">10层</option>
							<option value="99">无限制</option>
						</select>
					</div>
					<p class="text-muted-foreground text-[10px] mt-0.5">
						当文件夹只有一个子文件夹时，自动穿透进入的最大层数
					</p>
				</div>
			</div>

			<!-- 内部文件显示 -->
			<div class="flex items-start gap-2">
				<Package class="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
				<div class="flex-1">
					<div class="flex items-center gap-2">
						<span class="text-foreground font-medium">内部文件显示</span>
						<select
							class="h-6 bg-background border rounded text-xs px-1"
							value={$fileBrowserStore.penetrateShowInnerFile}
							onchange={(e) => fileBrowserStore.setPenetrateShowInnerFile((e.target as HTMLSelectElement).value as 'none' | 'penetrate' | 'always')}
						>
							<option value="none">不显示</option>
							<option value="penetrate">仅穿透模式</option>
							<option value="always">始终显示</option>
						</select>
						<select
							class="h-6 bg-background border rounded text-xs px-1"
							value={$fileBrowserStore.penetrateInnerFileCount}
							onchange={(e) => fileBrowserStore.setPenetrateInnerFileCount((e.target as HTMLSelectElement).value as 'single' | 'all')}
						>
							<option value="single">单文件夹</option>
							<option value="all">所有文件夹</option>
						</select>
					</div>
					<p class="text-muted-foreground text-[10px] mt-0.5">
						在文件夹卡片上显示内部压缩包的名称和翻译
					</p>
				</div>
			</div>

			<!-- 纯媒体文件夹 -->
			<div class="flex items-start gap-2">
				<Image class="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
				<div class="flex-1">
					<div class="flex items-center gap-2">
						<span class="text-foreground font-medium">纯媒体文件夹</span>
						<Button
							variant={$fileBrowserStore.penetratePureMediaFolderOpen ? 'default' : 'outline'}
							size="sm"
							class="h-6 text-[11px] px-2"
							onclick={() => fileBrowserStore.setPenetratePureMediaFolderOpen(!$fileBrowserStore.penetratePureMediaFolderOpen)}
						>
							{$fileBrowserStore.penetratePureMediaFolderOpen ? '点击直接打开' : '点击进入文件夹'}
						</Button>
					</div>
					<p class="text-muted-foreground text-[10px] mt-0.5">
						只包含图片/视频/文本的文件夹，点击时直接作为书籍打开
					</p>
				</div>
			</div>
		</div>
	{/if}
</div>
