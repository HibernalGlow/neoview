interface CacheRecord<T = Blob> {
	key: string;
	value: T;
	size: number;
	lastAccessed: number;
	createdAt: number;
}

export interface CacheStats {
	items: number;
	totalSize: number;
}

export class CacheService<T = Blob> {
	private limitBytes: number;
	private store = new Map<string, CacheRecord<T>>();
	private totalSize = 0;

	constructor(limitBytes = 256 * 1024 * 1024) {
		this.limitBytes = limitBytes;
	}

	setLimit(limitBytes: number): void {
		this.limitBytes = Math.max(limitBytes, 1);
		this.enforceLimit();
	}

	async put(key: string, value: T, size: number): Promise<void> {
		const now = Date.now();
		const existing = this.store.get(key);
		if (existing) {
			this.totalSize -= existing.size;
		}
		this.store.set(key, {
			key,
			value,
			size,
			lastAccessed: now,
			createdAt: now
		});
		this.totalSize += size;
		this.enforceLimit();
	}

	async get(key: string): Promise<T | undefined> {
		const record = this.store.get(key);
		if (!record) return undefined;
		record.lastAccessed = Date.now();
		return record.value;
	}

	delete(key: string): void {
		const record = this.store.get(key);
		if (!record) return;
		this.totalSize -= record.size;
		this.store.delete(key);
	}

	clear(): void {
		this.store.clear();
		this.totalSize = 0;
	}

	getStats(): CacheStats {
		return {
			items: this.store.size,
			totalSize: this.totalSize
		};
	}

	private enforceLimit(): void {
		if (this.totalSize <= this.limitBytes) {
			return;
		}
		const entries = Array.from(this.store.values()).sort((a, b) => a.lastAccessed - b.lastAccessed);
		for (const entry of entries) {
			if (this.totalSize <= this.limitBytes) break;
			this.store.delete(entry.key);
			this.totalSize -= entry.size;
		}
	}
}

export const blobCache = new CacheService<Blob>();







