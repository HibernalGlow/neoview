/**
 * Image Decoder Web Worker
 * 在 Worker 线程中解码图片，避免阻塞主线程
 */

interface DecodeRequest {
	id: string;
	blob: Blob;
}

interface DecodeResponse {
	id: string;
	success: boolean;
	bitmap?: ImageBitmap;
	width?: number;
	height?: number;
	error?: string;
}

self.onmessage = async (event: MessageEvent<DecodeRequest>) => {
	const { id, blob } = event.data;
	
	try {
		// 使用 createImageBitmap 解码图片（Worker 中可用）
		const bitmap = await createImageBitmap(blob);
		
		const response: DecodeResponse = {
			id,
			success: true,
			bitmap,
			width: bitmap.width,
			height: bitmap.height
		};
		
		// 传输 ImageBitmap（零拷贝）
		self.postMessage(response, { transfer: [bitmap] });
	} catch (error) {
		const response: DecodeResponse = {
			id,
			success: false,
			error: String(error)
		};
		self.postMessage(response);
	}
};

export {};
