<script lang="ts">
	import { get } from 'svelte/store';
	import { upscaleState } from '$lib/stores/upscale/state';

	export interface PreloadTask {
		data: string;
		hash: string;
		pageIndex: number;
	}

	export interface CompletedPreloadEntry {
		seq: number;
		success: boolean;
		res?: {
			res: any;
			task: PreloadTask;
		};
		err?: unknown;
	}

	export let preloadQueue: PreloadTask[] = [];
	export let preloadingWorkerRunning = false;
	export let completedPreloadResults = new Map<number, CompletedPreloadEntry>();
	export let nextApplySeq = 0;

	export let triggerAutoUpscale: (task: PreloadTask, isPreload?: boolean) => Promise<any>;
	export let updatePreUpscaleProgress: (pageIndex: number) => void;
	export let onPreloadResult?: (hash: string, res: { url: string; blob: Blob }) => void;
	export let onPreloadError?: (error: unknown) => void;
	export let onPreloadTaskFailed?: (task: PreloadTask, error: unknown) => void;
	export let onQueueEmpty?: () => void;
	export let onQueueUpdated?: (queue: PreloadTask[]) => void;
	export let onQueueProcessing?: (task: PreloadTask) => void;
	export let onQueueIdle?: () => void;

	export function setQueue(queue: PreloadTask[]) {
		preloadQueue = queue;
		onQueueUpdated?.(preloadQueue);
	}

	export function enqueueTask(task: PreloadTask) {
		preloadQueue = [...preloadQueue, task];
		onQueueUpdated?.(preloadQueue);
	}

	export function dequeueTask(): PreloadTask | undefined {
		if (preloadQueue.length === 0) return undefined;
		const [first, ...rest] = preloadQueue;
		preloadQueue = rest;
		onQueueUpdated?.(preloadQueue);
		return first;
}

	export async function processCompletedPreloadResults() {
		const seq = nextApplySeq + 1;
		const entry = completedPreloadResults.get(seq);
		if (!entry) {
			return;
		}
		completedPreloadResults.delete(seq);
		nextApplySeq = seq;

		if (!entry.success) {
			onPreloadError?.(entry.err);
			return;
		}

		const result = entry.res;
		if (!result || !result.task) {
			return;
		}

		if (result.res && result.res.upscaledImageBlob && result.res.upscaledImageData) {
			onPreloadResult?.(result.task.hash, {
				s url: result.res.upscaledImageData,
				blob: result.res.upscaledImageBlob
			});
		}

		updatePreUpscaleProgress(result.task.pageIndex);
	}

	export async function processNextInQueue() {
		if (preloadQueue.length === 0) {
			onQueueEmpty?.();
			return;
		}

		if (preloadingWorkerRunning) {
			onQueueProcessing?.(preloadQueue[0]);
			return;
		}

		const currentState = get(upscaleState);
		if (currentState?.isUpscaling) {
			onQueueProcessing?.(preloadQueue[0]);
			return;
		}

		const nextTask = dequeueTask();
		if (!nextTask) {
			onQueueEmpty?.();
			return;
		}

		preloadingWorkerRunning = true;

		try {
			onQueueProcessing?.(nextTask);
			const res = await triggerAutoUpscale(nextTask, true);
			if (res && res.requeue) {
				enqueueTask(nextTask);
				setTimeout(() => {
					preloadingWorkerRunning = false;
					processNextInQueue();
				}, 200);
				return;
			}

			if (res) {
				const seq = nextApplySeq + completedPreloadResults.size + 1;
				completedPreloadResults.set(seq, {
					seq,
					success: true,
					res: {
						res,
						task: nextTask
					}
				});
			}
		} catch (error) {
			onPreloadTaskFailed?.(nextTask, error);
		} finally {
			preloadingWorkerRunning = false;
		}

		if (preloadQueue.length > 0) {
			setTimeout(() => processNextInQueue(), 50);
		} else {
			onQueueIdle?.();
		}
}
</script>
