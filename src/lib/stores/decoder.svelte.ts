/**
 * NeoView - Decoder Settings Store
 * 解码器设置存储
 */

import { persisted } from '$lib/utils/store';

// 解码器设置
export const decoderSettings = persisted('decoder-settings', {
  useFrontendDecode: true,
  preferredFormats: ['avif', 'heif', 'heic', 'webp'],
  thumbnailQuality: 0.8,
  enableJXL: false,
  fallbackToBackend: true
});

// 获取当前设置
export function getDecoderSettings() {
  return decoderSettings.get();
}

// 更新设置
export function updateDecoderSettings(newSettings: Partial<typeof decoderSettings.get()>) {
  decoderSettings.update(settings => ({
    ...settings,
    ...newSettings
  }));
}

// 重置为默认设置
export function resetDecoderSettings() {
  decoderSettings.set({
    useFrontendDecode: true,
    preferredFormats: ['avif', 'heif', 'heic', 'webp'],
    thumbnailQuality: 0.8,
    enableJXL: false,
    fallbackToBackend: true
  });
}