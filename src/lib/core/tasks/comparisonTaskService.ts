import { prepareComparisonPreview, type ComparisonPrepareRequest } from '$lib/api/backgroundTasks';

let activeComparisonTask: Promise<string> | null = null;

export function cancelComparisonPreviewTask(reason = 'comparison task cancelled'): void {
	// 取消当前任务（通过设置 activeComparisonTask 为 null，新的任务会覆盖旧的）
	activeComparisonTask = null;
}

export async function scheduleComparisonPreview(
	blobSupplier: () => Promise<Blob | null>,
	pageIndex?: number
): Promise<string> {
	// 取消之前的任务
	cancelComparisonPreviewTask('comparison task superseded');

	// 获取 blob
	const blob = await blobSupplier();
	if (!blob) {
		throw new Error('无法获取当前页 Blob');
	}

	// 将 blob 转换为 ArrayBuffer，然后转为 number[]
	const arrayBuffer = await blob.arrayBuffer();
	const imageData = Array.from(new Uint8Array(arrayBuffer));

	// 推断 MIME 类型
	const mimeType = blob.type || 'image/jpeg';

	// 调用 Rust 调度器
	const request: ComparisonPrepareRequest = {
		imageData,
		mimeType,
		pageIndex
	};

	// 创建新的任务 promise
	const task = prepareComparisonPreview(request).then((response) => response.dataUrl);

	// 保存当前任务
	activeComparisonTask = task;

	try {
		const result = await task;
		// 如果任务被取消，activeComparisonTask 会是 null
		if (activeComparisonTask === task) {
			activeComparisonTask = null;
		}
		return result;
	} catch (error) {
		// 如果任务被取消，activeComparisonTask 会是 null
		if (activeComparisonTask === task) {
			activeComparisonTask = null;
		}
		throw error;
	}
}





