import { idbGet, idbSet } from '$lib/utils/idb';

export type PreloadedPageEntry = { data: string; decoded: boolean };

export function touchPreloadedPage(map: Map<number, PreloadedPageEntry>, index: number): void {
	if (!map.has(index)) return;
	const val = map.get(index)!;
	map.delete(index);
	map.set(index, val);
}

export function ensurePreloadedCacheLimit(
	map: Map<number, PreloadedPageEntry>,
	limit: number
): void {
	while (map.size > limit) {
		const firstKey = map.keys().next().value as number | undefined;
		if (firstKey === undefined) break;
		map.delete(firstKey);
	}
}

export async function dataOrBlobUrlToDataUrl(raw: string): Promise<string> {
	if (!raw || raw.startsWith('data:')) return raw;
	if (raw.startsWith('blob:')) {
		const resp = await fetch(raw);
		const blob = await resp.blob();
		return await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});
	}
	return raw;
}

export async function persistPreloadedPagesForBook(
	map: Map<number, PreloadedPageEntry>,
	bookPath: string,
	limit: number
): Promise<void> {
	const entries: Array<[number, string]> = [];
	for (const [idx, val] of map.entries()) {
		const dataUrl = await dataOrBlobUrlToDataUrl(val.data);
		entries.push([idx, dataUrl]);
	}
	const start = Math.max(0, entries.length - limit);
	const limited = entries.slice(start);
	await idbSet(`preloadedPageImages:${bookPath}`, limited);
}

export async function restorePreloadedPagesForBook(
	bookPath: string,
	limit: number
): Promise<Map<number, PreloadedPageEntry>> {
	const stored = await idbGet(`preloadedPageImages:${bookPath}`);
	const map = new Map<number, PreloadedPageEntry>();
	if (stored && Array.isArray(stored)) {
		const items = stored.length > limit ? stored.slice(stored.length - limit) : stored;
		for (const [idx, dataUrl] of items) {
			map.set(Number(idx), { data: dataUrl as string, decoded: true });
		}
	}
	return map;
}
