<script lang="ts">
/**
 * 性能统计卡片
 * 显示测试结果的统计摘要
 */

// 此卡片依赖其他卡片产生的结果数据
// 在完全迁移到 CardRenderer 后，需要通过共享 store 访问数据
</script>

<div class="space-y-2 text-[10px]">
	<p class="text-muted-foreground">
		性能统计将在运行测试后显示
	</p>
	<div class="text-center py-4 border rounded bg-muted/20">
		<p class="text-muted-foreground">📈 暂无统计数据</p>
		<p class="text-[9px] text-muted-foreground mt-1">运行测试后显示排名和对比</p>
	</div>
</div>
