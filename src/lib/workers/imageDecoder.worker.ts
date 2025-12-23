/**
 * Image Decoder Web Worker
 * 在 Worker 线程中解码图片，避免阻塞主线程
 * 
 * 【性能优化】
 * - 支持大图片缩放解码（减少内存和解码时间）
 * - 返回 workerIndex 用于负载均衡追踪
 */

interface DecodeRequest {
	id: string;
	blob: Blob;
	workerIndex?: number;
	maxWidth?: number;
	maxHeight?: number;
}

interface DecodeResponse {
	id: string;
	success: boolean;
	bitmap?: ImageBitmap;
	width?: number;
	height?: number;
	error?: string;
	workerIndex?: number;
}

self.onmessage = async (event: MessageEvent<DecodeRequest>) => {
	const { id, blob, workerIndex, maxWidth, maxHeight } = event.data;
	
	try {
		let bitmap: ImageBitmap;
		
		// 如果指定了最大尺寸，使用缩放解码
		if (maxWidth || maxHeight) {
			bitmap = await createImageBitmap(blob, {
				resizeWidth: maxWidth,
				resizeHeight: maxHeight,
				resizeQuality: 'medium'
			});
		} else {
			// 标准解码
			bitmap = await createImageBitmap(blob);
		}
		
		const response: DecodeResponse = {
			id,
			success: true,
			bitmap,
			width: bitmap.width,
			height: bitmap.height,
			workerIndex
		};
		
		// 传输 ImageBitmap（零拷贝）
		self.postMessage(response, { transfer: [bitmap] });
	} catch (error) {
		const response: DecodeResponse = {
			id,
			success: false,
			error: String(error),
			workerIndex
		};
		self.postMessage(response);
	}
};

export {};
