import './app.css';
import { mount } from 'svelte';
import Settings from './lib/Settings.svelte';

const app = mount(Settings, {
	target: document.getElementById('app')!
});

export default app;
