<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Activity,
		AlertTriangle,
		CheckCircle2,
		Clock3,
		Database,
		Layers3,
		LoaderCircle,
		Search,
		Sparkles,
		X
	} from '@lucide/svelte';

	import { Button } from '$lib/components/ui/button';
	import { Progress } from '$lib/components/ui/progress';
	import {
		taskScheduler,
		type TaskSchedulerMetrics,
		type TaskSnapshot
	} from '$lib/core/tasks/taskScheduler';
	import {
		fetchBackgroundQueueMetrics,
		type BackgroundQueueMetrics
	} from '$lib/api/backgroundTasks';
	import { getIndexProgress, type IndexProgress } from '$lib/api/file_index';
	import { upscaleStore } from '$lib/stackview/stores/upscaleStore.svelte';

	type WorkflowStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed';

	interface WorkflowSummary {
		id: 'scheduler' | 'upscale' | 'background' | 'index';
		title: string;
		description: string;
		status: WorkflowStatus;
		progress: number | null;
		running: number;
		queued: number;
		completed: number;
		failed: number;
		details: string[];
	}

	const emptyMetrics: TaskSchedulerMetrics = {
		queueDepth: { current: 0, forward: 0, backward: 0, background: 0 },
		running: 0,
		concurrency: 0,
		updatedAt: Date.now()
	};

	let expanded = $state(false);
	let schedulerMetrics = $state<TaskSchedulerMetrics>(emptyMetrics);
	let activeSchedulerTasks = $state<TaskSnapshot[]>([]);
	let queuedSchedulerTasks = $state<TaskSnapshot[]>([]);
	let recentSchedulerTasks = $state<TaskSnapshot[]>([]);
	let backgroundMetrics = $state<BackgroundQueueMetrics | null>(null);
	let indexProgress = $state<IndexProgress | null>(null);

	function clampPercent(value: number): number {
		if (!Number.isFinite(value)) return 0;
		return Math.max(0, Math.min(100, value));
	}

	function sumQueueDepth(metrics: TaskSchedulerMetrics): number {
		return Object.values(metrics.queueDepth).reduce((total, value) => total + value, 0);
	}

	function refreshSchedulerTasks(): void {
		activeSchedulerTasks = taskScheduler.getActiveTasks();
		queuedSchedulerTasks = taskScheduler.getQueuedTasks();
	}

	function rememberSchedulerTask(snapshot: TaskSnapshot): void {
		recentSchedulerTasks = [
			snapshot,
			...recentSchedulerTasks.filter((task) => task.id !== snapshot.id)
		].slice(0, 8);
	}

	async function pollExternalWorkflows(): Promise<void> {
		const [backgroundResult, indexResult] = await Promise.allSettled([
			fetchBackgroundQueueMetrics(),
			getIndexProgress()
		]);

		if (backgroundResult.status === 'fulfilled') {
			backgroundMetrics = backgroundResult.value;
		}

		if (indexResult.status === 'fulfilled') {
			indexProgress = indexResult.value;
		}
	}

	function getStatusLabel(status: WorkflowStatus | TaskSnapshot['status']): string {
		switch (status) {
			case 'running':
				return '运行中';
			case 'queued':
				return '排队中';
			case 'completed':
				return '已完成';
			case 'failed':
				return '有失败';
			case 'cancelled':
				return '已取消';
			default:
				return '空闲';
		}
	}

	function getStatusClass(status: WorkflowStatus): string {
		switch (status) {
			case 'running':
				return 'bg-primary text-primary-foreground';
			case 'queued':
				return 'bg-amber-500/15 text-amber-600 dark:text-amber-300';
			case 'failed':
				return 'bg-destructive/15 text-destructive';
			case 'completed':
				return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300';
			default:
				return 'bg-muted text-muted-foreground';
		}
	}

	function formatCount(value: number): string {
		return Number.isFinite(value) ? String(value) : '0';
	}

	function formatTaskLabel(task: TaskSnapshot): string {
		const pages = task.pageIndices?.length
			? ` · 页 ${task.pageIndices.map((page) => page + 1).join(',')}`
			: '';
		return `${task.type}${pages}`;
	}

	let schedulerWorkflow = $derived.by<WorkflowSummary>(() => {
		const queued = sumQueueDepth(schedulerMetrics);
		const running = schedulerMetrics.running || activeSchedulerTasks.length;
		const failed = recentSchedulerTasks.filter((task) => task.status === 'failed').length;
		const completed = recentSchedulerTasks.filter((task) => task.status === 'completed').length;
		const status: WorkflowStatus = running > 0 ? 'running' : queued > 0 ? 'queued' : 'idle';

		return {
			id: 'scheduler',
			title: '任务调度',
			description: '前端队列与阅读预热任务',
			status,
			progress: null,
			running,
			queued,
			completed,
			failed,
			details: [
				`并发 ${formatCount(running)} / ${formatCount(schedulerMetrics.concurrency)}`,
				`当前 ${schedulerMetrics.queueDepth.current} · 向后 ${schedulerMetrics.queueDepth.forward} · 向前 ${schedulerMetrics.queueDepth.backward} · 后台 ${schedulerMetrics.queueDepth.background}`
			]
		};
	});

	let upscaleWorkflow = $derived.by<WorkflowSummary>(() => {
		void upscaleStore.version;
		const stats = upscaleStore.stats;
		const queued = stats.pendingTasks;
		const running = stats.processingTasks;
		const completed = stats.completedCount + stats.skippedCount;
		const failed = stats.failedCount;
		const total = queued + running + completed + failed;
		const progress = total > 0 ? clampPercent(((completed + failed) / total) * 100) : null;
		const status: WorkflowStatus =
			running > 0 ? 'running' : queued > 0 ? 'queued' : failed > 0 ? 'failed' : 'idle';

		return {
			id: 'upscale',
			title: '超分工作流',
			description: upscaleStore.enabled ? '自动/渐进超分队列' : '未启用',
			status,
			progress,
			running,
			queued,
			completed,
			failed,
			details: [
				`完成 ${stats.completedCount} · 跳过 ${stats.skippedCount} · 失败 ${stats.failedCount}`,
				`等待均值 ${Math.round(stats.queueWaitAvgMs)}ms · 最大 ${Math.round(stats.queueWaitMaxMs)}ms`
			]
		};
	});

	let backgroundWorkflow = $derived.by<WorkflowSummary | null>(() => {
		if (!backgroundMetrics) return null;

		const queued = backgroundMetrics.queueDepth;
		const running = backgroundMetrics.running;
		const completed = backgroundMetrics.completed;
		const failed = backgroundMetrics.failed;
		const total = queued + running + completed + failed;
		const progress = total > 0 ? clampPercent(((completed + failed) / total) * 100) : null;
		const status: WorkflowStatus =
			running > 0 ? 'running' : queued > 0 ? 'queued' : failed > 0 ? 'failed' : 'idle';
		const latest = backgroundMetrics.recentTasks[0];

		return {
			id: 'background',
			title: '后台缓存',
			description: latest ? `${latest.jobType} · ${latest.source}` : '缩略图与缓存维护',
			status,
			progress,
			running,
			queued,
			completed,
			failed,
			details: [
				`完成 ${completed} · 失败 ${failed}`,
				latest ? `最近 ${latest.status} · ${Math.round(latest.durationMs)}ms` : '暂无最近任务'
			]
		};
	});

	let indexWorkflow = $derived.by<WorkflowSummary | null>(() => {
		if (!indexProgress) return null;

		const running = indexProgress.isRunning ? 1 : 0;
		const queued = 0;
		const completed = indexProgress.isRunning ? indexProgress.processedFiles : indexProgress.totalFiles;
		const failed = 0;
		const progress =
			indexProgress.totalFiles > 0
				? clampPercent((indexProgress.processedFiles / indexProgress.totalFiles) * 100)
				: null;
		const status: WorkflowStatus = indexProgress.isRunning ? 'running' : 'idle';

		return {
			id: 'index',
			title: '文件索引',
			description: indexProgress.currentPath || '索引扫描',
			status,
			progress,
			running,
			queued,
			completed,
			failed,
			details: [
				`${indexProgress.processedFiles} / ${indexProgress.totalFiles} 文件`,
				indexProgress.currentPath || '未在扫描'
			]
		};
	});

	let workflowSummaries = $derived.by<WorkflowSummary[]>(() => {
		const workflows: WorkflowSummary[] = [schedulerWorkflow, upscaleWorkflow];
		if (backgroundWorkflow) workflows.push(backgroundWorkflow);
		if (indexWorkflow) workflows.push(indexWorkflow);
		return workflows;
	});

	let runningCount = $derived(
		workflowSummaries.reduce((total, workflow) => total + workflow.running, 0)
	);
	let queuedCount = $derived(
		workflowSummaries.reduce((total, workflow) => total + workflow.queued, 0)
	);
	let failedCount = $derived(
		workflowSummaries.reduce((total, workflow) => total + workflow.failed, 0)
	);
	let activeWorkflowCount = $derived(
		workflowSummaries.filter(
			(workflow) => workflow.status === 'running' || workflow.status === 'queued'
		).length
	);
	let overallProgress = $derived.by<number | null>(() => {
		const candidates = workflowSummaries.filter(
			(workflow) =>
				(workflow.status === 'running' || workflow.status === 'queued') &&
				workflow.progress !== null
		);
		if (candidates.length === 0) return null;
		const total = candidates.reduce((sum, workflow) => sum + (workflow.progress ?? 0), 0);
		return clampPercent(total / candidates.length);
	});
	let previewLabel = $derived.by(() => {
		if (runningCount > 0 || queuedCount > 0) {
			return `${runningCount} 运行 / ${queuedCount} 排队`;
		}
		if (failedCount > 0) {
			return `${failedCount} 失败`;
		}
		return '空闲';
	});
	let previewProgressStyle = $derived.by(() => {
		const value = overallProgress ?? (activeWorkflowCount > 0 ? 35 : 100);
		const color =
			failedCount > 0 && activeWorkflowCount === 0
				? 'hsl(var(--destructive))'
				: activeWorkflowCount > 0
					? 'hsl(var(--primary))'
					: 'hsl(var(--muted-foreground))';
		return `background: conic-gradient(${color} ${value * 3.6}deg, hsl(var(--border) / 0.55) 0deg);`;
	});

	function stopGlobalInput(e: Event): void {
		e.stopPropagation();
	}

	onMount(() => {
		refreshSchedulerTasks();

		const unsubscribeTask = taskScheduler.subscribe((snapshot) => {
			rememberSchedulerTask(snapshot);
			refreshSchedulerTasks();
		});
		const unsubscribeMetrics = taskScheduler.subscribeMetrics((metrics) => {
			schedulerMetrics = metrics;
			refreshSchedulerTasks();
		});

		void pollExternalWorkflows();
		const pollTimer = setInterval(() => {
			void pollExternalWorkflows();
		}, 2500);

		return () => {
			unsubscribeTask();
			unsubscribeMetrics();
			clearInterval(pollTimer);
		};
	});
