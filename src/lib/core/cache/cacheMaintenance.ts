import { taskScheduler } from '../tasks/taskScheduler';
import { bookStore } from '$lib/stores/book.svelte';

let pendingCleanupJobId: string | null = null;

taskScheduler.subscribe((snapshot) => {
	if (snapshot.id !== pendingCleanupJobId) {
		return;
	}
	if (snapshot.status === 'completed' || snapshot.status === 'failed' || snapshot.status === 'cancelled') {
		pendingCleanupJobId = null;
	}
});

export function scheduleUpscaleCacheCleanup(source = 'cache-maintenance'): void {
	if (pendingCleanupJobId) {
		return;
	}
	const snapshot = taskScheduler.enqueue({
		type: 'cache-maintenance',
		priority: 'low',
		bucket: 'background',
		source,
		executor: async () => {
			const cleaned = bookStore.cleanupExpiredCaches();
			console.log('📦 缓存维护完成，删除条目:', cleaned);
		}
	});
	pendingCleanupJobId = snapshot.id;
}


