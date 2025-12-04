import './app.css';
import { mount } from 'svelte';
import Settings from './lib/Settings.svelte';
import { initializeRuntimeThemeListeners } from '$lib/utils/runtimeTheme';
import { initFontManager } from '$lib/utils/fontManager';

initializeRuntimeThemeListeners();
// 初始化字体管理器（设置窗口也需要应用自定义字体）
initFontManager();

if (typeof document !== 'undefined') {
	document.addEventListener(
		'contextmenu',
		(event) => {
			// 设置窗口同样禁用默认右键菜单，统一使用应用内菜单
			event.preventDefault();
		},
		{ capture: true }
	);
}

const app = mount(Settings, {
	target: document.getElementById('app')!
});

export default app;
