<script lang="ts">
/**
 * 渲染模式测试卡片
 * 从 BenchmarkPanel 提取
 */
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '$lib/components/ui/button';
import { FolderOpen, Play, Trash2 } from '@lucide/svelte';
import { settingsManager } from '$lib/settings/settingsManager';
import Viewer from 'viewerjs';

interface RendererTestResult {
	mode: string;
	totalImages: number;
	loadTimes: number[];
	avgLoadTime: number;
	switchTimes: number[];
	avgSwitchTime: number;
	fps: number;
	success: boolean;
	error: string | null;
}

let selectedRendererArchive = $state<string>('');
let rendererTestResults = $state<RendererTestResult[]>([]);
let isRendererTesting = $state(false);
let rendererTestCount = $state<number>(10);

let settings = $state(settingsManager.getSettings());
settingsManager.addListener((s) => { settings = s; });
const currentRendererMode = $derived(settings.view.renderer?.mode ?? 'standard');
const viewerJSEnabled = $derived(settings.view.renderer?.useViewerJS ?? false);

async function selectRendererArchive() {
	const file = await open({
		multiple: false,
		filters: [{ name: '压缩包', extensions: ['zip', 'cbz', 'rar', '7z', 'cb7', 'cbr'] }]
	});

	if (file && typeof file === 'string') {
		selectedRendererArchive = file;
	}
}

async function runRendererTest() {
	if (!selectedRendererArchive) return;
	
	isRendererTesting = true;
	rendererTestResults = [];
	
	const testModes = ['native', 'viewerjs'];
	
	try {
		const imageList = await invoke<string[]>('get_images_from_archive', {
			archivePath: selectedRendererArchive
		});
		
		if (imageList.length === 0) {
			for (const mode of testModes) {
				rendererTestResults = [...rendererTestResults, {
					mode,
					totalImages: 0,
					loadTimes: [],
					avgLoadTime: 0,
					switchTimes: [],
					avgSwitchTime: 0,
					fps: 0,
					success: false,
					error: '压缩包中没有图片'
				}];
			}
			isRendererTesting = false;
			return;
		}
		
		const testImages = imageList.slice(0, rendererTestCount);
		
		const testContainer = document.createElement('div');
		testContainer.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:600px;overflow:hidden;';
		document.body.appendChild(testContainer);
		
		for (const mode of testModes) {
			try {
				const loadTimes: number[] = [];
				
				for (let i = 0; i < testImages.length; i++) {
					const startLoad = performance.now();
					
					const imageData = await invoke<number[]>('load_image_from_archive', {
						archivePath: selectedRendererArchive,
						filePath: testImages[i]
					});
					
					const blob = new Blob([new Uint8Array(imageData)]);
					const url = URL.createObjectURL(blob);
					
					if (mode === 'viewerjs') {
						await new Promise<void>((resolve, reject) => {
							testContainer.innerHTML = '';
							const img = document.createElement('img');
							img.style.display = 'none';
							img.src = url;
							testContainer.appendChild(img);
							
							img.onload = () => {
								try {
									const viewer = new Viewer(img, {
										inline: true,
										navbar: false,
										toolbar: false,
										title: false,
										button: false,
										backdrop: false,
										transition: false,
										container: testContainer,
										ready: () => {
											viewer.destroy();
											URL.revokeObjectURL(url);
											resolve();
										}
									});
									viewer.show();
								} catch (e) {
									URL.revokeObjectURL(url);
									reject(e);
								}
							};
							img.onerror = () => {
								URL.revokeObjectURL(url);
								reject(new Error('图片加载失败'));
							};
						});
					} else {
						await new Promise<void>((resolve, reject) => {
							testContainer.innerHTML = '';
							const img = document.createElement('img');
							img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;';
							testContainer.appendChild(img);
							
							img.onload = () => {
								URL.revokeObjectURL(url);
								resolve();
							};
							img.onerror = () => {
								URL.revokeObjectURL(url);
								reject(new Error('图片加载失败'));
							};
							img.src = url;
						});
					}
					
					loadTimes.push(performance.now() - startLoad);
				}
				
				const avgLoadTime = loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length;
				const fps = 1000 / avgLoadTime;
				
				rendererTestResults = [...rendererTestResults, {
					mode,
					totalImages: testImages.length,
					loadTimes,
					avgLoadTime,
					switchTimes: [],
					avgSwitchTime: 0,
					fps,
					success: true,
					error: null
				}];
			} catch (err) {
				rendererTestResults = [...rendererTestResults, {
					mode,
					totalImages: 0,
					loadTimes: [],
					avgLoadTime: 0,
					switchTimes: [],
					avgSwitchTime: 0,
					fps: 0,
					success: false,
					error: String(err)
				}];
			}
		}
		
		testContainer.remove();
	} catch (err) {
		console.error('渲染模式测试失败:', err);
	}
	
	isRendererTesting = false;
}

