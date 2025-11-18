import { taskScheduler } from './taskScheduler';
import { blobToDataURL } from '$lib/utils/blob';

type Resolver = {
	resolve: (value: string) => void;
	reject: (reason: Error) => void;
};

const comparisonResolvers = new Map<string, Resolver>();
let activeComparisonTaskId: string | null = null;

function handleTaskUpdate() {
	taskScheduler.subscribe((snapshot) => {
		const resolver = comparisonResolvers.get(snapshot.id);
		if (!resolver) {
			return;
		}

		if (snapshot.status === 'completed') {
			comparisonResolvers.delete(snapshot.id);
			if (snapshot.id === activeComparisonTaskId) {
				activeComparisonTaskId = null;
			}
			resolver.resolve((snapshot.result as string) ?? '');
			return;
		}

		if (snapshot.status === 'failed' || snapshot.status === 'cancelled') {
			comparisonResolvers.delete(snapshot.id);
			if (snapshot.id === activeComparisonTaskId) {
				activeComparisonTaskId = null;
			}
			resolver.reject(new Error(snapshot.error ?? 'comparison task interrupted'));
		}
	});
}

// 立即建立一次订阅
handleTaskUpdate();

function rejectResolver(taskId: string | null, reason: string) {
	if (!taskId) return;
	const resolver = comparisonResolvers.get(taskId);
	if (resolver) {
		comparisonResolvers.delete(taskId);
		resolver.reject(new Error(reason));
	}
}

export function cancelComparisonPreviewTask(reason = 'comparison task cancelled'): void {
	if (!activeComparisonTaskId) {
		return;
	}
	taskScheduler.cancel(activeComparisonTaskId);
	rejectResolver(activeComparisonTaskId, reason);
	activeComparisonTaskId = null;
}

export function scheduleComparisonPreview(
	blobSupplier: () => Promise<Blob | null>,
	pageIndex?: number
): Promise<string> {
	cancelComparisonPreviewTask('comparison task superseded');

	return new Promise((resolve, reject) => {
		const snapshot = taskScheduler.enqueue({
			type: 'comparison-prepare',
			priority: 'high',
			bucket: 'current',
			source: 'comparison-viewer',
			pageIndices: typeof pageIndex === 'number' ? [pageIndex] : undefined,
			executor: async () => {
				const blob = await blobSupplier();
				if (!blob) {
					throw new Error('无法获取当前页 Blob');
				}
				return await blobToDataURL(blob);
			}
		});

		activeComparisonTaskId = snapshot.id;
		comparisonResolvers.set(snapshot.id, { resolve, reject });
	});
}



