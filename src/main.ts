import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { initializeCoreServices } from '$lib/core/bootstrap';
import { initializeRuntimeThemeListeners } from '$lib/utils/runtimeTheme';

initializeCoreServices();
initializeRuntimeThemeListeners();

if (typeof document !== 'undefined') {
	document.addEventListener(
		'contextmenu',
		(event) => {
			// 全局禁用默认右键菜单，统一使用应用内自定义菜单
			event.preventDefault();
		},
		{ capture: true }
	);
}

const app = mount(App, {
	target: document.getElementById('app')!
});

export default app;
