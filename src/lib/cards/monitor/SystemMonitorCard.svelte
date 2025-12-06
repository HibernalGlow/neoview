<script lang="ts">
	/**
	 * 系统监控卡片
	 * 实时监控 CPU、内存、GPU、IO 等系统资源使用情况
	 */
	import { onMount, onDestroy } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import CpuMonitor from './components/CpuMonitor.svelte';
	import MemoryMonitor from './components/MemoryMonitor.svelte';
	import IoMonitor from './components/IoMonitor.svelte';
	import GpuMonitor from './components/GpuMonitor.svelte';
	import { RefreshCw, Activity } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	// 系统统计数据接口
	interface SystemStats {
		cpu_usage: number[];
		memory_total: number;
		memory_used: number;
		memory_free: number;
		memory_cached: number;
		uptime: number;
		load_avg: [number, number, number];
		network_rx_bytes: number;
		network_tx_bytes: number;
		disk_total_bytes: number;
		disk_used_bytes: number;
		disk_free_bytes: number;
	}

	// 状态变量
	let stats = $state<SystemStats | null>(null);
	let isMonitoring = $state(false);
	let refreshInterval = $state(1000); // 默认 1 秒刷新一次
	let intervalId: number | null = null;
	let error = $state<string | null>(null);

	// 获取系统统计数据
	async function fetchSystemStats() {
		try {
			const result = await invoke<SystemStats>('get_system_stats');
			stats = result;
			error = null;
		} catch (e) {
			console.error('获取系统统计数据失败:', e);
			error = String(e);
		}
	}

	// 开始监控
	function startMonitoring() {
		if (isMonitoring) return;

		isMonitoring = true;
		fetchSystemStats(); // 立即获取一次

		intervalId = window.setInterval(() => {
			fetchSystemStats();
		}, refreshInterval);
	}

	// 停止监控
	function stopMonitoring() {
		if (!isMonitoring) return;

		isMonitoring = false;
		if (intervalId !== null) {
			clearInterval(intervalId);
			intervalId = null;
		}
	}

	// 切换监控状态
	function toggleMonitoring() {
		if (isMonitoring) {
			stopMonitoring();
		} else {
			startMonitoring();
		}
	}

	// 手动刷新
	async function handleRefresh() {
		await fetchSystemStats();
	}

	// 生命周期
	onMount(() => {
		// 默认启动监控
		startMonitoring();
	});

	onDestroy(() => {
		stopMonitoring();
	});

	// 格式化时间
	function formatUptime(seconds: number): string {
		const days = Math.floor(seconds / 86400);
		const hours = Math.floor((seconds % 86400) / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);

		if (days > 0) return `${days}天 ${hours}小时`;
		if (hours > 0) return `${hours}小时 ${minutes}分钟`;
		return `${minutes}分钟`;
	}
</script>

<div class="space-y-3">
	<!-- 控制栏 -->
	<div class="flex items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<Button
				variant={isMonitoring ? 'destructive' : 'default'}
				size="sm"
				onclick={toggleMonitoring}
			>
				<Activity class="mr-1 h-4 w-4" />
				{isMonitoring ? '停止监控' : '开始监控'}
			</Button>
			<Button variant="outline" size="sm" onclick={handleRefresh} disabled={!stats}>
				<RefreshCw class="mr-1 h-4 w-4" />
				刷新
			</Button>
		</div>

		<!-- 刷新间隔选择 -->
		<div class="flex items-center gap-2">
			<span class="text-muted-foreground text-xs">刷新间隔:</span>
			<select
				bind:value={refreshInterval}
				class="bg-background rounded border px-2 py-1 text-xs"
				onchange={() => {
					if (isMonitoring) {
						stopMonitoring();
						startMonitoring();
					}
				}}
			>
				<option value={500}>0.5秒</option>
				<option value={1000}>1秒</option>
				<option value={2000}>2秒</option>
				<option value={5000}>5秒</option>
			</select>
		</div>
	</div>

	<!-- 错误提示 -->
	{#if error}
		<div class="bg-destructive/10 text-destructive rounded p-2 text-xs">
			{error}
		</div>
	{/if}

	<!-- 系统信息总览 -->
	{#if stats}
		<div class="grid grid-cols-3 gap-2 text-xs">
			<div class="bg-muted/50 rounded p-2">
				<div class="text-muted-foreground mb-1">系统运行时间</div>
				<div class="font-mono font-semibold">{formatUptime(stats.uptime)}</div>
			</div>
			<div class="bg-muted/50 rounded p-2">
				<div class="text-muted-foreground mb-1">负载平均</div>
				<div class="font-mono text-[10px]">
					{stats.load_avg[0].toFixed(2)} / {stats.load_avg[1].toFixed(2)} / {stats.load_avg[2].toFixed(
						2
					)}
				</div>
			</div>
			<div class="bg-muted/50 rounded p-2">
				<div class="text-muted-foreground mb-1">CPU 核心</div>
				<div class="font-mono font-semibold">{stats.cpu_usage.length} 核</div>
			</div>
		</div>

		<!-- CPU 监控 -->
		<CpuMonitor cpuUsage={stats.cpu_usage} />

		<!-- 内存监控 -->
		<MemoryMonitor
			memoryTotal={stats.memory_total}
			memoryUsed={stats.memory_used}
			memoryFree={stats.memory_free}
			memoryCached={stats.memory_cached}
		/>

		<!-- IO 监控 -->
		<IoMonitor
			networkRx={stats.network_rx_bytes}
			networkTx={stats.network_tx_bytes}
			diskTotal={stats.disk_total_bytes}
			diskUsed={stats.disk_used_bytes}
			diskFree={stats.disk_free_bytes}
		/>

		<!-- GPU 监控 (TODO: 需要后端支持) -->
		<GpuMonitor />
	{:else}
		<div class="text-muted-foreground py-8 text-center">
			{isMonitoring ? '加载中...' : '点击"开始监控"查看系统状态'}
		</div>
	{/if}
</div>
