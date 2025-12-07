<script lang="ts">
	/**
	 * IO 监控组件
	 * 显示网络和磁盘 IO 统计
	 */
	import { HardDrive, Network } from '@lucide/svelte';

	interface Props {
		networkRx: number;
		networkTx: number;
		diskTotal: number;
		diskUsed: number;
		diskFree: number;
	}

	let { networkRx, networkTx, diskTotal, diskUsed, diskFree }: Props = $props();

	// 计算磁盘使用百分比
	const diskPercentage = $derived((diskUsed / diskTotal) * 100);

	// 格式化字节大小
	function formatBytes(bytes: number): string {
		const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
		let size = bytes;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}

		return `${size.toFixed(1)} ${units[unitIndex]}`;
	}

	// 格式化存储大小
	function formatStorageSize(bytes: number): string {
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		let size = bytes;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}

		return `${size.toFixed(1)} ${units[unitIndex]}`;
	}
</script>

<div class="space-y-3">
	<!-- 网络 IO -->
	<div class="bg-muted/50 rounded p-3">
		<div class="mb-3 flex items-center gap-2">
			<Network class="text-primary h-4 w-4" />
			<span class="text-sm font-semibold">网络</span>
		</div>

		<div class="grid grid-cols-2 gap-3 text-xs">
			<div class="bg-muted/50 rounded p-2">
				<div class="text-muted-foreground mb-1">下载速度</div>
				<div class="text-primary font-mono font-semibold">
					↓ {formatBytes(networkRx)}
				</div>
			</div>
			<div class="bg-muted/50 rounded p-2">
				<div class="text-muted-foreground mb-1">上传速度</div>
				<div class="text-primary font-mono font-semibold">
					↑ {formatBytes(networkTx)}
				</div>
			</div>
		</div>
	</div>

	<!-- 磁盘 IO -->
	<div class="bg-muted/50 rounded p-3">
		<div class="mb-3 flex items-center justify-between">
			<div class="flex items-center gap-2">
				<HardDrive class="text-primary h-4 w-4" />
				<span class="text-sm font-semibold">磁盘</span>
			</div>
			<span class="text-primary font-mono text-sm font-bold">
				{Math.round(diskPercentage)}%
			</span>
		</div>

		<!-- 磁盘使用进度条 -->
		<div class="mb-3">
			<div class="bg-muted h-2 overflow-hidden rounded-full">
				<div class="bg-primary h-full transition-all" style:width={`${diskPercentage}%`}></div>
			</div>
		</div>

		<!-- 磁盘详细信息 -->
		<div class="grid grid-cols-3 gap-2 text-xs">
			<div class="text-center">
				<div class="text-muted-foreground mb-1">总计</div>
				<div class="font-mono">{formatStorageSize(diskTotal)}</div>
			</div>
			<div class="text-center">
				<div class="text-muted-foreground mb-1">已用</div>
				<div class="font-mono">{formatStorageSize(diskUsed)}</div>
			</div>
			<div class="text-center">
				<div class="text-muted-foreground mb-1">可用</div>
				<div class="font-mono">{formatStorageSize(diskFree)}</div>
			</div>
		</div>
	</div>
</div>
