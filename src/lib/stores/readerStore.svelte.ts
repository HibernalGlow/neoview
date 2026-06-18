/**
 * Reader Store - 唯一阅读状态源
 *
 * 后端负责：翻页规则 / page frame 构建 / URL 映射 / 尺寸元数据 / 预取调度
 * 前端负责：接收 frame snapshot / 渲染 / 处理输入 / 显示 UI
 *
 * 替代 imageStore + panoramaStore 的阅读逻辑
 * 后端直接返回最终 URL，前端不再做 normalizeSnapshotUrls
 * 后端直接返回尺寸，前端不再做 fillSnapshotDimensionsAsync
 */

import { invoke } from '@tauri-apps/api/core';
import { SvelteMap } from 'svelte/reactivity';
import type {
	FrameSnapshot,
	FrameImageInfo,
	CropRect,
	SplitHalf,
	FrameLayoutType
} from '$lib/api/frameApi';
import type { Frame, FrameImage, FrameLayout } from '$lib/stackview/types/frame';
import { emptyFrame } from '$lib/stackview/types/frame';

// ============================================================================
// 类型定义（与后端 ReaderWindow 对齐）
// ============================================================================

/** 阅读窗口 - 多帧快照 */
export interface ReaderWindow {
	centerPage: number;
	frames: FrameSnapshot[];
	preloadAhead: number[];
	preloadBehind: number[];
}

/** 请求阅读窗口的参数 */
export interface GetReaderWindowParams {
	pageMode: 'single' | 'double';
	readOrder: 'ltr' | 'rtl';
	splitHorizontal: boolean;
	widePage: boolean;
	singleFirst: boolean;
	singleLast: boolean;
	divideRate: number;
	splitHalf?: SplitHalf;
}

/** 阅读模式 */
export type ReaderMode = 'normal' | 'panorama';

/** 阅读状态 */
interface ReaderState {
	/** 当前帧（普通模式） */
	currentFrame: FrameSnapshot | null;
	/** 前一帧（双缓冲，消除黑屏） */
	previousFrame: FrameSnapshot | null;
	/** 窗口帧（全景模式） */
	windowFrames: FrameSnapshot[];
	/** 预取提示 */
	preloadAhead: number[];
	preloadBehind: number[];
	/** 是否加载中 */
	loading: boolean;
	/** 错误信息 */
	error: string | null;
	/** 当前模式 */
	mode: ReaderMode;
	/** 当前页索引 */
	currentPage: number;
}

// ============================================================================
// URL 基地址处理
// ============================================================================

/** Windows 需要 http://neoview.localhost，其他平台用 neoview://localhost */
const PROTOCOL_BASE = (() => {
	if (typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent)) {
		return 'http://neoview.localhost';
	}
	return 'neoview://localhost';
})();

/**
 * 将后端返回的 neoview://localhost URL 转换为当前平台的正确格式
 * 后端统一生成 neoview://localhost/...，前端只需做基地址替换
 */
function fixUrl(url: string): string {
	if (!url) return url;
	// 后端生成 neoview://localhost/...，Windows 需要 http://neoview.localhost/...
	if (PROTOCOL_BASE !== 'neoview://localhost' && url.startsWith('neoview://localhost')) {
		return PROTOCOL_BASE + url.slice('neoview://localhost'.length);
	}
	return url;
}

// ============================================================================
// Store
// ============================================================================

class ReaderStore {
	state: ReaderState = $state({
		currentFrame: null,
		previousFrame: null,
		windowFrames: [],
		preloadAhead: [],
		preloadBehind: [],
		loading: false,
		error: null,
		mode: 'normal' as ReaderMode,
		currentPage: 0
	});

	/** 请求令牌（丢弃过期请求） */
	private pendingToken = 0;
	/** 上次书籍路径（检测切书） */
	private lastBookPath: string | null = null;

	// ===========================================================================
	// 加载
	// ===========================================================================

	/**
	 * 加载阅读窗口
	 *
	 * @param centerPage 中心页索引
	 * @param params 阅读参数
	 * @param radius 窗口半径（0=普通模式，>0=全景模式）
	 * @param force 是否强制刷新
	 */
	async loadWindow(
		centerPage: number,
		params: GetReaderWindowParams,
		radius: number = 0,
		force: boolean = false
	): Promise<void> {
		// 跳过相同页（非强制）
		if (
			!force &&
			this.state.currentPage === centerPage &&
			this.state.currentFrame &&
			!this.state.loading
		) {
			return;
		}

		// 检测切书
		const bookPath = this.getBookPath();
		if (bookPath && bookPath !== this.lastBookPath) {
			this.lastBookPath = bookPath;
			this.state.currentFrame = null;
			this.state.previousFrame = null;
			this.state.windowFrames = [];
		}

		const token = ++this.pendingToken;
		this.state.loading = true;
		this.state.error = null;
		this.state.mode = radius > 0 ? 'panorama' : 'normal';
		this.state.currentPage = centerPage;

		try {
			const window = await invoke<ReaderWindow>('pm_get_reader_window', {
				centerPage,
				radius,
				pageMode: params.pageMode,
				readOrder: params.readOrder,
				splitHorizontal: params.splitHorizontal,
				widePage: params.widePage,
				singleFirst: params.singleFirst,
				singleLast: params.singleLast,
				divideRate: params.divideRate,
				splitHalf: params.splitHalf ?? null
			});

			// 丢弃过期请求
			if (token !== this.pendingToken) return;

			// 修复 URL（平台适配）
			const fixedFrames = window.frames.map((s) => this.fixSnapshotUrls(s));

			if (radius > 0) {
				// 全景模式：设置窗口帧
				this.state.windowFrames = fixedFrames;
				// 中心帧也设置（用于尺寸计算等）
				const center =
					fixedFrames.find((f) => f.pageIndex === centerPage) ?? fixedFrames[0] ?? null;
				if (center) {
					this.state.previousFrame = this.state.currentFrame;
					this.state.currentFrame = center;
				}
			} else {
				// 普通模式：只设置中心帧
				const center = fixedFrames[0] ?? null;
				if (center) {
					// 双缓冲：旧帧移到 previousFrame
					if (this.state.currentFrame && this.state.currentFrame.frameId !== center.frameId) {
						this.state.previousFrame = this.state.currentFrame;
					}
					this.state.currentFrame = center;
				}
			}

			this.state.preloadAhead = window.preloadAhead;
			this.state.preloadBehind = window.preloadBehind;
			this.state.loading = false;
		} catch (err) {
			if (token !== this.pendingToken) return;
			console.error('[ReaderStore] loadWindow failed:', err);
			this.state.error = String(err);
			this.state.loading = false;
		}
	}

