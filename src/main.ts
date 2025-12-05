import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { initializeCoreServices } from '$lib/core/bootstrap';
import { initializeRuntimeThemeListeners } from '$lib/utils/runtimeTheme';
import { initFontManager } from '$lib/utils/fontManager';
import { initSidebarConfigListener } from '$lib/stores/sidebarConfig.svelte';
import { getMatches } from '@tauri-apps/plugin-cli';
import { openFileSystemItem } from '$lib/utils/navigationUtils';
import { getFileMetadata } from '$lib/api/filesystem';

initializeCoreServices();
initializeRuntimeThemeListeners();
initFontManager();
initSidebarConfigListener();

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

async function handleCliStartup() {
	try {
		const matches = await getMatches();
		const arg = matches.args?.path?.value as string | string[] | undefined;
		const path =
			typeof arg === 'string'
				? arg
				: Array.isArray(arg) && arg.length > 0
				? arg[0]
				: undefined;
		if (!path) {
			return;
		}
		const meta = await getFileMetadata(path);
		await openFileSystemItem(path, meta.isDir);
	} catch (error) {
		console.error('CLI startup failed', error);
	}
}

const app = mount(App, {
	target: document.getElementById('app')!
});

handleCliStartup();

export default app;
