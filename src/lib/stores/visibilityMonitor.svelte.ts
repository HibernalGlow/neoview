/**
 * 可见范围监控 Store
 * 用于在 BenchmarkPanel 中实时显示 VirtualizedFileList 的可见条目信息
 */

// 监控开关（默认关闭，避免性能影响）
let monitorEnabled = $state(false);

export interface VisibilityInfo {
	// 当前文件夹路径
	currentPath: string;
	// 总条目数
	totalItems: number;
	// 可见范围
	visibleStart: number;
	visibleEnd: number;
	// 可见条目数
	visibleCount: number;
	// 选中索引
	selectedIndex: number;
	// 列数
	columns: number;
	// 行数
	rowCount: number;
	// 可见行范围
	visibleRowStart: number;
	visibleRowEnd: number;
	// 滚动进度
	scrollProgress: number;
	// 更新时间戳
	timestamp: number;
}

// 使用 Svelte 5 的 $state 创建响应式状态
let visibilityInfo = $state<VisibilityInfo>({
	currentPath: '',
	totalItems: 0,
	visibleStart: 0,
	visibleEnd: 0,
	visibleCount: 0,
	selectedIndex: -1,
	columns: 1,
	rowCount: 0,
	visibleRowStart: 0,
	visibleRowEnd: 0,
	scrollProgress: 0,
	timestamp: 0
});

// 更新历史（用于计算更新频率）
let updateHistory = $state<number[]>([]);
const MAX_HISTORY = 20;

/**
 * 更新可见范围信息
 */
export function updateVisibility(info: Partial<VisibilityInfo>) {
	// 如果监控未开启，直接返回
	if (!monitorEnabled) return;
	
	const now = Date.now();
	visibilityInfo = {
		...visibilityInfo,
		...info,
		timestamp: now
	};
	
	// 记录更新历史
	updateHistory = [...updateHistory.slice(-(MAX_HISTORY - 1)), now];
}

/**
 * 开启/关闭监控
 */
export function setMonitorEnabled(enabled: boolean) {
	monitorEnabled = enabled;
	if (!enabled) {
		// 关闭时重置数据
		resetVisibility();
	}
}

/**
 * 获取监控状态
 */
export function isMonitorEnabled(): boolean {
	return monitorEnabled;
}

/**
 * 获取当前可见范围信息
 */
export function getVisibilityInfo(): VisibilityInfo {
	return visibilityInfo;
}

/**
 * 获取更新频率（次/秒）
 */
export function getUpdateFrequency(): number {
	if (updateHistory.length < 2) return 0;
	const duration = updateHistory[updateHistory.length - 1] - updateHistory[0];
	if (duration === 0) return 0;
	return ((updateHistory.length - 1) / duration) * 1000;
}

/**
 * 重置监控数据
 */
export function resetVisibility() {
	visibilityInfo = {
		currentPath: '',
		totalItems: 0,
		visibleStart: 0,
		visibleEnd: 0,
		visibleCount: 0,
		selectedIndex: -1,
		columns: 1,
		rowCount: 0,
		visibleRowStart: 0,
		visibleRowEnd: 0,
		scrollProgress: 0,
		timestamp: 0
	};
	updateHistory = [];
}

// 导出响应式 getter
export const visibilityMonitor = {
	get info() { return visibilityInfo; },
	get updateFrequency() { return getUpdateFrequency(); },
	get history() { return updateHistory; },
	get enabled() { return monitorEnabled; }
};
