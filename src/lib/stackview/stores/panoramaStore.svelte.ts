/**
 * Panorama store.
 *
 * Panorama is a presentation layer: it controls continuous scrolling only.
 * Page grouping is delegated to PageFrameBuilder so single/double/split/wide
 * page rules stay identical to the normal reader.
 */

import { bookStore } from '$lib/stores/book.svelte';
import { getArchiveImageUrl, getFileImageUrl, registerBookPath } from '$lib/api/imageProtocol';
import type { PageMode } from '$lib/stores/bookContext.svelte';
import {
  PageFrameBuilder,
  type CropRect,
  type Page,
  type PageFrame,
  type PageFrameContext,
  type PagePosition,
  type ReadOrder,
  type WidePageStretch
} from '$lib/core/pageFrame';

export interface PanoramaUnit {
  id: string;
  startIndex: number;
  position: PagePosition;
  images: PanoramaImage[];
}

export interface PanoramaImage {
  url: string;
  pageIndex: number;
  width?: number;
  height?: number;
  cropRect?: CropRect;
  scale?: number;
}

export interface PanoramaState {
  enabled: boolean;
  units: PanoramaUnit[];
  centerIndex: number;
  loading: boolean;
  preloadRange: number;
}

export interface PanoramaLoadOptions {
  pageMode: PageMode;
  readOrder: ReadOrder;
  splitHorizontal: boolean;
  widePage: boolean;
  singleFirst: boolean;
  singleLast: boolean;
  divideRate: number;
  widePageStretch: WidePageStretch;
}

