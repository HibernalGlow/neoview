export interface PreloadTask {
	data?: string;
	blob?: Blob;
	hash: string;
	pageIndex: number;
}

export interface PreloadTaskResult {
	requeue?: boolean;
}

export interface PreloadWorkerOptions<Result extends PreloadTaskResult = PreloadTaskResult> {
	concurrency?: () => number;
	runTask: (task: PreloadTask) => Promise<Result | undefined>;
	onTaskSuccess: (task: PreloadTask, result: Result | undefined) => void;
	onTaskFailure?: (task: PreloadTask, error: unknown) => void;
	onStateChange?: (state: { running: number; queued: number }) => void;
	dedupeKey?: (task: PreloadTask) => string;
	retryDelayMs?: number;
}

export interface PreloadWorker {
	enqueue(task: PreloadTask): void;
	clear(): void;
	notifyIdle(): void;
	isRunning(): boolean;
	pending(): number;
}

interface InternalState<Result extends PreloadTaskResult> {
	queue: PreloadTask[];
	queuedKeys: Set<string>;
	activeKeys: Set<string>;
	running: number;
	scheduleTimer: ReturnType<typeof setTimeout> | null;
	opts: Required<Pick<PreloadWorkerOptions<Result>, 'concurrency' | 'runTask' | 'onTaskSuccess'>> & Omit<PreloadWorkerOptions<Result>, 'concurrency' | 'runTask' | 'onTaskSuccess'> & {
		retryDelayMs: number;
	};
}

export function createPreloadWorker<Result extends PreloadTaskResult = PreloadTaskResult>(
	options: PreloadWorkerOptions<Result>
): PreloadWorker {
	const opts: InternalState<Result>['opts'] = {
		concurrency: options.concurrency ?? (() => 1),
		runTask: options.runTask,
		onTaskSuccess: options.onTaskSuccess,
		onTaskFailure: options.onTaskFailure,
		onStateChange: options.onStateChange,
		dedupeKey: options.dedupeKey,
		retryDelayMs: options.retryDelayMs ?? 200
	};

	const state: InternalState<Result> = {
		queue: [],
		queuedKeys: new Set(),
		activeKeys: new Set(),
		running: 0,
		scheduleTimer: null,
		opts: opts
	};

	const keyOf = (task: PreloadTask) => state.opts.dedupeKey?.(task) ?? task.hash;

	const notifyState = () => {
		state.opts.onStateChange?.({ running: state.running, queued: state.queue.length });
	};

	const schedule = () => {
		if (state.scheduleTimer) {
			clearTimeout(state.scheduleTimer);
			state.scheduleTimer = null;
		}

		const limit = Math.max(1, Number(state.opts.concurrency?.() ?? 1));

		while (state.running < limit && state.queue.length > 0) {
			const task = state.queue.shift()!;
			const key = keyOf(task);
			state.queuedKeys.delete(key);
			state.activeKeys.add(key);
			state.running += 1;
			notifyState();

			(async () => {
				let finalize = true;
				try {
					const result = await state.opts.runTask(task);

					if (result?.requeue) {
						requeueTask(task);
						finalize = false;
						return;
					}

					state.opts.onTaskSuccess(task, result);
				} catch (error) {
					state.opts.onTaskFailure?.(task, error);
				} finally {
					if (finalize) {
						state.activeKeys.delete(key);
						state.running = Math.max(0, state.running - 1);
						notifyState();
						schedule();
					}
				}
			})();
		}
	};

	const enqueueInternal = (task: PreloadTask, delay = 0) => {
		const enqueueFn = () => {
			const key = keyOf(task);
			if (state.queuedKeys.has(key) || state.activeKeys.has(key)) {
				return;
			}
			state.queue.push(task);
			state.queuedKeys.add(key);
			notifyState();
			schedule();
		};

		if (delay > 0) {
			state.scheduleTimer = setTimeout(() => {
				state.scheduleTimer = null;
				enqueueFn();
			}, delay);
			return;
		}

		enqueueFn();
	};

	const requeueTask = (task: PreloadTask) => {
		const key = keyOf(task);
		if (state.activeKeys.has(key)) {
			state.activeKeys.delete(key);
			state.running = Math.max(0, state.running - 1);
		}
		notifyState();
		enqueueInternal(task, state.opts.retryDelayMs);
	};

	return {
		enqueue(task: PreloadTask) {
			enqueueInternal(task);
		},
		clear() {
			state.queue = [];
			state.queuedKeys.clear();
			notifyState();
		},
		notifyIdle() {
			schedule();
		},
		isRunning() {
			return state.running > 0;
		},
		pending() {
			return state.queue.length;
		},
		updateConcurrency(newConcurrency: () => number) {
			state.opts.concurrency = newConcurrency;
			schedule(); // 重新调度以应用新的并发数
		}
	};
}
