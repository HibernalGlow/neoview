import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { initializeCoreServices } from '$lib/core/bootstrap';
import { initializeRuntimeThemeListeners } from '$lib/utils/runtimeTheme';

initializeCoreServices();
initializeRuntimeThemeListeners();

const app = mount(App, {
	target: document.getElementById('app')!
});

export default app;
