/**
 * CardWindow 入口文件
 * 用于卡片独立窗口的初始化
 */
import './app.css';
import { mount } from 'svelte';
import CardWindow from './lib/CardWindow.svelte';
import { initializeRuntimeThemeListeners } from '$lib/utils/runtimeTheme';
import { initFontManager } from '$lib/utils/fontManager';

// 初始化主题和字体
initializeRuntimeThemeListeners();
initFontManager();

// 禁用默认右键菜单
if (typeof document !== 'undefined') {
	document.addEventListener(
		'contextmenu',
		(event) => {
			event.preventDefault();
		},
		{ capture: true }
	);
}

const app = mount(CardWindow, {
	target: document.getElementById('app')!
});

export default app;
