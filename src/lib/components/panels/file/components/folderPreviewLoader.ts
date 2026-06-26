import { invoke } from '@tauri-apps/api/core';

const MAX_CACHE_SIZE = 512;
const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_VISITED_DIRS = 96;
const DEFAULT_MAX_ENTRIES_PER_DIR = 768;
const DEFAULT_BUDGET_MS = 120;

export interface FolderPreviewCandidate {
	path: string;
	kind: 'file' | 'directoryCover';
	representative?: string | null;
}

const candidateCache = new Map<string, FolderPreviewCandidate[]>();
const inFlight = new Map<string, Promise<FolderPreviewCandidate[]>>();

function makeCacheKey(folderPath: string, count: number, modified: number): string {
	return `${folderPath}|${count}|${modified}`;
}

function remember(cacheKey: string, candidates: FolderPreviewCandidate[]): void {
	if (candidateCache.size >= MAX_CACHE_SIZE) {
		const firstKey = candidateCache.keys().next().value;
		if (firstKey) candidateCache.delete(firstKey);
	}
	candidateCache.set(cacheKey, candidates);
}

function normalizeCandidate(candidate: FolderPreviewCandidate): FolderPreviewCandidate | null {
	if (!candidate?.path) return null;
	const kind = candidate.kind === 'directoryCover' ? 'directoryCover' : 'file';
	return {
		path: candidate.path,
		kind,
		representative: candidate.representative ?? null
	};
}

function uniqueCandidates(candidates: FolderPreviewCandidate[]): FolderPreviewCandidate[] {
	const seen = new Set<string>();
	const result: FolderPreviewCandidate[] = [];

	for (const candidate of candidates) {
		const normalized = normalizeCandidate(candidate);
		if (!normalized) continue;
		const key = `${normalized.kind}:${normalized.path.replace(/\\/g, '/').toLowerCase()}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(normalized);
	}

	return result;
}

export async function loadFolderPreviewCandidates(
	folderPath: string,
	count: number,
	modified = 0
): Promise<FolderPreviewCandidate[]> {
	const safeCount = Math.max(1, Math.min(16, Math.trunc(count || 4)));
	const cacheKey = makeCacheKey(folderPath, safeCount, modified);
	const cached = candidateCache.get(cacheKey);
	if (cached) return cached;

	const pending = inFlight.get(cacheKey);
	if (pending) return pending;

	const promise = invoke<FolderPreviewCandidate[]>('get_folder_preview_candidates_v2', {
		folderPath,
		count: safeCount,
		maxDepth: DEFAULT_MAX_DEPTH,
		maxVisitedDirs: DEFAULT_MAX_VISITED_DIRS,
		maxEntriesPerDir: DEFAULT_MAX_ENTRIES_PER_DIR,
		budgetMs: DEFAULT_BUDGET_MS
	})
		.then((candidates) => {
			const unique = uniqueCandidates(candidates).slice(0, safeCount);
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

export async function loadFolderPreviewImagePaths(
	folderPath: string,
	count: number,
	modified = 0
): Promise<string[]> {
	const candidates = await loadFolderPreviewCandidates(folderPath, count, modified);
	return candidates
		.filter((candidate) => candidate.kind === 'file')
		.map((candidate) => candidate.path);
}

export function clearFolderPreviewPathCache(): void {
	candidateCache.clear();
	inFlight.clear();
}
