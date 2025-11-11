<script lang="ts">
	/**
	 * Thumbnail System Test Component
	 * 缩略图系统测试组件
	 */
	import { invoke } from '@tauri-apps/api/core';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Loader2, CheckCircle, XCircle, Play, RotateCcw } from '@lucide/svelte';

	interface TestResult {
		name: string;
		success: boolean;
		message: string;
		duration?: number;
	}

	let isRunning = $state(false);
	let results = $state<TestResult[]>([]);
	let currentTest = $state<string>('');

	const testCases = [
		{ name: '初始化缩略图管理器', command: 'init_thumbnail_manager' },
		{ name: '生成文件缩略图', command: 'generate_file_thumbnail_new' },
		{ name: '生成文件夹缩略图', command: 'generate_folder_thumbnail' },
		{ name: '获取缩略图信息', command: 'get_thumbnail_info' },
		{ name: '获取缩略图统计', command: 'get_thumbnail_stats' },
		{ name: '清理缩略图', command: 'cleanup_thumbnails' }
	];

	async function runAllTests() {
		isRunning = true;
		results = [];

		try {
			// 初始化缩略图管理器
			currentTest = '初始化缩略图管理器';
			const startTime = Date.now();

			await invoke('init_thumbnail_manager', {
				thumbnailPath: 'D:\\temp\\neoview_thumbnails_test',
				rootPath: 'D:\\',
				size: 256
			});

			results.push({
				name: '初始化缩略图管理器',
				success: true,
				message: '缩略图管理器初始化成功',
				duration: Date.now() - startTime
			});

			// 测试生成文件缩略图
			currentTest = '生成文件缩略图';
			await testGenerateFileThumbnail();

			// 测试生成文件夹缩略图
			currentTest = '生成文件夹缩略图';
			await testGenerateFolderThumbnail();

			// 测试获取缩略图信息
			currentTest = '获取缩略图信息';
			await testGetThumbnailInfo();

			// 测试获取统计信息
			currentTest = '获取缩略图统计';
			await testGetThumbnailStats();

			// 测试清理功能
			currentTest = '清理缩略图';
			await testCleanupThumbnails();

		} catch (error) {
			results.push({
				name: currentTest,
				success: false,
				message: `测试失败: ${error}`
			});
		} finally {
			isRunning = false;
			currentTest = '';
		}
	}

	async function testGenerateFileThumbnail() {
		const startTime = Date.now();

		try {
			// 查找测试图片
			const images = await invoke<string[]>('get_images_in_directory', {
				path: 'D:\\',
				recursive: true
			});

			if (images.length === 0) {
				throw new Error('未找到测试图片文件');
			}

			const testImage = images[0];
			const thumbnailUrl = await invoke<string>('generate_file_thumbnail_new', {
				filePath: testImage
			});

			results.push({
				name: '生成文件缩略图',
				success: true,
				message: `成功生成缩略图: ${thumbnailUrl.substring(0, 50)}...`,
				duration: Date.now() - startTime
			});
		} catch (error) {
			results.push({
				name: '生成文件缩略图',
				success: false,
				message: `生成失败: ${error}`,
				duration: Date.now() - startTime
			});
		}
	}

	async function testGenerateFolderThumbnail() {
		const startTime = Date.now();

		try {
			// 查找包含图片的文件夹
			const entries = await invoke<any[]>('read_directory', { path: 'D:\\' });

			let testFolder = null;
			for (const entry of entries) {
				if (entry.is_dir && !entry.name.startsWith('.')) {
					try {
						const images = await invoke<string[]>('get_images_in_directory', {
							path: `D:\\${entry.name}`,
							recursive: false
						});
						if (images.length > 0) {
							testFolder = `D:\\${entry.name}`;
							break;
						}
					} catch (e) {
						// 忽略权限错误
					}
				}
			}

			if (!testFolder) {
				throw new Error('未找到包含图片的测试文件夹');
			}

			const thumbnailUrl = await invoke<string>('generate_folder_thumbnail', {
				folderPath: testFolder
			});

			results.push({
				name: '生成文件夹缩略图',
				success: true,
				message: `成功生成文件夹缩略图: ${thumbnailUrl.substring(0, 50)}...`,
				duration: Date.now() - startTime
			});
		} catch (error) {
			results.push({
				name: '生成文件夹缩略图',
				success: false,
				message: `生成失败: ${error}`,
				duration: Date.now() - startTime
			});
		}
	}

	async function testGetThumbnailInfo() {
		const startTime = Date.now();

		try {
			// 使用之前生成的缩略图进行测试
			const images = await invoke<string[]>('get_images_in_directory', {
				path: 'D:\\',
				recursive: true
			});

			if (images.length === 0) {
				throw new Error('未找到测试图片文件');
			}

			const testImage = images[0];
			const thumbnailInfo = await invoke<any>('get_thumbnail_info', {
				filePath: testImage
			});

			if (!thumbnailInfo) {
				throw new Error('未获取到缩略图信息');
			}

			results.push({
				name: '获取缩略图信息',
				success: true,
				message: `成功获取信息: ${thumbnailInfo.width}x${thumbnailInfo.height}`,
				duration: Date.now() - startTime
			});
		} catch (error) {
			results.push({
				name: '获取缩略图信息',
				success: false,
				message: `获取失败: ${error}`,
				duration: Date.now() - startTime
			});
		}
	}

	async function testGetThumbnailStats() {
		const startTime = Date.now();

		try {
			const stats = await invoke<any>('get_thumbnail_stats');

			results.push({
				name: '获取缩略图统计',
				success: true,
				message: `统计信息: ${stats.total_thumbnails || 0} 个缩略图, ${stats.total_size_mb || 0} MB`,
				duration: Date.now() - startTime
			});
		} catch (error) {
			results.push({
				name: '获取缩略图统计',
				success: false,
				message: `获取失败: ${error}`,
				duration: Date.now() - startTime
			});
		}
	}

	async function testCleanupThumbnails() {
		const startTime = Date.now();

		try {
			const removedCount = await invoke<number>('cleanup_thumbnails', { days: 30 });

			results.push({
				name: '清理缩略图',
				success: true,
				message: `成功清理 ${removedCount} 个过期缩略图`,
				duration: Date.now() - startTime
			});
		} catch (error) {
			results.push({
				name: '清理缩略图',
				success: false,
				message: `清理失败: ${error}`,
				duration: Date.now() - startTime
			});
		}
	}

	function clearResults() {
		results = [];
	}

	function getStatusIcon(success: boolean) {
		return success ? CheckCircle : XCircle;
	}

	function getStatusColor(success: boolean) {
		return success ? 'text-green-600' : 'text-red-600';
	}

	$: passedTests = results.filter(r => r.success).length;
	$: totalTests = results.length;
	$: successRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;
