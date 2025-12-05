/**
 * 设置覆盖层状态管理
 * 用于在主窗口内显示设置面板
 */
import { writable } from 'svelte/store';

export const settingsOverlayOpen = writable(false);

export function openSettingsOverlay() {
  settingsOverlayOpen.set(true);
}

export function closeSettingsOverlay() {
  settingsOverlayOpen.set(false);
}

export function toggleSettingsOverlay() {
  settingsOverlayOpen.update(v => !v);
}
