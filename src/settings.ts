import './app.css';
import { mount } from 'svelte';
import Settings from './lib/Settings.svelte';
import { initializeRuntimeThemeListeners } from '$lib/utils/runtimeTheme';

initializeRuntimeThemeListeners();

const app = mount(Settings, {
	target: document.getElementById('app')!
});

export default app;