</script>

<div
	class="fixed right-4 bottom-4 z-[120] pointer-events-auto"
	onclick={stopGlobalInput}
	onmousedown={stopGlobalInput}
	onpointerdown={stopGlobalInput}
	onwheel={stopGlobalInput}
	onkeydown={(e) => {
		stopGlobalInput(e);
		if (e.key === 'Escape') expanded = false;
	}}
	role="presentation"
>
	{#if expanded}
		<section
			class="bg-card/95 text-card-foreground border-border/70 w-[min(380px,calc(100vw-2rem))] rounded-lg border shadow-2xl backdrop-blur-xl"
			aria-label="工作流进度"
			tabindex="-1"
		>
			<header class="border-border/50 flex items-center justify-between border-b px-3 py-2">
				<div class="flex min-w-0 items-center gap-2">
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
						style={previewProgressStyle}
						aria-hidden="true"
					>
						<div class="bg-card flex h-6 w-6 items-center justify-center rounded-sm">
							<Activity class="h-3.5 w-3.5" />
						</div>
					</div>
					<div class="min-w-0">
						<div class="truncate text-sm font-semibold">工作流进度</div>
						<div class="text-muted-foreground truncate text-[11px]">{previewLabel}</div>
					</div>
				</div>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7 shrink-0"
					aria-label="关闭工作流进度"
					onclick={() => (expanded = false)}
				>
					<X class="h-4 w-4" />
				</Button>
			</header>

			<div class="max-h-[58vh] space-y-2 overflow-y-auto p-2">
				{#each workflowSummaries as workflow (workflow.id)}
					<article class="border-border/60 bg-background/45 rounded-md border p-2.5">
						<div class="flex items-start justify-between gap-2">
							<div class="flex min-w-0 items-start gap-2">
								<div class="bg-muted/80 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
									{#if workflow.id === 'scheduler'}
										<Layers3 class="h-3.5 w-3.5" />
									{:else if workflow.id === 'upscale'}
										<Sparkles class="h-3.5 w-3.5" />
									{:else if workflow.id === 'background'}
										<Database class="h-3.5 w-3.5" />
									{:else}
										<Search class="h-3.5 w-3.5" />
									{/if}
								</div>
								<div class="min-w-0">
									<div class="flex min-w-0 items-center gap-2">
										<h3 class="truncate text-xs font-semibold">{workflow.title}</h3>
										<span
											class="rounded-sm px-1.5 py-0.5 text-[10px] font-medium {getStatusClass(
												workflow.status
											)}"
										>
											{getStatusLabel(workflow.status)}
										</span>
									</div>
									<p class="text-muted-foreground mt-0.5 truncate text-[11px]">
										{workflow.description}
									</p>
								</div>
							</div>

							<div class="text-muted-foreground flex shrink-0 items-center gap-1 text-[10px]">
								{#if workflow.status === 'running'}
									<LoaderCircle class="h-3 w-3 animate-spin" />
								{:else if workflow.status === 'queued'}
									<Clock3 class="h-3 w-3" />
								{:else if workflow.status === 'failed'}
									<AlertTriangle class="h-3 w-3" />
								{:else}
									<CheckCircle2 class="h-3 w-3" />
								{/if}
								<span>{workflow.running}/{workflow.queued}</span>
							</div>
						</div>

						<div class="mt-2">
							{#if workflow.progress !== null}
								<div class="mb-1 flex items-center justify-between text-[10px]">
									<span class="text-muted-foreground">进度</span>
									<span class="font-mono">{Math.round(workflow.progress)}%</span>
								</div>
								<Progress value={workflow.progress} class="h-1.5" />
							{:else}
								<div class="bg-muted/70 h-1.5 overflow-hidden rounded-full">
									<div
										class="bg-primary/70 h-full w-1/3 rounded-full {workflow.status === 'running'
											? 'animate-pulse'
											: ''}"
									></div>
								</div>
							{/if}
						</div>

						<div class="text-muted-foreground mt-2 space-y-0.5 text-[10px] leading-relaxed">
							{#each workflow.details as detail}
								<div class="truncate">{detail}</div>
							{/each}
						</div>
					</article>
				{/each}

				{#if recentSchedulerTasks.length > 0}
					<div class="border-border/50 border-t pt-2">
						<div class="text-muted-foreground mb-1 px-1 text-[10px] font-medium">最近任务</div>
						<div class="space-y-1">
							{#each recentSchedulerTasks.slice(0, 5) as task (task.id)}
								<div
									class="bg-muted/45 flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[10px]"
								>
									<span class="truncate">{formatTaskLabel(task)}</span>
									<span class="text-muted-foreground shrink-0">{getStatusLabel(task.status)}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</section>
	{:else}
		<button
			class="bg-card/90 text-card-foreground border-border/70 hover:bg-card flex h-11 max-w-[min(320px,calc(100vw-2rem))] items-center gap-2 rounded-lg border px-2.5 shadow-xl backdrop-blur-xl transition-colors"
			type="button"
			aria-label="工作流进度"
			onclick={() => (expanded = true)}
		>
			<div
				class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
				style={previewProgressStyle}
				aria-hidden="true"
			>
				<div class="bg-card flex h-5 w-5 items-center justify-center rounded-sm">
					{#if activeWorkflowCount > 0}
						<LoaderCircle class="h-3 w-3 animate-spin" />
					{:else if failedCount > 0}
						<AlertTriangle class="h-3 w-3" />
					{:else}
						<Activity class="h-3 w-3" />
					{/if}
				</div>
			</div>
			<div class="min-w-0 text-left">
				<div class="text-xs font-semibold leading-tight">工作流</div>
				<div class="text-muted-foreground truncate text-[10px] leading-tight">{previewLabel}</div>
			</div>
		</button>
	{/if}
</div>
