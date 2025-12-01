<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { HardDrive, Trash2 } from '@lucide/svelte';
	import { createEventDispatcher } from 'svelte';

	type CacheStats = {
		totalFiles: number;
		totalSize: number;
		cacheDir?: string;
	};

	let {
		cacheStats = { totalFiles: 0, totalSize: 0 },
		formattedSize = '0 B'
	} = $props();

	const dispatch = createEventDispatcher();

	function handleClear() {
		dispatch('clear');
	}
</script>

<div class="space-y-2">
	<div class="info-grid">
		<div class="info-item">
			<span class="info-label">文件数：</span>
			<span class="info-value">{cacheStats.totalFiles}</span>
		</div>
		<div class="info-item">
			<span class="info-label">总大小：</span>
			<span class="info-value">{formattedSize}</span>
		</div>
	</div>

	<Button onclick={handleClear} class="w-full mt-2" variant="outline">
		<Trash2 class="w-4 h-4 mr-2" />
		清理缓存 (30天前)
	</Button>
</div>

<style>
	.info-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.info-label {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.info-value {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}
</style>
