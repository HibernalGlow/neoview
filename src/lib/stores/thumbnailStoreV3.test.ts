import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Shared mocks (reset in beforeEach)
const invokeMock = vi.fn();
const listenMock = vi.fn(async () => () => {});
const addThumbnailMock = vi.fn();
const addThumbnailsBatchMock = vi.fn();
const removeThumbnailMock = vi.fn();
const removeThumbnailsBatchMock = vi.fn();
const getThumbUrlMock = vi.fn((path: string) => `neoview://${path}`);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

vi.mock('./fileBrowser.svelte', () => ({
  fileBrowserStore: {
    addThumbnail: addThumbnailMock,
    addThumbnailsBatch: addThumbnailsBatchMock,
    removeThumbnail: removeThumbnailMock,
    removeThumbnailsBatch: removeThumbnailsBatchMock,
  },
}));

vi.mock('$lib/api/imageProtocol', () => ({
  getThumbUrl: (...args: unknown[]) => getThumbUrlMock(...args),
}));

describe('thumbnailStoreV3 request queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockReset();
    listenMock.mockReset();
    addThumbnailMock.mockReset();
    addThumbnailsBatchMock.mockReset();
    removeThumbnailMock.mockReset();
    removeThumbnailsBatchMock.mockReset();
    getThumbUrlMock.mockReset();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('should split large requests into batches (64 max per invoke)', async () => {
    vi.resetModules();
    const mod = await import('./thumbnailStoreV3.svelte');

    // init sets initialized flag; mocked invoke does nothing
    await mod.initThumbnailServiceV3('', 256);

    const paths = Array.from({ length: 70 }, (_, i) => `/p/${i}`);
    await mod.requestVisibleThumbnails(paths, '/dir');

    // flush throttled sends
    await vi.runAllTimersAsync();

    const batchSizes = invokeMock.mock.calls
      .filter((c) => (c?.[0] as string) === 'request_visible_thumbnails_v3')
      .map((c) => (c?.[1] as { paths: string[] }).paths.length);

    expect(batchSizes).toEqual([64, 6]);
  });

  it('should cap pending queue to 512 items (drops oldest beyond cap)', async () => {
    vi.resetModules();
    const mod = await import('./thumbnailStoreV3.svelte');

    await mod.initThumbnailServiceV3('', 256);

    const paths = Array.from({ length: 600 }, (_, i) => `/p/${i}`);
    await mod.requestVisibleThumbnails(paths, '/dir');

    await vi.runAllTimersAsync();

    const sentPathsCount = invokeMock.mock.calls
      .filter((c) => (c?.[0] as string) === 'request_visible_thumbnails_v3')
      .reduce((sum, c) => sum + (c?.[1] as { paths: string[] }).paths.length, 0);

    expect(sentPathsCount).toBe(512);
  });

  it('should request only newly entered visible paths in delta mode', async () => {
    vi.resetModules();
    const mod = await import('./thumbnailStoreV3.svelte');

    await mod.initThumbnailServiceV3('', 256);

    await mod.requestVisibleThumbnailsDelta(['/p/1', '/p/2', '/p/3'], '/dir');
    await vi.runAllTimersAsync();

    await mod.requestVisibleThumbnailsDelta(['/p/1', '/p/2', '/p/3'], '/dir');
    await vi.runAllTimersAsync();

    await mod.requestVisibleThumbnailsDelta(['/p/2', '/p/3', '/p/4'], '/dir');
    await vi.runAllTimersAsync();

    const batches = invokeMock.mock.calls
      .filter((c) => (c?.[0] as string) === 'request_visible_thumbnails_v3')
      .map((c) => (c?.[1] as { paths: string[] }).paths);

    expect(batches).toEqual([['/p/1', '/p/2', '/p/3'], ['/p/4']]);
  });

  it('should delta-request visible and prefetch only non-visible paths', async () => {
    vi.resetModules();
    const mod = await import('./thumbnailStoreV3.svelte');

    await mod.initThumbnailServiceV3('', 256);

    await mod.requestVisibleThumbnailsDeltaWithPrefetch(
      ['/p/3', '/p/4'],
      ['/p/1', '/p/2', '/p/3', '/p/4', '/p/5', '/p/6'],
      '/dir'
    );
    await vi.runAllTimersAsync();

    const batches = invokeMock.mock.calls
      .filter((c) => (c?.[0] as string) === 'request_visible_thumbnails_v3')
      .map((c) => (c?.[1] as { paths: string[] }).paths);

    expect(batches.length).toBeGreaterThanOrEqual(1);
    expect(batches[0]).toEqual(expect.arrayContaining(['/p/3', '/p/4']));
    expect(batches.flat()).toEqual(expect.arrayContaining(['/p/1', '/p/2', '/p/5', '/p/6']));
    expect(batches.flat()).not.toContain(undefined);
  });
});
