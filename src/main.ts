import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

// 导入 PreloadManager 以初始化全局实例
import './lib/utils/PreloadManager';

const app = mount(App, {
	target: document.getElementById('app')!
});

export default app;
