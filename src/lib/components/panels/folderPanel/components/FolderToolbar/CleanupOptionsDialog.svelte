<script lang="ts">
	/**
	 * CleanupOptionsDialog - 高级清理选项对话框
	 * 支持按数量、时间、文件夹路径清理记录
	 */
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { FolderOpen, Calendar, Hash, Trash2 } from '@lucide/svelte';
	import { open as openTauriDialog } from '@tauri-apps/plugin-dialog';
	import { unifiedHistoryStore } from '$lib/stores/unifiedHistory.svelte';
	import { bookmarkStore } from '$lib/stores/bookmark.svelte';
	import { showSuccessToast } from '$lib/utils/toast';

	interface Props {
		open: boolean;
		virtualMode: 'history' | 'bookmark';
		onRefresh?: () => void;
	}

	let { open = $bindable(false), virtualMode, onRefresh }: Props = $props();

	// 表单状态
	let clearCount = $state(10);
	let clearDays = $state(30);
	let clearFolderPath = $state('');

	async function selectFolder() {
		try {
			const selected = await openTauriDialog({
				directory: true,
				multiple: false,
				title: '选择要清理的文件夹'
			});
			if (selected && typeof selected === 'string') {
				clearFolderPath = selected;
			}
		} catch (err) {
			console.error('Failed to open directory dialog:', err);
		}
	}

	function handleClearCount() {
		if (virtualMode === 'history') {
			unifiedHistoryStore.clearOldest(clearCount);
		} else {
			bookmarkStore.clearOldest(clearCount);
		}
		showSuccessToast('清理完成', `已清理 ${clearCount} 条最旧记录`);
		onRefresh?.();
		open = false;
	}

	function handleClearByDate() {
		if (virtualMode === 'history') {
			unifiedHistoryStore.clearByDate(clearDays);
		} else {
			bookmarkStore.clearByDate(clearDays);
		}
		showSuccessToast('清理完成', `已清理超过 ${clearDays} 天的记录`);
		onRefresh?.();
		open = false;
	}

	function handleClearByFolder() {
		if (!clearFolderPath) return;
		if (virtualMode === 'history') {
			unifiedHistoryStore.clearByFolder(clearFolderPath);
		} else {
			bookmarkStore.clearByFolder(clearFolderPath);
		}
		showSuccessToast('清理完成', `已清理文件夹: ${clearFolderPath}`);
		onRefresh?.();
		open = false;
	}

	function handleClearAll() {
		if (confirm(`确定要清空所有${virtualMode === 'history' ? '历史记录' : '书签'}吗？此操作不可撤销。`)) {
			if (virtualMode === 'history') {
				unifiedHistoryStore.clear();
			} else {
				bookmarkStore.clear();
			}
			showSuccessToast('清理完成', `已清空所有${virtualMode === 'history' ? '历史' : '书签'}`);
			onRefresh?.();
			open = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[425px]">
		<Dialog.Header>
			<Dialog.Title>高级清理选项 ({virtualMode === 'history' ? '历史' : '书签'})</Dialog.Title>
			<Dialog.Description>
				您可以选择不同的方式来清理您的记录。
			</Dialog.Description>
		</Dialog.Header>

		<div class="grid gap-6 py-4">
			<!-- 按数量清理 -->
			<div class="grid gap-2">
				<Label class="flex items-center gap-2">
					<Hash class="h-4 w-4" />
					清理最旧的记录数量
				</Label>
				<div class="flex gap-2">
					<Input type="number" bind:value={clearCount} min="1" class="flex-1" />
					<Button variant="secondary" onclick={handleClearCount}>执行</Button>
				</div>
			</div>

			<!-- 按时间清理 -->
			<div class="grid gap-2">
				<Label class="flex items-center gap-2">
					<Calendar class="h-4 w-4" />
					清理指定天数之前的记录
				</Label>
				<div class="flex gap-2">
					<Input type="number" bind:value={clearDays} min="1" class="flex-1" />
					<Button variant="secondary" onclick={handleClearByDate}>执行</Button>
				</div>
			</div>

			<!-- 按文件夹清理 -->
			<div class="grid gap-2">
				<Label class="flex items-center gap-2">
					<FolderOpen class="h-4 w-4" />
					清理特定文件夹下的记录
				</Label>
				<div class="flex gap-2">
					<Input placeholder="输入或选择文件夹路径" bind:value={clearFolderPath} class="flex-1" />
					<Button variant="outline" size="icon" onclick={selectFolder}>
						<FolderOpen class="h-4 w-4" />
					</Button>
					<Button variant="secondary" onclick={handleClearByFolder} disabled={!clearFolderPath}>执行</Button>
				</div>
			</div>

			<div class="border-t pt-4">
				<Button variant="destructive" class="w-full gap-2" onclick={handleClearAll}>
					<Trash2 class="h-4 w-4" />
					一键清除全部记录
				</Button>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
