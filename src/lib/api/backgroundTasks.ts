import { invoke } from '@tauri-apps/api/core';

export interface FolderScanResult {
	folder: string;
	matchedPath: string | null;
	matchedType: 'image' | 'archive' | null;
	generated: boolean;
	message?: string | null;
}

export interface BackgroundTaskRecord {
	jobType: string;
	source: string;
	startedAt: string;
	finishedAt: string;
	durationMs: number;
	status: 'Success' | 'Failed';
}

export interface BackgroundQueueMetrics {
	queueDepth: number;
	running: number;
	completed: number;
	failed: number;
	recentTasks: BackgroundTaskRecord[];
}

export interface CacheMaintenanceResult {
	directoryRemoved: number;
	thumbnailRemoved: number;
}

export async function scanFolderThumbnails(folders: string[]): Promise<FolderScanResult[]> {
	if (folders.length === 0) return [];
	return invoke<FolderScanResult[]>('scan_folder_thumbnails', { folders });
}

export async function fetchBackgroundQueueMetrics(): Promise<BackgroundQueueMetrics> {
	return invoke<BackgroundQueueMetrics>('get_background_queue_metrics');
}

export async function runCacheMaintenance(): Promise<CacheMaintenanceResult> {
	return invoke<CacheMaintenanceResult>('enqueue_cache_maintenance');
}

