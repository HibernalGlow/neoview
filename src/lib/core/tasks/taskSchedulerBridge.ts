import { taskScheduler } from './taskScheduler';
import { appState } from '../state/appState';

// 中文：监听任务调度器的桶深度与运行状态，实时同步到 appState.viewer.taskCursor
taskScheduler.subscribeMetrics((metrics) => {
	const snapshot = appState.getSnapshot();
	const currentIndex = snapshot.book.currentPageIndex;

	const backwardDepth = metrics.queueDepth.backward ?? 0;
	const forwardDepth = metrics.queueDepth.forward ?? 0;

	const updatedCursor = {
		...snapshot.viewer.taskCursor,
		centerIndex: currentIndex,
		oldestPendingIdx: Math.max(0, currentIndex - backwardDepth),
		furthestReadyIdx: Math.max(snapshot.viewer.taskCursor.furthestReadyIdx, currentIndex + forwardDepth),
		activeBuckets: { ...metrics.queueDepth },
		running: metrics.running,
		concurrency: metrics.concurrency,
		updatedAt: metrics.updatedAt
	};

	appState.update({
		viewer: {
			...snapshot.viewer,
			taskCursor: updatedCursor
		}
	});
});




