/**
 * Blob / DataURL 工具方法
 */

export async function blobToDataURL(blob: Blob): Promise<string> {
	return await new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			if (typeof reader.result === 'string') {
				resolve(reader.result);
			} else {
				reject(new Error('无法读取 Blob 内容'));
			}
		};
		reader.onerror = () => reject(reader.error ?? new Error('读取 Blob 失败'));
		reader.readAsDataURL(blob);
	});
}





