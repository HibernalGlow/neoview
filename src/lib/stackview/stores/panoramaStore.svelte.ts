/**
 * Panorama store.
 *
 * Panorama is a presentation layer: it controls continuous scrolling only.
 * Page grouping is delegated to PageFrameBuilder so single/double/split/wide
 * page rules stay identical to the normal reader.
 */

import { bookStore } from '$lib/stores/book.svelte';
import { getArchiveImageUrl, registerBookPath } from '$lib/api/imageProtocol';
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

  function setEnabled(enabled: boolean) {
    state.enabled = enabled;
    if (!enabled) {
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

    if (cachedBookPath !== book.path) {
      cachedBookHash = await registerBookPath(book.path);
      cachedBookPath = book.path;
      lastBuildSignature = '';
      lastCenterIndex = -1;
    }

    if (!cachedBookHash) return;

    const signature = buildSignature(book.path, book.pages.length, options);
    const centerChanged = safeCenterIndex !== lastCenterIndex;

    state.centerIndex = safeCenterIndex;
    lastCenterIndex = safeCenterIndex;

    if (signature === lastBuildSignature && !centerChanged && state.units.length > 0) {
      return;
    }

    state.loading = true;
    try {
      const builder = createBuilder(options);
      const centerPosition = builder.framePositionForIndex(safeCenterIndex);
      state.units = buildWindowUnits(builder, centerPosition, state.preloadRange);
      lastBuildSignature = signature;
    } finally {
      state.loading = false;
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

  function createBuilder(options: PanoramaLoadOptions): PageFrameBuilder {
    const pages: Page[] = (bookStore.currentBook?.pages ?? []).map((page, i) => {
      const width = page.width ?? 0;
      const height = page.height ?? 0;
      return {
        index: page.index ?? i,
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

  function buildWindowUnits(
    builder: PageFrameBuilder,
    centerPosition: PagePosition,
    range: number
  ): PanoramaUnit[] {
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

    return positions
      .map((position) => {
        const frame = builder.buildFrame(position);
        return frame ? buildUnitFromFrame(frame, position) : null;
      })
      .filter((unit): unit is PanoramaUnit => Boolean(unit));
  }

  function buildUnitFromFrame(frame: PageFrame, position: PagePosition): PanoramaUnit | null {
    const book = bookStore.currentBook;
    if (!book || !cachedBookHash) return null;

    const images = frame.elements
      .filter((element) => !element.isDummy)
      .map((element): PanoramaImage | null => {
        const pageIndex = element.page.index;
        const page = book.pages[pageIndex];
        if (!page) return null;

        const entryIndex = page.entryIndex ?? pageIndex;
        return {
          url: getArchiveImageUrl(cachedBookHash!, entryIndex),
          pageIndex,
          width: element.page.width || page.width || undefined,
          height: element.page.height || page.height || undefined,
          cropRect: element.cropRect,
          scale: element.scale,
        };
      })
      .filter((image): image is PanoramaImage => Boolean(image));

    if (images.length === 0) return null;

    return {
      id: `unit-${position.index}-${position.part}-${images.map((image) => image.pageIndex).join('-')}`,
      startIndex: frame.frameRange.min.index,
      position,
      images,
    };
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function reset() {
    cachedBookHash = null;
    cachedBookPath = null;
    lastBuildSignature = '';
    lastCenterIndex = -1;
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
