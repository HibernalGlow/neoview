<script lang="ts">
	/**
	 * NeoView - History Panel Component
	 * 历史记录面板 - 参考 NeeView HistoryPanel.cs
	 */
	import { Clock, X, Folder } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	interface HistoryEntry {
		path: string;
		timestamp: number;
		currentPage: number;
		totalPages: number;
		thumbnail?: string;
	}

	let history = $state<HistoryEntry[]>([]);

	function formatTime(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return '刚刚';
		if (minutes < 60) return `${minutes}分钟前`;
		if (hours < 24) return `${hours}小时前`;
		if (days < 7) return `${days}天前`;
		return new Date(timestamp).toLocaleDateString();
	}

	function getFileName(path: string): string {
		return path.split(/[\\/]/).pop() || path;
	}

	function openHistory(entry: HistoryEntry) {
		// TODO: 实现打开历史记录
		console.log('Opening:', entry.path);
	}

	function removeHistory(index: number) {
		history = history.filter((_, i) => i !== index);
		saveHistory();
	}

	function clearHistory() {
		if (confirm('确定要清除所有历史记录吗？')) {
			history = [];
			saveHistory();
		}
	}

	function saveHistory() {
		localStorage.setItem('neoview-history', JSON.stringify(history));
	}

	// 加载历史记录
	$effect(() => {
		const saved = localStorage.getItem('neoview-history');
		if (saved) {
			try {
				history = JSON.parse(saved);
			} catch (e) {
				console.error('Failed to load history:', e);
			}
		} else {
			// 示例数据
			history = [
				{
					path: 'C:\\Images\\Manga\\Volume 1',
					timestamp: Date.now() - 3600000,
					currentPage: 15,
					totalPages: 200
				},
				{
					path: 'C:\\Images\\Artbooks\\Collection.zip',
					timestamp: Date.now() - 86400000,
					currentPage: 45,
					totalPages: 120
				},
				{
					path: 'D:\\Downloads\\Comics\\Issue 1.cbz',
					timestamp: Date.now() - 172800000,
					currentPage: 8,
					totalPages: 32
				}
			];
		}
	});
</script>

<div class="h-full flex flex-col bg-background">
	<!-- 标题栏 -->
	<div class="p-4 border-b flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Clock class="h-5 w-5" />
			<h3 class="font-semibold">历史记录</h3>
		</div>
		<Button variant="ghost" size="sm" onclick={clearHistory}>
			清除全部
		</Button>
	</div>

	<!-- 历史列表 -->
	<div class="flex-1 overflow-auto">
		<div class="p-2 space-y-2">
			{#if history.length === 0}
				<div class="text-center py-8 text-muted-foreground">
					<Clock class="h-12 w-12 mx-auto mb-2 opacity-50" />
					<p>暂无历史记录</p>
				</div>
			{:else}
				{#each history as entry, index (entry.path + entry.timestamp)}
					<button
						class="group relative w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors cursor-pointer"
						onclick={() => openHistory(entry)}
					>
						<div class="flex items-start gap-3">
							<!-- 缩略图占位 -->
							<div class="flex-shrink-0 w-16 h-20 bg-secondary rounded flex items-center justify-center">
								<Folder class="h-8 w-8 text-muted-foreground" />
							</div>

							<!-- 信息 -->
							<div class="flex-1 min-w-0">
								<div class="font-medium truncate" title={entry.path}>
									{getFileName(entry.path)}
								</div>
								<div class="text-sm text-muted-foreground mt-1">
									页码: {entry.currentPage}/{entry.totalPages}
								</div>
								<div class="text-xs text-muted-foreground mt-1">
									{formatTime(entry.timestamp)}
								</div>
							</div>

							<!-- 删除按钮 -->
							<Button
								variant="ghost"
								size="icon"
								class="opacity-0 group-hover:opacity-100 transition-opacity"
								onclick={(e) => {
									e.stopPropagation();
									removeHistory(index);
								}}
							>
								<X class="h-4 w-4" />
							</Button>
						</div>

						<!-- 进度条 -->
						<div class="mt-2 h-1 bg-secondary rounded-full overflow-hidden">
							<div
								class="h-full bg-primary transition-all"
								style="width: {(entry.currentPage / entry.totalPages) * 100}%"
							></div>
						</div>
					</button>
				{/each}
			{/if}
		</div>
	</div>
</div>
