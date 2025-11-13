import { writable, get } from 'svelte/store';
import type { ViewerDisplayMode, ViewerImageSource } from '$lib/viewer/imageSourceManager';
import {
  createStreamSourceFromUrl,
  createStreamSourceFromBlob,
  createSuperResSourceFromBlob,
  createSuperResSourceFromPath,
  isStreamSource,
  isSuperResSource,
  ensurePrimaryUrl,
  revokeSourceObjectUrls,
  cloneSource
} from '$lib/viewer/imageSourceManager';

export type DisplayState = {
  mode: ViewerDisplayMode;
  streamSource: ViewerImageSource | null;
  superResSource: ViewerImageSource | null;
  currentHash: string | null;
};

const initialState: DisplayState = {
  mode: 'archive_stream',
  streamSource: null,
  superResSource: null,
  currentHash: null
};

const store = writable<DisplayState>(initialState);

export const viewerDisplayState = {
  subscribe: store.subscribe,
  setMode(mode: ViewerDisplayMode) {
    store.update((state) => ({ ...state, mode }));
  },
  setCurrentHash(hash: string | null) {
    store.update((state) => ({ ...state, currentHash: hash }));
  },
  clear() {
    store.update((state) => {
      revokeSourceObjectUrls(state.streamSource);
      revokeSourceObjectUrls(state.superResSource);
      return { ...initialState };
    });
  },
  resetForNewPage() {
    store.update((state) => {
      const next: DisplayState = {
        ...state,
        mode: 'archive_stream',
        currentHash: null,
        superResSource: null
      };
      if (state.superResSource) revokeSourceObjectUrls(state.superResSource);
      return next;
    });
  },
  setStreamFromUrl(url: string, hash: string, blob?: Blob | null) {
    const source = createStreamSourceFromUrl({ url, hash, blob });
    store.update((state) => {
      if (state.streamSource) revokeSourceObjectUrls(state.streamSource);
      return { ...state, streamSource: source, currentHash: hash };
    });
  },
  setStreamFromBlob(blob: Blob, hash: string, objectUrlFactory?: (blob: Blob) => string) {
    const source = createStreamSourceFromBlob({ blob, hash, objectUrlFactory });
    store.update((state) => {
      if (state.streamSource) revokeSourceObjectUrls(state.streamSource);
      return { ...state, streamSource: source, currentHash: hash };
    });
  },
  setSuperResFromPath(path: string, hash: string) {
    const source = createSuperResSourceFromPath({ path, hash });
    store.update((state) => {
      if (state.superResSource) revokeSourceObjectUrls(state.superResSource);
      return { ...state, superResSource: source };
    });
  },
  setSuperResFromBlob(blob: Blob, hash: string, path?: string | null, factory?: (blob: Blob) => string) {
    const source = createSuperResSourceFromBlob({ blob, hash, path: path ?? null, objectUrlFactory: factory });
    store.update((state) => {
      if (state.superResSource) revokeSourceObjectUrls(state.superResSource);
      return { ...state, superResSource: source };
    });
  },
  getDisplayUrl(): string | null {
    const value = get(store);
    if (value.mode === 'superres_url' && isSuperResSource(value.superResSource)) {
      return ensurePrimaryUrl(value.superResSource);
    }
    if (isStreamSource(value.streamSource)) {
      return ensurePrimaryUrl(value.streamSource);
    }
    return null;
  },
  getState(): DisplayState {
    const value = get(store);
    return {
      mode: value.mode,
      currentHash: value.currentHash,
      streamSource: value.streamSource ? cloneSource(value.streamSource) : null,
      superResSource: value.superResSource ? cloneSource(value.superResSource) : null
    };
  }
};

export function snapshotDisplayState(): DisplayState {
  return viewerDisplayState.getState();
}
