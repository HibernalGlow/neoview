import { toAssetUrl } from '$lib/utils/assetProxy';

export type ViewerDisplayMode = 'archive_stream' | 'superres_url';

export interface ViewerImageSource {
  mode: ViewerDisplayMode;
  primaryUrl: string;
  fallbackUrl?: string | null;
  blob?: Blob | null;
  hash: string;
  localPath?: string | null;
  decoderId?: string | null;
}

export interface DecoderInput {
  data: Blob | ArrayBuffer;
  mimeType?: string;
}

export interface DecoderPlugin {
  id: string;
  priority: number;
  canHandle: (input: DecoderInput) => boolean | Promise<boolean>;
  decode: (input: DecoderInput) => Promise<string>;
}

const decoderPlugins: DecoderPlugin[] = [];

export function registerDecoderPlugin(plugin: DecoderPlugin) {
  if (!plugin || !plugin.id) return;
  if (decoderPlugins.find((p) => p.id === plugin.id)) {
    return;
  }
  decoderPlugins.push(plugin);
  decoderPlugins.sort((a, b) => b.priority - a.priority);
}

export function getDecoderPlugins(): DecoderPlugin[] {
  return [...decoderPlugins];
}

export async function decodeWithPlugins(input: DecoderInput): Promise<string | null> {
  for (const plugin of decoderPlugins) {
    try {
      const canHandle = await plugin.canHandle(input);
      if (!canHandle) continue;
      const result = await plugin.decode(input);
      if (result) return result;
    } catch (error) {
      console.warn(`decoder plugin ${plugin.id} failed`, error);
    }
  }
  return null;
}

export function createStreamSource(url: string, hash: string, blob?: Blob | null): ViewerImageSource {
  return {
    mode: 'archive_stream',
    primaryUrl: url,
    fallbackUrl: url,
    blob: blob ?? null,
    hash,
    localPath: null,
  };
}

export function createSuperResSource(options: {
  path?: string | null;
  hash: string;
  blob?: Blob | null;
  fallbackUrl?: string | null;
  decoderId?: string | null;
}): ViewerImageSource {
  const assetUrl = options.path ? toAssetUrl(options.path) : null;
  const primary = assetUrl || options.fallbackUrl || '';
  return {
    mode: 'superres_url',
    primaryUrl: primary,
    fallbackUrl: options.fallbackUrl ?? assetUrl,
    blob: options.blob ?? null,
    hash: options.hash,
    localPath: options.path ?? null,
    decoderId: options.decoderId ?? null,
  };
}

export function isValidSource(source: ViewerImageSource | null | undefined): source is ViewerImageSource {
  return Boolean(source && source.primaryUrl);
}

export function ensurePrimaryUrl(source: ViewerImageSource): string {
  if (source.primaryUrl) return source.primaryUrl;
  if (source.fallbackUrl) return source.fallbackUrl;
  if (source.blob) {
    return URL.createObjectURL(source.blob);
  }
  return '';
}

export function updateSourcePrimary(source: ViewerImageSource, nextUrl: string) {
  source.primaryUrl = nextUrl;
}

export function cloneSource(source: ViewerImageSource): ViewerImageSource {
  return {
    mode: source.mode,
    primaryUrl: source.primaryUrl,
    fallbackUrl: source.fallbackUrl,
    blob: source.blob ?? null,
    hash: source.hash,
    localPath: source.localPath ?? null,
    decoderId: source.decoderId ?? null,
  };
}

export function mergeSource(base: ViewerImageSource, updates: Partial<ViewerImageSource>): ViewerImageSource {
  return {
    ...base,
    ...updates,
  };
}

export function getSourcePath(source: ViewerImageSource | null | undefined): string | null {
  return source?.localPath ?? null;
}

export function getSourceBlob(source: ViewerImageSource | null | undefined): Blob | null {
  return source?.blob ?? null;
}

export async function preloadImage(url: string): Promise<void> {
  if (!url) return;
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}
