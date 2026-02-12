import type { NeoViewSettings } from '$lib/settings/settingsManager';
import type { TaskBucket } from '../tasks/taskScheduler';

export interface BookSlice {
	currentBookPath: string | null;
	currentPageIndex: number;
	totalPages: number;
}

export type ViewerJumpSource = 'user' | 'system' | 'task';

export interface JumpHistoryEntry {
	index: number;
	timestamp: number;
	source: ViewerJumpSource;
}

export interface PageWindowState {
	center: number;
	forward: number[];
	backward: number[];
	stale: boolean;
}

export type TaskBucketDepth = Record<TaskBucket, number>;

export interface TaskCursorState {
	centerIndex: number;
	oldestPendingIdx: number;
	furthestReadyIdx: number;
	activeBuckets: TaskBucketDepth;
	running: number;
	concurrency: number;
	updatedAt: number;
}

export type ZoomMode = 'fit' | 'fill' | 'fitWidth' | 'fitHeight' | 'original' | 'fitLeftAlign' | 'fitRightAlign';

export interface ViewerSlice {
	viewMode: 'single' | 'double' | 'panorama';
	lockedViewMode: 'single' | 'double' | 'panorama' | null;
	lockedZoomMode: ZoomMode | null;
	currentZoomMode: ZoomMode;
	orientation: 'horizontal' | 'vertical';
	zoom: number;
	loading: boolean;
	comparisonVisible: boolean;
	comparisonMode: 'slider' | 'side-by-side';
	pageWindow: PageWindowState;
	jumpHistory: JumpHistoryEntry[];
	taskCursor: TaskCursorState;
    magnifier: {
        enabled: boolean;
        zoom: number;
        size: number;
    };
}

export interface AppStateSnapshot {
	settings: NeoViewSettings;
	book: BookSlice;
	viewer: ViewerSlice;
	lastUpdated: number;
}

export type StateSelector<T> = (state: AppStateSnapshot) => T;
export type StateListener<T> = (value: T, previous: T) => void;

function structuredCopy<T>(value: T): T {
	if (typeof structuredClone === 'function') {
		return structuredClone(value);
	}
	return JSON.parse(JSON.stringify(value));
}

