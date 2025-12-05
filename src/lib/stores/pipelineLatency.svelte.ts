/**
 * 图片加载流水线延迟追踪
 * 记录后端到前端全链路的各环节延迟
 */

// 单次加载的延迟记录
export interface PipelineLatencyRecord {
	timestamp: number;
	pageIndex: number;
	traceId: string;
	
	// 各环节延迟（毫秒）
	bookSyncMs: number;      // 书籍同步（pm_open_book）
	backendLoadMs: number;   // 后端加载（pm_goto_page/pm_get_page）
	ipcTransferMs: number;   // IPC 传输
	blobCreateMs: number;    // Blob 创建
	totalMs: number;         // 总耗时
	
	// 元数据
	dataSize: number;
	cacheHit: boolean;       // 前端缓存命中
	isCurrentPage: boolean;  // 是否当前页（vs 预加载）
	source?: string;         // 调用来源：'current' | 'preload' | 'second' | 'cache'
	slot?: string;           // 槽位：'prev' | 'current' | 'next'（StackViewer 用）
}

// 创建响应式 store
function createPipelineLatencyStore() {
	// 最近的记录（最多保留 50 条）
	let records = $state<PipelineLatencyRecord[]>([]);
	// 是否启用追踪
	let enabled = $state(false);
	
	return {
		get records() { return records; },
		get enabled() { return enabled; },
		
		// 启用/禁用追踪
		setEnabled(value: boolean) {
			enabled = value;
			if (!value) {
				records = [];
			}
		},
		
		// 记录一次加载
		record(data: PipelineLatencyRecord) {
			if (!enabled) return;
			records = [...records.slice(-49), data];
		},
		
		// 清空记录
		clear() {
			records = [];
		},
		
		// 获取统计数据
		getStats() {
			if (records.length === 0) {
				return {
					avgTotalMs: 0,
					avgBackendMs: 0,
					avgTransferMs: 0,
					cacheHitRate: 0,
					count: 0
				};
			}
			
			const sum = records.reduce((acc, r) => ({
				totalMs: acc.totalMs + r.totalMs,
				backendMs: acc.backendMs + r.backendLoadMs,
				transferMs: acc.transferMs + r.ipcTransferMs,
				cacheHits: acc.cacheHits + (r.cacheHit ? 1 : 0)
			}), { totalMs: 0, backendMs: 0, transferMs: 0, cacheHits: 0 });
			
			return {
				avgTotalMs: Math.round(sum.totalMs / records.length),
				avgBackendMs: Math.round(sum.backendMs / records.length),
				avgTransferMs: Math.round(sum.transferMs / records.length),
				cacheHitRate: Math.round(sum.cacheHits / records.length * 100),
				count: records.length
			};
		}
	};
}

export const pipelineLatencyStore = createPipelineLatencyStore();
