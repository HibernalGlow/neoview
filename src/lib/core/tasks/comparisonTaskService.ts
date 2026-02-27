import { prepareComparisonPreview, type ComparisonPrepareRequest } from '$lib/api/backgroundTasks';
import PQueue from 'p-queue';

const comparisonQueue = new PQueue({ concurrency: 1 });
let activeGeneration = 0;

function assertNotCancelled(generation: number): void {
	if (generation !== activeGeneration) {
		throw new Error('comparison task cancelled');
	}
}

export function cancelComparisonPreviewTask(reason = 'comparison task cancelled'): void {
	void reason;
	activeGeneration += 1;
	comparisonQueue.clear();
}

export async function scheduleComparisonPreview(
	blobSupplier: () => Promise<Blob | null>,
	pageIndex?: number
): Promise<string> {
	// 取消之前的任务（仅保留最新请求）
	cancelComparisonPreviewTask('comparison task superseded');
	const generation = activeGeneration;

	return comparisonQueue.add<string>(async () => {
		assertNotCancelled(generation);

		// 获取 blob
		const blob = await blobSupplier();
		assertNotCancelled(generation);
		if (!blob) {
			throw new Error('无法获取当前页 Blob');
		}

		// 将 blob 转换为 ArrayBuffer，然后转为 number[]
		const arrayBuffer = await blob.arrayBuffer();
		assertNotCancelled(generation);
		const imageData = Array.from(new Uint8Array(arrayBuffer));

		// 推断 MIME 类型
		const mimeType = blob.type || 'image/jpeg';

		// 调用 Rust 调度器
		const request: ComparisonPrepareRequest = {
			imageData,
			mimeType,
			pageIndex
		};

		const response = await prepareComparisonPreview(request);
		assertNotCancelled(generation);
		return response.dataUrl;
	}).then((result) => {
		if (result === undefined) {
			throw new Error('comparison task cancelled');
		}
		return result;
	});
}





