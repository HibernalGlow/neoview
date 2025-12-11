<script lang="ts">
	/**
	 * GPU 监控组件
	 * 注：GPU 监控需要后端 sysinfo 扩展支持，当前显示占位信息
	 */
	import { Cpu } from '@lucide/svelte';
</script>

<div class="bg-muted/50 rounded p-3">
	<div class="mb-3 flex items-center gap-2">
		<Cpu class="text-primary h-4 w-4" />
		<span class="text-sm font-semibold">GPU</span>
	</div>

	<div class="text-muted-foreground py-4 text-center text-xs">
		GPU 监控功能开发中...
		<br />
		需要后端支持
	</div>
</div>
