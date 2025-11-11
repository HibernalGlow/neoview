<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { invoke } from '@tauri-apps/api/core';
	import { onMount } from 'svelte';

	let testResults = $state<string[]>([]);
	let isRunning = $state(false);

	async function testThumbnailSystem() {
		isRunning = true;
		testResults = [];

		try {
			// 1. 初始化缩略图管理器
			testResults.push('正在初始化缩略图管理器...');
			await invoke('init_thumbnail_manager', {
				thumbnailPath: 'D:\\temp\\neoview_thumbnails',
				rootPath: 'D:\\',
				size: 256
			});
			testResults.push('✓ 缩略图管理器初始化成功');

			// 2. 获取缩略图统计
			testResults.push('正在获取缩略图统计信息...');
			const stats = await invoke('get_thumbnail_stats');
			testResults.push(`✓ 缩略图统计: ${JSON.stringify(stats)}`);

			// 3. 测试生成缩略图
			testResults.push('正在测试生成缩略图...');
			// 这里需要一个实际的图片路径
			const testImagePath = 'D:\\test.jpg'; // 替换为实际图片路径
			try {
				const thumbnailUrl = await invoke('generate_file_thumbnail_new', {
					filePath: testImagePath
				});
				testResults.push(`✓ 缩略图生成成功: ${thumbnailUrl}`);
			} catch (e) {
				testResults.push(`⚠ 缩略图生成测试失败（可能是文件不存在）: ${e}`);
			}

			// 4. 测试获取目录缩略图
			testResults.push('正在测试获取目录缩略图...');
			try {
				const thumbnails = await invoke('get_thumbnails_for_path', {
					path: 'D:\\Pictures' // 替换为实际图片目录
				});
				testResults.push(`✓ 获取到 ${Array.isArray(thumbnails) ? thumbnails.length : 0} 个缩略图`);
			} catch (e) {
				testResults.push(`⚠ 获取目录缩略图失败: ${e}`);
			}

		} catch (error) {
			testResults.push(`✗ 测试失败: ${error}`);
		} finally {
			isRunning = false;
		}
	}

	async function clearThumbnails() {
		try {
			testResults.push('正在清空缩略图...');
			const count = await invoke('clear_all_thumbnails');
			testResults.push(`✓ 已清空 ${count} 个缩略图`);
		} catch (error) {
			testResults.push(`✗ 清空失败: ${error}`);
		}
	}

	onMount(() => {
		testResults.push('缩略图测试组件已加载');
	});
</script>

<div class="p-6 max-w-2xl mx-auto">
	<h1 class="text-2xl font-bold mb-4">缩略图系统测试</h1>
	
	<div class="space-y-4 mb-6">
		<Button 
			onclick={testThumbnailSystem} 
			disabled={isRunning}
			class="w-full"
		>
			{isRunning ? '测试中...' : '运行测试'}
		</Button>
		
		<Button 
			onclick={clearThumbnails} 
			variant="outline"
			class="w-full"
		>
			清空所有缩略图
		</Button>
	</div>

	<div class="space-y-2">
		<h2 class="text-lg font-semibold">测试结果:</h2>
		<div class="bg-muted p-4 rounded-md max-h-96 overflow-y-auto">
			{#each testResults as result}
				<div class="text-sm font-mono">{result}</div>
			{/each}
			{#if testResults.length === 0}
				<div class="text-muted-foreground">点击"运行测试"开始测试</div>
			{/if}
		</div>
	</div>
</div>