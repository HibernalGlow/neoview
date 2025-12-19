import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;
// 纯前端开发模式（不依赖 Tauri 后端）
const isWebOnly = process.env.WEB_ONLY === 'true';

export default defineConfig({
	plugins: [svelte({ compilerOptions: { runes: true } }), tailwindcss()],
	// 确保 Release 版本的资源路径正确
	base: './',
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib'),
			// 纯前端模式下，用 mock 替换 Tauri API
			...(isWebOnly ? {
				'@tauri-apps/api/core': path.resolve('./src/lib/mocks/tauriMock.ts'),
				'@tauri-apps/api/event': path.resolve('./src/lib/mocks/tauriMock.ts'),
				'@tauri-apps/api/path': path.resolve('./src/lib/mocks/tauriMock.ts'),
				'@tauri-apps/api/window': path.resolve('./src/lib/mocks/tauriMock.ts'),
				'@tauri-apps/api/webviewWindow': path.resolve('./src/lib/mocks/tauriMock.ts'),
				'@tauri-apps/plugin-dialog': path.resolve('./src/lib/mocks/tauriMock.ts'),
				'@tauri-apps/plugin-fs': path.resolve('./src/lib/mocks/tauriMock.ts'),
				'@tauri-apps/plugin-cli': path.resolve('./src/lib/mocks/tauriMock.ts'),
				'@tauri-apps/plugin-shell': path.resolve('./src/lib/mocks/tauriMock.ts'),
			} : {})
		}
	},
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
		watch: {
			ignored: ['**/src-tauri/**']
		}
	},
	envPrefix: ['VITE_', 'TAURI_ENV_*'],
	build: {
		target: process.env.TAURI_ENV_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
		minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
		sourcemap: !!process.env.TAURI_ENV_DEBUG,
		rollupOptions: {
			input: {
				main: path.resolve(__dirname, 'index.html'),
				settings: path.resolve(__dirname, 'settings.html'),
				cardwindow: path.resolve(__dirname, 'cardwindow.html')
			}
		}
	}
});
