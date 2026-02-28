<script lang="ts">
	import { AlertTriangle, ShieldAlert } from '@lucide/svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { settingsManager } from '$lib/settings/settingsManager';

	let settings = $state(settingsManager.getSettings());

	settingsManager.addListener((next) => {
		settings = next;
	});

	function toggleAllowFileOps(value: boolean) {
		settingsManager.updateNestedSettings('archive', {
			allowFileOperations: value
		});
	}

	function toggleConfirmBeforeDelete(value: boolean) {
		settingsManager.updateNestedSettings('archive', {
			confirmBeforeDelete: value
		});
	}
</script>

<div class="space-y-6 p-6">
	<div class="space-y-2">
		<h3 class="text-lg font-semibold flex items-center gap-2">
			<ShieldAlert class="h-5 w-5 text-destructive" />
			压缩包操作
		</h3>
		<p class="text-sm text-muted-foreground">
			开启后可以直接对 ZIP／CBZ 等压缩书籍执行删除等写操作。此功能会在磁盘上重写压缩包，存在不可逆风险。
		</p>
	</div>

	<div class="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm leading-relaxed text-destructive">
		<div class="flex items-center gap-2 pb-1">
			<AlertTriangle class="h-4 w-4" />
			<span class="font-semibold">启用前请确认</span>
		</div>
		<ul class="list-disc pl-5 text-destructive/90">
			<li>删除操作会永久修改原始压缩包，无法撤销。</li>
			<li>建议提前备份文件，或在副本上测试。</li>
			<li>ZIP 重写过程可能耗时，过程中请勿终止应用。</li>
		</ul>
	</div>

	<div class="space-y-4">
		<div class="flex items-center justify-between gap-4">
			<div>
				<Label class="text-sm font-semibold">允许压缩包文件操作（实验特性）</Label>
				<p class="text-xs text-muted-foreground">开启后可通过操作绑定删除当前 ZIP 页等写操作。</p>
			</div>
			<Switch
				bind:checked={settings.archive.allowFileOperations}
				onCheckedChange={(checked) => toggleAllowFileOps(checked)}
			/>
		</div>

		<div class="flex items-center justify-between gap-4">
			<div>
				<Label class="text-sm font-semibold">删除前显示确认</Label>
				<p class="text-xs text-muted-foreground">执行 deleteCurrentPage 时弹出二次确认，防止误删。</p>
			</div>
			<Switch
				bind:checked={settings.archive.confirmBeforeDelete}
				onCheckedChange={(checked) => toggleConfirmBeforeDelete(checked)}
			/>
		</div>
	</div>

	<div class="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
		如需恢复默认设置，可在页面底部使用“重置设置”按钮，或在数据面板中导入备份。
	</div>
</div>