function clearRendererArchive() {
	selectedRendererArchive = '';
	rendererTestResults = [];
}
</script>

<div class="space-y-2">
	<div class="text-[10px] text-muted-foreground space-y-1">
		<p>当前模式: <span class="font-mono text-primary">{currentRendererMode}</span></p>
		<p>ViewerJS: <span class="font-mono {viewerJSEnabled ? 'text-green-500' : 'text-red-500'}">{viewerJSEnabled ? '启用' : '禁用'}</span></p>
	</div>
	
	<div class="flex gap-2">
		<Button onclick={selectRendererArchive} variant="outline" size="sm" class="flex-1 text-xs">
			<FolderOpen class="h-3 w-3 mr-1" />
			{selectedRendererArchive ? '已选择' : '选择压缩包'}
		</Button>
		<Button
			onclick={runRendererTest}
			disabled={isRendererTesting || !selectedRendererArchive}
			size="sm"
			class="flex-1 text-xs"
		>
			<Play class="h-3 w-3 mr-1" />
			{isRendererTesting ? '测试中...' : '测试渲染'}
		</Button>
		{#if selectedRendererArchive}
			<Button onclick={clearRendererArchive} variant="ghost" size="sm" class="text-xs">
				<Trash2 class="h-3 w-3" />
			</Button>
		{/if}
	</div>
	
	{#if selectedRendererArchive}
		<div class="text-[10px] text-muted-foreground truncate">
			{selectedRendererArchive.split(/[/\\]/).pop()}
		</div>
	{/if}
	
	<!-- 测试数量 -->
	<div class="flex items-center gap-2 text-[10px]">
		<span class="text-muted-foreground">图片数:</span>
		<div class="flex gap-1">
			{#each [5, 10, 20, 50] as count}
				<button
					type="button"
					class="px-2 py-0.5 rounded {rendererTestCount === count ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}"
					onclick={() => rendererTestCount = count}
				>
					{count}
				</button>
			{/each}
		</div>
	</div>
	
	<!-- 结果 -->
	{#if rendererTestResults.length > 0}
		<div class="space-y-2 text-[10px]">
			{#each rendererTestResults as result}
				<div class="border rounded p-2 space-y-1">
					<div class="flex justify-between font-medium">
						<span class:text-blue-500={result.mode === 'native'}
							  class:text-green-500={result.mode === 'viewerjs'}>
							{result.mode === 'native' ? '原生渲染' : 'ViewerJS'}
						</span>
						<span class="font-mono {result.success ? 'text-green-600' : 'text-red-500'}">
							{result.success ? `${result.avgLoadTime.toFixed(1)}ms` : '失败'}
						</span>
					</div>
					{#if result.success}
						<div class="text-muted-foreground">
							FPS: <span class="font-mono text-primary">{result.fps.toFixed(1)}</span>
						</div>
					{:else if result.error}
						<div class="text-red-500 text-[9px]">{result.error}</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