	// ===========================================================================
	// URL 修复
	// ===========================================================================

	/** 修复 snapshot 中所有图片的 URL */
	private fixSnapshotUrls(snapshot: FrameSnapshot): FrameSnapshot {
		return {
			...snapshot,
			images: snapshot.images.map((img) => ({
				...img,
				url: fixUrl(img.url)
			}))
		};
	}

	// ===========================================================================
	// 帧转换（FrameSnapshot -> 前端 Frame）
	// ===========================================================================

	/** 将后端 FrameSnapshot 转换为前端 Frame */
	snapshotToFrame(snapshot: FrameSnapshot | null): Frame {
		if (!snapshot) return emptyFrame;

		const images: FrameImage[] = snapshot.images
			.filter((img) => !img.isDummy && img.url)
			.map((img, idx) => ({
				url: img.url,
				physicalIndex: img.pageIndex,
				virtualIndex: img.pageIndex,
				splitHalf: img.splitHalf ?? null,
				cropRect: img.cropRect,
				rotation: img.rotation || undefined,
				width: img.width || undefined,
				height: img.height || undefined,
				scale: img.scale !== 1.0 ? img.scale : undefined
			}));

		if (images.length === 0) return emptyFrame;

		const layout: FrameLayout = snapshot.layout === 'double' ? 'double' : 'single';

		return {
			id: snapshot.frameId,
			images,
			layout
		};
	}

	// ===========================================================================
	// 访问器
	// ===========================================================================

	/** 获取当前帧（前端 Frame 格式） */
	getCurrentFrame(): Frame {
		return this.snapshotToFrame(this.state.currentFrame);
	}

	/** 获取前一帧（双缓冲） */
	getPreviousFrame(): Frame {
		return this.snapshotToFrame(this.state.previousFrame);
	}

	/** 获取全景窗口帧 */
	getWindowFrames(): Frame[] {
		return this.state.windowFrames.map((s) => this.snapshotToFrame(s));
	}

	/** 获取主图尺寸 */
	getMainImageSize(): { width: number; height: number } {
		const frame = this.state.currentFrame;
		if (!frame || frame.images.length === 0) return { width: 0, height: 0 };

		const img = frame.images[0];
		let width = img.width;
		let height = img.height;

		// 裁剪时调整尺寸
		if (img.cropRect) {
			width = Math.round(width * img.cropRect.width);
		}

		return { width, height };
	}

	/** 获取当前快照（原始格式） */
	getCurrentSnapshot(): FrameSnapshot | null {
		return this.state.currentFrame;
	}

	/** 获取翻页步长 */
	getStep(): number {
		return this.state.currentFrame?.step ?? 1;
	}

	/** 是否可以前进 */
	get canNext(): boolean {
		return this.state.currentFrame?.canNext ?? false;
	}

	/** 是否可以后退 */
	get canPrev(): boolean {
		return this.state.currentFrame?.canPrev ?? false;
	}

	/** 获取阅读方向 */
	getDirection(): 'ltr' | 'rtl' {
		return this.state.currentFrame?.direction ?? 'ltr';
	}

	// ===========================================================================
	// 工具
	// ===========================================================================

	/** 获取当前书籍路径（从 bookStore） */
	private getBookPath(): string | null {
		// 延迟导入避免循环依赖
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const { bookStore } = require('$lib/stores/book.svelte');
			return bookStore.currentBook?.path ?? null;
		} catch {
			return null;
		}
	}

	/** 上报视口尺寸 */
	async reportViewportSize(
		width: number,
		height: number,
		dpr: number,
		viewMode: 'single' | 'double' | 'panorama'
	): Promise<void> {
		try {
			await invoke('pm_report_viewport', {
				width: Math.round(width),
				height: Math.round(height),
				dpr,
				viewMode
			});
		} catch (err) {
			console.warn('[ReaderStore] reportViewport failed:', err);
		}
	}

	/** 重置状态 */
	reset(): void {
		this.pendingToken++;
		this.state.currentFrame = null;
		this.state.previousFrame = null;
		this.state.windowFrames = [];
		this.state.loading = false;
		this.state.error = null;
		this.lastBookPath = null;
	}
}

// 导出单例
export const readerStore = new ReaderStore();
