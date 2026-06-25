import { invoke } from '@tauri-apps/api/core';

const MAX_CACHE_SIZE = 512;

const pathCache = new Map<string, string[]>();
const inFlight = new Map<string, Promise<string[]>>();

function makeCacheKey(folderPath: string, count: number, modified: number): string {
	return `${folderPath}|${count}|${modified}`;
}

function remember(cacheKey: string, paths: string[]): void {
	if (pathCache.size >= MAX_CACHE_SIZE) {
		const firstKey = pathCache.keys().next().value;
		if (firstKey) pathCache.delete(firstKey);
	}
	pathCache.set(cacheKey, paths);
}

function uniquePaths(paths: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const path of paths) {
		const key = path.replace(/\\/g, '/').toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(path);
	}

	return result;
}

export async function loadFolderPreviewImagePaths(
	folderPath: string,
	count: number,
	modified = 0
): Promise<string[]> {
	const safeCount = Math.max(1, Math.min(16, Math.trunc(count || 4)));
	const cacheKey = makeCacheKey(folderPath, safeCount, modified);
	const cached = pathCache.get(cacheKey);
	if (cached) return cached;

	const pending = inFlight.get(cacheKey);
	if (pending) return pending;

	const promise = invoke<string[]>('get_folder_preview_image_paths', {
		folderPath,
		count: safeCount
	})
	.then((paths) => {
		const unique = uniquePaths(paths).slice(0, safeCount);
		if (unique.length > 0) {
			remember(cacheKey, unique);
		}
		return unique;
	})
		.finally(() => {
			inFlight.delete(cacheKey);
		});

	inFlight.set(cacheKey, promise);
	return promise;
}

export function clearFolderPreviewPathCache(): void {
	pathCache.clear();
	inFlight.clear();
}
