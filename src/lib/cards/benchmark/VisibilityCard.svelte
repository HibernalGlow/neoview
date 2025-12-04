<script lang="ts">
/**
 * 可见性监控卡片
 * 从 BenchmarkPanel 提取
 */
import { Button } from '$lib/components/ui/button';
import { visibilityMonitor, setMonitorEnabled } from '$lib/stores/visibilityMonitor.svelte';
</script>

<div class="space-y-2">
	<!-- 开关按钮 -->
	<div class="flex items-center justify-between">
		<p class="text-[10px] text-muted-foreground">
			实时监控 VirtualizedFileListV2 的可见条目范围
		</p>
		<Button 
			variant={visibilityMonitor.enabled ? "default" : "outline"} 
			size="sm" 
			class="h-6 text-[10px] px-2"
			onclick={() => setMonitorEnabled(!visibilityMonitor.enabled)}
		>
			{visibilityMonitor.enabled ? '关闭监控' : '开启监控'}
		</Button>
	</div>
	
	{#if !visibilityMonitor.enabled}
		<div class="text-[10px] text-muted-foreground text-center py-4 border rounded bg-muted/20">
			⏸️ 监控已关闭，点击上方按钮开启
		</div>
	{:else if visibilityMonitor.info.totalItems > 0}
		<div class="border rounded p-2 space-y-2 text-[10px]">
			<!-- 当前路径 -->
			<div class="text-muted-foreground truncate" title={visibilityMonitor.info.currentPath}>
				📁 {visibilityMonitor.info.currentPath.split(/[/\\]/).pop() || '根目录'}
			</div>
			
			<!-- 可见范围 -->
			<div class="grid grid-cols-3 gap-2">
				<div class="text-center p-1 bg-muted/30 rounded">
					<div class="font-mono">{visibilityMonitor.info.visibleStart}</div>
					<div class="text-muted-foreground">起始</div>
				</div>
				<div class="text-center p-1 bg-primary/10 rounded">
					<div class="font-mono">{visibilityMonitor.info.visibleCount}</div>
					<div class="text-muted-foreground">可见</div>
				</div>
				<div class="text-center p-1 bg-muted/30 rounded">
					<div class="font-mono">{visibilityMonitor.info.totalItems}</div>
					<div class="text-muted-foreground">总数</div>
				</div>
			</div>
			
			<!-- 进度条 -->
			<div class="h-2 bg-muted rounded-full overflow-hidden">
				<div 
					class="h-full bg-primary transition-all duration-150"
					style="margin-left: {(visibilityMonitor.info.visibleStart / visibilityMonitor.info.totalItems) * 100}%; width: {(visibilityMonitor.info.visibleCount / visibilityMonitor.info.totalItems) * 100}%"
				></div>
			</div>
		</div>
	{:else}
		<div class="text-[10px] text-muted-foreground text-center py-4 border rounded bg-muted/20">
			📂 等待文件列表加载...
		</div>
	{/if}
</div>
