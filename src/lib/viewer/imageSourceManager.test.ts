import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStreamSource,
  createStreamSourceFromBlob,
  createSuperResSource,
  createSuperResSourceFromPath,
  createSuperResSourceFromBlob,
  ensurePrimaryUrl,
  cloneSource,
  isStreamSource,
  isSuperResSource,
  revokeSourceObjectUrls
} from './imageSourceManager';
import { toAssetUrl } from '$lib/utils/assetProxy';

vi.mock('$lib/utils/assetProxy', () => ({
  toAssetUrl: vi.fn((input: string) => `asset://${input}`)
}));

const toAssetUrlMock = vi.mocked(toAssetUrl);

describe('imageSourceManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates stream source from blob using custom factory', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const factory = vi.fn(() => 'blob:custom');
    const source = createStreamSourceFromBlob({ blob, hash: 'abc', objectUrlFactory: factory });

    expect(source).toMatchObject({
      mode: 'archive_stream',
      primaryUrl: 'blob:custom',
      fallbackUrl: 'blob:custom',
      blob,
      hash: 'abc'
    });
    expect(factory).toHaveBeenCalledWith(blob);
  });

  it('creates super-res source from path via convertFileSrc', () => {
    const source = createSuperResSourceFromPath({ path: 'C:/images/a.png', hash: 'hash1' });
    expect(toAssetUrlMock).toHaveBeenCalledWith('C:/images/a.png');
    expect(source.mode).toBe('superres_url');
    expect(source.primaryUrl).toBe('asset://C:/images/a.png');
    expect(source.fallbackUrl).toBe('asset://C:/images/a.png');
    expect(source.localPath).toBe('C:/images/a.png');
  });

  it('creates super-res source from blob with fallback url when path missing', () => {
    const blob = new Blob(['data'], { type: 'image/webp' });
    const factory = vi.fn(() => 'blob:upscale');
    const source = createSuperResSourceFromBlob({ blob, hash: 'xyz', objectUrlFactory: factory });

    expect(source.primaryUrl).toBe('blob:upscale');
    expect(source.fallbackUrl).toBe('blob:upscale');
    expect(source.blob).toBe(blob);
    expect(factory).toHaveBeenCalledWith(blob);
    expect(toAssetUrlMock).not.toHaveBeenCalled();
  });

  it('cloneSource returns a shallow clone', () => {
    const original = createStreamSource('blob:url', 'hash', new Blob());
    const clone = cloneSource(original);

    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
  });

  it('ensurePrimaryUrl prefers primary then fallback then blob url', () => {
    const blob = new Blob(['x']);
    const source = createStreamSource('primary', 'hash', blob);
    expect(ensurePrimaryUrl(source)).toBe('primary');

    const merged = createSuperResSource({ hash: 'hash', fallbackUrl: 'fallback', blob });
    expect(ensurePrimaryUrl(merged)).toBe('fallback');

    const onlyBlob = createStreamSource('', 'hash2', blob);
    onlyBlob.fallbackUrl = null;
    expect(ensurePrimaryUrl(onlyBlob)).toMatch(/^blob:/);
  });

  it('type guards identify stream vs super-res sources', () => {
    const stream = createStreamSource('stream', 'hash');
    const superRes = createSuperResSource({ hash: 'hash2', fallbackUrl: 'fallback' });

    expect(isStreamSource(stream)).toBe(true);
    expect(isStreamSource(superRes)).toBe(false);
    expect(isSuperResSource(superRes)).toBe(true);
    expect(isSuperResSource(stream)).toBe(false);
  });

  it('revokeSourceObjectUrls revokes blob urls', () => {
    const revoke = vi.fn();
    const blobSource = createStreamSource('blob://source', 'hash');
    blobSource.fallbackUrl = 'blob://fallback';

    revokeSourceObjectUrls(blobSource, { revoke });
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenNthCalledWith(1, 'blob://source');
    expect(revoke).toHaveBeenNthCalledWith(2, 'blob://fallback');
  });
});