</script>

<div class="p-6 max-w-4xl mx-auto">
	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<Play class="h-5 w-5" />
				缩略图系统测试
			</CardTitle>
			<CardDescription>
				测试缩略图系统的各项功能，包括生成、缓存、清理等
			</CardDescription>
		</CardHeader>

		<CardContent class="space-y-4">
			<!-- 控制按钮 -->
			<div class="flex gap-2">
				<Button
					onclick={runAllTests}
					disabled={isRunning}
					class="flex items-center gap-2"
				>
					{#if isRunning}
						<Loader2 class="h-4 w-4 animate-spin" />
						运行中: {currentTest}
					{:else}
						<Play class="h-4 w-4" />
						运行所有测试
					{/if}
				</Button>

				<Button
					variant="outline"
					onclick={clearResults}
					disabled={isRunning}
					class="flex items-center gap-2"
				>
					<RotateCcw class="h-4 w-4" />
					清除结果
				</Button>
			</div>

			<!-- 测试结果汇总 -->
			{#if results.length > 0}
				<div class="border rounded-lg p-4">
					<div class="flex items-center justify-between mb-4">
						<h3 class="text-lg font-semibold">测试结果</h3>
						<Badge variant={successRate === 100 ? 'default' : 'destructive'}>
							{passedTests}/{totalTests} 通过 ({successRate}%)
						</Badge>
					</div>

					<div class="space-y-2">
						{#each results as result}
							<div class="flex items-center justify-between p-3 border rounded">
								<div class="flex items-center gap-3">
									<svelte:component
										this={getStatusIcon(result.success)}
										class="h-5 w-5 {getStatusColor(result.success)}"
									/>
									<div>
										<div class="font-medium">{result.name}</div>
										<div class="text-sm text-muted-foreground">{result.message}</div>
									</div>
								</div>
								{#if result.duration}
									<span class="text-sm text-muted-foreground">{result.duration}ms</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- 测试说明 -->
			<div class="border rounded-lg p-4 bg-muted/50">
				<h4 class="font-semibold mb-2">测试说明</h4>
				<ul class="text-sm space-y-1 text-muted-foreground">
					<li>• <strong>初始化缩略图管理器</strong>: 测试缩略图系统的初始化</li>
					<li>• <strong>生成文件缩略图</strong>: 测试从图片文件生成缩略图</li>
					<li>• <strong>生成文件夹缩略图</strong>: 测试从文件夹生成缩略图（查找子目录中的图片）</li>
					<li>• <strong>获取缩略图信息</strong>: 测试获取缩略图的详细信息</li>
					<li>• <strong>获取缩略图统计</strong>: 测试获取系统统计信息</li>
					<li>• <strong>清理缩略图</strong>: 测试清理过期缩略图的功能</li>
				</ul>
			</div>
		</CardContent>
	</Card>
</div>