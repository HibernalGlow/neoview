/**
 * NeoView - Background Tasks API
 * 后台任务相关的 API 接口
 * 全面使用 Python HTTP API
 */

import { apiGet, apiPost } from './http-bridge';

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
	return await apiPost<FolderScanResult[]>('/thumbnail/scan-folders', { folders });
}

export async function fetchBackgroundQueueMetrics(): Promise<BackgroundQueueMetrics> {
	return await apiGet<BackgroundQueueMetrics>('/system/background-queue-metrics');
}

export async function runCacheMaintenance(): Promise<CacheMaintenanceResult> {
	return await apiPost<CacheMaintenanceResult>('/system/cache-maintenance');
}

// ===== Comparison Commands =====

export interface ComparisonPrepareRequest {
	imageData: number[]; // Vec<u8> 作为 number[]
	mimeType: string;
	pageIndex?: number;
}

export interface ComparisonPrepareResponse {
	dataUrl: string;
}

export async function prepareComparisonPreview(
	request: ComparisonPrepareRequest
): Promise<ComparisonPrepareResponse> {
	return await apiPost<ComparisonPrepareResponse>('/comparison/prepare', request);
}

// ===== Archive Batch Scan Commands =====

export interface ArchiveScanResult {
	archivePath: string;
	entries: Array<{
		name: string;
		path: string;
		size: number;
		isDir: boolean;
		isImage: boolean;
	}>;
	error?: string | null;
}

export async function batchScanArchives(archivePaths: string[]): Promise<ArchiveScanResult[]> {
	if (archivePaths.length === 0) return [];
	return await apiPost<ArchiveScanResult[]>('/archive/batch-scan', { archive_paths: archivePaths });
}
