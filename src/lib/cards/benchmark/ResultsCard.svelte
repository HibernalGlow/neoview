<script lang="ts">
/**
 * 测试结果卡片
 * 显示批量测试的结果列表
 */

// 此卡片依赖其他卡片产生的结果数据
// 在完全迁移到 CardRenderer 后，需要通过共享 store 访问数据
</script>

<div class="space-y-2 text-[10px]">
	<p class="text-muted-foreground">
		测试结果将在运行基准测试后显示
	</p>
	<div class="text-center py-4 border rounded bg-muted/20">
		<p class="text-muted-foreground">📊 暂无测试结果</p>
		<p class="text-[9px] text-muted-foreground mt-1">请先在其他卡片中运行测试</p>
	</div>
</div>
