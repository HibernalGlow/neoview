import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { initializeCoreServices } from '$lib/core/bootstrap';

initializeCoreServices();

const app = mount(App, {
	target: document.getElementById('app')!
});

export default app;