export function createPanoramaStore() {
  const state = $state<PanoramaState>({
    enabled: false,
    units: [],
    centerIndex: 0,
    loading: false,
    preloadRange: 4,
  });

  let cachedBookHash: string | null = null;
  let cachedBookPath: string | null = null;
  let lastBuildSignature = '';
  let lastCenterIndex = -1;
  let pendingLoadToken = 0;

  function setEnabled(enabled: boolean) {
    state.enabled = enabled;
    if (!enabled) {
      pendingLoadToken += 1;
      state.units = [];
      lastBuildSignature = '';
      lastCenterIndex = -1;
    }
  }

  async function loadPanorama(centerIndex: number, optionsOrPageMode: PanoramaLoadOptions | PageMode) {
    if (!state.enabled) return;

    const book = bookStore.currentBook;
    if (!book || book.pages.length === 0) return;

    const options = normalizeOptions(optionsOrPageMode);
    const safeCenterIndex = clamp(centerIndex, 0, book.pages.length - 1);
    const requestToken = ++pendingLoadToken;

    const isArchiveLike = book.type === 'archive' || book.type === 'epub';

    if (cachedBookPath !== book.path) {
      cachedBookHash = isArchiveLike ? await registerBookPath(book.path) : null;
      if (requestToken !== pendingLoadToken || bookStore.currentBook?.path !== book.path) return;
      cachedBookPath = book.path;
      lastBuildSignature = '';
      lastCenterIndex = -1;
    }

    if (isArchiveLike && !cachedBookHash) return;

    const signature = buildSignature(book.path, book.pages.length, options);
    const centerChanged = safeCenterIndex !== lastCenterIndex;

    state.centerIndex = safeCenterIndex;
    lastCenterIndex = safeCenterIndex;

    if (
      signature === lastBuildSignature &&
      state.units.length > 0 &&
      (!centerChanged || canReuseLoadedWindow(safeCenterIndex))
    ) {
      return;
    }

    state.loading = true;
    try {
      const builder = createBuilder(options);
      const centerPosition = builder.framePositionForIndex(safeCenterIndex);
      const nextUnits = await buildWindowUnits(builder, centerPosition, state.preloadRange);
      if (requestToken !== pendingLoadToken || bookStore.currentBook?.path !== book.path) return;
      state.units = nextUnits;
      lastBuildSignature = signature;
    } finally {
      if (requestToken === pendingLoadToken) {
        state.loading = false;
      }
    }
  }

  function normalizeOptions(optionsOrPageMode: PanoramaLoadOptions | PageMode): PanoramaLoadOptions {
    if (typeof optionsOrPageMode !== 'string') {
      return optionsOrPageMode;
    }

    return {
      pageMode: optionsOrPageMode,
      readOrder: 'ltr',
      splitHorizontal: false,
      widePage: false,
      singleFirst: true,
      singleLast: false,
      divideRate: 1.0,
      widePageStretch: 'uniformHeight',
    };
  }

  function buildSignature(bookPath: string, totalPages: number, options: PanoramaLoadOptions): string {
    return [
      bookPath,
      totalPages,
      options.pageMode,
      options.readOrder,
      options.splitHorizontal ? 1 : 0,
      options.widePage ? 1 : 0,
      options.singleFirst ? 1 : 0,
      options.singleLast ? 1 : 0,
      options.divideRate,
      options.widePageStretch,
    ].join('|');
  }

  function canReuseLoadedWindow(pageIndex: number): boolean {
    if (state.units.length === 0) return false;

    const unitIndex = state.units.findIndex((unit) =>
      unit.startIndex === pageIndex || unit.images.some((image) => image.pageIndex === pageIndex)
    );
    if (unitIndex < 0) return false;

    // Keep the existing DOM stable while scrolling through the middle of the window.
    // Rebuild only near the edges so the window can extend in the scroll direction.
    const edgeMargin = Math.min(2, Math.floor(state.units.length / 2));
    return unitIndex >= edgeMargin && unitIndex < state.units.length - edgeMargin;
  }

  function createBuilder(options: PanoramaLoadOptions): PageFrameBuilder {
    const pages: Page[] = (bookStore.currentBook?.pages ?? []).map((page, i) => {
      const width = page.width ?? 0;
      const height = page.height ?? 0;
      return {
        index: i,
        path: page.path ?? '',
        innerPath: page.innerPath ?? page.name ?? '',
        name: page.name ?? '',
        size: page.size ?? 0,
        width,
        height,
        aspectRatio: height > 0 ? width / height : 1.0,
      };
    });

    const context: PageFrameContext = {
      pageMode: options.pageMode,
      readOrder: options.readOrder,
      isSupportedDividePage: options.splitHorizontal,
      isSupportedWidePage: options.widePage,
      isSupportedSingleFirst: options.singleFirst,
      isSupportedSingleLast: options.singleLast,
      dividePageRate: options.divideRate,
      autoRotate: 'none',
      stretchMode: 'uniform',
      canvasSize: { width: 0, height: 0 },
      widePageStretch: options.widePageStretch,
    };

    return new PageFrameBuilder(pages, context);
  }

  async function buildWindowUnits(
    builder: PageFrameBuilder,
    centerPosition: PagePosition,
    range: number
  ): Promise<PanoramaUnit[]> {
    const positions: PagePosition[] = [centerPosition];

    let prev = centerPosition;
    for (let i = 0; i < range; i += 1) {
      const nextPrev = builder.prevFramePosition(prev);
      if (!nextPrev) break;
      positions.unshift(nextPrev);
      prev = nextPrev;
    }

    let next = centerPosition;
    for (let i = 0; i < range; i += 1) {
      const nextPos = builder.nextFramePosition(next);
      if (!nextPos) break;
      positions.push(nextPos);
      next = nextPos;
    }

    const units = await Promise.all(
      positions.map((position) => {
        const frame = builder.buildFrame(position);
        return frame ? buildUnitFromFrame(frame, position) : Promise.resolve(null);
      })
    );

    return units.filter((unit): unit is PanoramaUnit => Boolean(unit));
  }

  async function buildUnitFromFrame(frame: PageFrame, position: PagePosition): Promise<PanoramaUnit | null> {
    const book = bookStore.currentBook;
    if (!book) return null;

    const imageCandidates = await Promise.all(frame.elements
      .filter((element) => !element.isDummy)
      .map(async (element): Promise<PanoramaImage | null> => {
        const pageIndex = element.page.index;
        const page = book.pages[pageIndex];
        if (!page) return null;

        const url = await resolvePageUrl(page, pageIndex).catch(() => null);
        if (!url) return null;

        return {
          url,
          pageIndex,
          width: element.page.width || page.width || undefined,
          height: element.page.height || page.height || undefined,
          cropRect: element.cropRect,
          scale: element.scale,
        };
      })
    );

    const images = imageCandidates.filter((image): image is PanoramaImage => Boolean(image));

    if (images.length === 0) return null;

    return {
      id: `unit-${position.index}-${position.part}-${images.map((image) => image.pageIndex).join('-')}`,
      startIndex: frame.frameRange.min.index,
      position,
      images,
    };
  }

  async function resolvePageUrl(page: NonNullable<typeof bookStore.currentBook>['pages'][number], pageIndex: number): Promise<string | null> {
    const book = bookStore.currentBook;
    if (!book) return null;

    const isArchiveLike = book.type === 'archive' || book.type === 'epub';
    if (isArchiveLike) {
      if (!cachedBookHash) return null;
      const entryIndex = page.entryIndex ?? pageIndex;
      return getArchiveImageUrl(cachedBookHash, entryIndex);
    }

    const pathHash = await registerBookPath(page.path);
    return getFileImageUrl(pathHash);
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function reset() {
    cachedBookHash = null;
    cachedBookPath = null;
    lastBuildSignature = '';
    lastCenterIndex = -1;
    pendingLoadToken += 1;
    state.units = [];
    state.centerIndex = 0;
    state.loading = false;
  }

  return {
    get state() { return state; },
    setEnabled,
    loadPanorama,
    reset,
  };
}

let panoramaStore: ReturnType<typeof createPanoramaStore> | null = null;

export function getPanoramaStore() {
  if (!panoramaStore) {
    panoramaStore = createPanoramaStore();
  }
  return panoramaStore;
}
