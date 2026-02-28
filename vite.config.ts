import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import packageJson from './package.json';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;
// 纯前端开发模式（不依赖 Tauri 后端）
const isWebOnly = process.env.WEB_ONLY === 'true';

export default defineConfig({
	plugins: [svelte({ compilerOptions: { runes: true } }), tailwindcss()],
	define: {
		__APP_VERSION__: JSON.stringify(packageJson.version)
	},
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
		},
		// 【优化】确保依赖去重，避免多个版本
		dedupe: [
			'svelte',
			'bits-ui',
			'runed',
			'svelte-toolbelt',
			'@floating-ui/core',
			'@floating-ui/dom',
			'@internationalized/date',
			'@tanstack/table-core',
			'@tauri-apps/api',
		]
	},
	// 【优化】预构建依赖，减少重复打包
	optimizeDeps: {
		include: [
			'svelte',
			'bits-ui',
			'runed',
			'svelte-toolbelt',
			'@floating-ui/core',
			'@floating-ui/dom',
			'@internationalized/date',
			'@tanstack/table-core',
			'@tauri-apps/api',
			'@tauri-apps/plugin-shell',
			'@tauri-apps/plugin-fs',
			'@tauri-apps/plugin-dialog',
			'@lucide/svelte',
			'clsx',
			'tailwind-merge',
			'zod',
			'idb',
			'viewerjs',
			'node-vibrant'
		],
		// 强制预构建，避免运行时重复
		force: false,
	},
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
		watch: {
			ignored: [
				'**/src-tauri/**',
				'**/ref/**',
				'**/dist/**',
				'**/cache/**',
				'**/temp/**',
				'**/output*/**',
				'**/.git/**'
			]
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
			},
			output: {
				// 【优化】手动分块，避免重复
				manualChunks: {
					// UI 组件库
					'vendor-ui': ['bits-ui', 'svelte-toolbelt', 'runed'],
					// 浮动 UI
					'vendor-floating': ['@floating-ui/core', '@floating-ui/dom'],
					// 日期处理
					'vendor-date': ['@internationalized/date'],
					// 表格
					'vendor-table': ['@tanstack/table-core'],
				}
			}
		}
	}
});
