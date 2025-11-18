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

export interface ViewerSlice {
	viewMode: 'single' | 'double' | 'panorama';
	zoom: number;
	loading: boolean;
	comparisonVisible: boolean;
	comparisonMode: 'slider' | 'side-by-side';
	pageWindow: PageWindowState;
	jumpHistory: JumpHistoryEntry[];
	taskCursor: TaskCursorState;
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
				temporaryDirectory: ''
			},
			startup: {
				openLastFile: true,
				minimizeToTray: false
			},
			performance: {
				cacheMemorySize: 512,
				preLoadSize: 3,
				multiThreadedRendering: true,
				maxThreads: 2
			},
			image: {
				supportedFormats: ['jpg', 'png', 'webp', 'avif', 'jxl'],
				preloadCount: 2,
				enableSuperResolution: false,
				superResolutionModel: null,
				currentImageUpscaleEnabled: false,
				useCachedFirst: true
			},
			view: {
				defaultZoomMode: 'fit',
				showGrid: false,
				showInfoBar: true,
				backgroundColor: '#000000',
				mouseCursor: {
					autoHide: true,
					hideDelay: 1.0,
					showMovementThreshold: 26,
					showOnButtonClick: true
				}
			},
			book: {
				autoPageTurnInterval: 3,
				preloadPages: 2,
				rememberProgress: true,
				doublePageView: false
			},
			theme: {
				theme: 'system',
				fontSize: 'medium',
				uiScale: 1.0
			},
			panels: {
				leftSidebarVisible: true,
				rightSidebarVisible: false,
				bottomPanelVisible: false,
				autoHideToolbar: true
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
			}
		},
		lastUpdated: Date.now()
	};
}

export class AppState {
	private state: AppStateSnapshot;
	private listeners = new Map<number, { selector: StateSelector<any>; listener: StateListener<any>; prev: any }>();
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
		this.listeners.set(id, { selector, listener, prev: structuredCopy(current) });

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


