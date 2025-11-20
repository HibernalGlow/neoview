import type { PreloadManager } from './preloadManager.svelte';

type Subscriber = (manager: PreloadManager | null) => void;

let sharedManager: PreloadManager | null = null;
const subscribers = new Set<Subscriber>();

export function setSharedPreloadManager(manager: PreloadManager | null): void {
	sharedManager = manager;
	for (const subscriber of subscribers) {
		subscriber(sharedManager);
	}
}

export function getSharedPreloadManager(): PreloadManager | null {
	return sharedManager;
}

export function subscribeSharedPreloadManager(callback: Subscriber): () => void {
	subscribers.add(callback);
	callback(sharedManager);
	return () => {
		subscribers.delete(callback);
	};
}



