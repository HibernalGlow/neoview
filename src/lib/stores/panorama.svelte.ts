/**
 * 全景模式状态管理
 * 独立于 viewMode，可以与单页/双页组合使用
 */

import { writable } from 'svelte/store';

// 全景模式开关
export const panoramaEnabled = writable<boolean>(false);

// 全景模式下的页面模式（继承自普通 viewMode 或独立设置）
export const panoramaPageMode = writable<'single' | 'double'>('single');

// 切换全景模式
export function togglePanorama() {
  panoramaEnabled.update(v => !v);
}

// 设置全景页面模式
export function setPanoramaPageMode(mode: 'single' | 'double') {
  panoramaPageMode.set(mode);
}

// 切换全景页面模式
export function togglePanoramaPageMode() {
  panoramaPageMode.update(v => v === 'single' ? 'double' : 'single');
}
