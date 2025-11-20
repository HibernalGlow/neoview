/**
 * Image Trace Utilities
 * 提供统一的 traceId 生成与日志输出，方便串联加载/传输/显示的完整链路
 */

type TraceInfo = Record<string, unknown>;

function formatInfo(info?: TraceInfo): string {
	if (!info) return '';
	const parts = Object.entries(info)
		.filter(([, value]) => value !== undefined && value !== null && value !== '')
		.map(([key, value]) => {
			if (typeof value === 'object') {
				try {
					return `${key}=${JSON.stringify(value)}`;
				} catch {
					return `${key}=[object]`;
				}
			}
			return `${key}=${value}`;
		});
	return parts.length ? ` (${parts.join(' ')})` : '';
}

export function createImageTraceId(source: string, pageIndex?: number): string {
	const timestamp = Date.now().toString(36);
	const randomChunk =
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID().split('-')[0]
			: Math.random().toString(36).slice(2, 8);
	const suffix = typeof pageIndex === 'number' ? `p${pageIndex}` : 'px';
	return `img-${source}-${suffix}-${timestamp}-${randomChunk}`;
}

export function logImageTrace(traceId: string, stage: string, info?: TraceInfo): void {
	console.log(`🧭 [ImagePipeline][${traceId}] ${stage}${formatInfo(info)}`);
}