export function createDefaultAppState(): AppStateSnapshot {
	const defaultBucketDepth: TaskBucketDepth = {
		current: 0,
		forward: 0,
		backward: 0,
		background: 0
	};

	return {
		settings: {
			system: {
				language: 'zh-CN',
				hardwareAcceleration: true,
				temporaryDirectory: '',
				thumbnailDirectory: 'D\\temp\\neoview'
			},
			archive: {
				allowFileOperations: true,
				confirmBeforeDelete: true
			},
			startup: {
				openLastFile: true,
				minimizeToTray: false,
				openLastFolder: true
			},
			performance: {
				cacheMemorySize: 512,
				preLoadSize: 3,
				multiThreadedRendering: true,
				maxThreads: 2,
                archiveTempfileThresholdMB: 100,
                directUrlThresholdMB: 50
			},
			image: {
				supportedFormats: ['jpg', 'png', 'webp', 'avif', 'jxl'],
				preloadCount: 2,
				enableSuperResolution: false,
				superResolutionModel: null,
				currentImageUpscaleEnabled: false,
				autoPlayAnimatedImages: true,
				longImageScrollMode: 'continuous',
				hoverScrollEnabled: true,
                hoverScrollSpeed: 1.0,
				videoMinPlaybackRate: 0.25,
				videoMaxPlaybackRate: 16,
				videoPlaybackRateStep: 0.25,
				videoFormats: ['mp4', 'm4v', 'mov', 'nov', 'webm', 'ogg', 'ogv', '3gp', '3g2', 'mkv', 'avi', 'flv', 'wmv']
			},
			view: {
				defaultZoomMode: 'fit',
				showGrid: false,
				showInfoBar: true,
				showBookSwitchToast: false,
				backgroundColor: '#000000',
				backgroundMode: 'solid',
				ambient: {
					speed: 8,
					blur: 80,
					opacity: 0.8,
					style: 'vibrant'
				},
				mouseCursor: {
					autoHide: true,
					hideDelay: 1.0,
					showMovementThreshold: 26,
					showOnButtonClick: true
				},
				pageLayout: {
					splitHorizontalPages: false,
					treatHorizontalAsDoublePage: false,
					singleFirstPageMode: 'restoreOrDefault',
					singleLastPageMode: 'restoreOrDefault',
                    widePageStretch: 'none'
				},
				autoRotate: {
					mode: 'none'
				},
				infoOverlay: {
					enabled: false,
					opacity: 0.85,
					showBorder: false
				},
				notification: {
					messageStyle: 'normal',
					durationMs: 3000,
					maxVisible: 3
				},
				switchToast: {
					enableBook: false,
					enablePage: false,
                    enableBoundaryToast: true,
					showBookPath: true,
					showBookPageProgress: true,
					showBookType: false,
					showPageIndex: true,
					showPageSize: false,
					showPageDimensions: true,
					bookTitleTemplate: '已切换到 {{book.displayName}}（第 {{book.currentPageDisplay}} / {{book.totalPages}} 页）',
					bookDescriptionTemplate: '路径：{{book.path}}',
					pageTitleTemplate: '第 {{page.indexDisplay}} / {{book.totalPages}} 页',
					pageDescriptionTemplate: '{{page.dimensionsFormatted}}  {{page.sizeFormatted}}'
				}
			},
			book: {
				autoPageTurnInterval: 3,
				preloadPages: 2,
				rememberProgress: true,
				doublePageView: false,
				readingDirection: 'left-to-right',
				tailOverflowBehavior: 'stayOnLastPage'
			},
			theme: {
				theme: 'system',
				fontSize: 'medium',
				uiScale: 1.0,
                customFont: {
                    enabled: false,
                    fontFamilies: [],
                    uiFontFamilies: [],
                    monoFontFamilies: []
                }
			},
			panels: {
				leftSidebarVisible: true,
				rightSidebarVisible: false,
				bottomPanelVisible: false,
				autoHideToolbar: true,
                sidebarOpacity: 90,
                topToolbarOpacity: 90,
                bottomBarOpacity: 90,
                sidebarBlur: 10,
                topToolbarBlur: 10,
                bottomBarBlur: 10,
                progressBarGlow: true,
                settingsOpacity: 95,
                settingsBlur: 10,
                pageListFollowProgress: true,
				hoverAreas: {
					topTriggerHeight: 32,
					bottomTriggerHeight: 32,
					leftTriggerWidth: 32,
					rightTriggerWidth: 32
				},
				autoHideTiming: {
					showDelaySec: 0.0,
					hideDelaySec: 0.0
				}
			},
			bindings: {
				mouse: {
					leftClick: 'next',
					rightClick: 'contextMenu',
					wheelUp: 'prev',
					wheelDown: 'next'
				},
				keyboard: {
					space: 'next',
					arrowLeft: 'prev',
					arrowRight: 'next',
					escape: 'close'
				}
			},
			history: {
				enabled: true,
				maxHistorySize: 100,
				rememberLastFile: true,
				autoCleanupDays: 30
			},
			slideshow: {
				defaultInterval: 5,
				loop: false,
				random: false,
				fadeTransition: true
			}
		},
		book: {
			currentBookPath: null,
			currentPageIndex: 0,
			totalPages: 0
		},
		viewer: {
			viewMode: 'single',
			lockedViewMode: null,
			lockedZoomMode: null,
			currentZoomMode: 'fit',
			orientation: 'horizontal',
			zoom: 1,
			loading: false,
			comparisonVisible: false,
			comparisonMode: 'slider',
			pageWindow: {
				center: 0,
				forward: [],
				backward: [],
				stale: true
			},
			jumpHistory: [],
			taskCursor: {
				centerIndex: 0,
				oldestPendingIdx: 0,
				furthestReadyIdx: 0,
				activeBuckets: defaultBucketDepth,
				running: 0,
				concurrency: 2,
				updatedAt: Date.now()
			},
            magnifier: {
                enabled: false,
                zoom: 2.0,
                size: 200
            }
		},
		lastUpdated: Date.now()
	};
}

type ListenerEntry = {
	selector: StateSelector<unknown>;
	listener: StateListener<unknown>;
	prev: unknown;
};

export class AppState {
	private state: AppStateSnapshot;
	private listeners = new Map<number, ListenerEntry>();
	private nextListenerId = 1;

	constructor(initialState: AppStateSnapshot = createDefaultAppState()) {
		this.state = initialState;
	}

	getSnapshot(): AppStateSnapshot {
		return structuredCopy(this.state);
	}

	setState(updater: (previous: AppStateSnapshot) => AppStateSnapshot): void {
		const previous = this.state;
		this.state = updater(structuredCopy(previous));
		this.state.lastUpdated = Date.now();
		this.emit(previous, this.state);
	}

	update(partial: Partial<AppStateSnapshot>): void {
		this.setState((prev) => ({
			...prev,
			...partial,
			settings: partial.settings ?? prev.settings,
			book: partial.book ?? prev.book,
			viewer: partial.viewer ?? prev.viewer
		}));
	}

	subscribe<T>(selector: StateSelector<T>, listener: StateListener<T>): () => void {
		const id = this.nextListenerId++;
		const current = selector(this.state);
		this.listeners.set(id, {
			selector: selector as StateSelector<unknown>,
			listener: listener as StateListener<unknown>,
			prev: structuredCopy(current)
		});

		return () => {
			this.listeners.delete(id);
		};
	}

	private emit(previous: AppStateSnapshot, next: AppStateSnapshot): void {
		for (const entry of this.listeners.values()) {
			const { selector, listener } = entry;
			const currentValue = selector(next);
			if (Object.is(currentValue, entry.prev)) {
				continue;
			}
			const prevValue = entry.prev;
			entry.prev = structuredCopy(currentValue);
			listener(structuredCopy(currentValue), structuredCopy(prevValue));
		}
	}
}

export const appState = new AppState();


