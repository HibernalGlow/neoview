/**
 * Base64 解码 Web Worker
 * 
 * 将 Base64 解码移到后台线程，避免阻塞主线程
 * 使用 fetch + data URL 利用浏览器原生解码器
 */

interface DecodeRequest {
	id: string;
	base64: string;
	mimeType?: string;
}

interface DecodeResponse {
	id: string;
	success: boolean;
	data?: ArrayBuffer;
	error?: string;
}

self.onmessage = async (event: MessageEvent<DecodeRequest>) => {
	const { id, base64, mimeType = 'application/octet-stream' } = event.data;

	try {
		// 使用 fetch + data URL，利用浏览器原生 Base64 解码器
		const response = await fetch(`data:${mimeType};base64,${base64}`);
		const arrayBuffer = await response.arrayBuffer();

		// 使用 Transferable 传输，避免复制开销
		const result: DecodeResponse = {
			id,
			success: true,
			data: arrayBuffer,
		};
		self.postMessage(result, { transfer: [arrayBuffer] });
	} catch (error) {
		const result: DecodeResponse = {
			id,
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
		self.postMessage(result);
	}
};
