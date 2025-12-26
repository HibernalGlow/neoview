<script lang="ts">
/**
 * MigrationBar - 快速迁移栏组件
 * 从 FileBrowser 迁移过来的功能
 */
import { onMount } from 'svelte';
import { Folder, Trash2, Settings } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { FileSystemAPI } from '$lib/api';
import { showSuccessToast, showErrorToast } from '$lib/utils/toast';
import { tabSelectedItems, folderTabActions } from '../stores/folderTabStore';

// 别名映射
const selectedItems = tabSelectedItems;

interface Props {
	showManager?: boolean;
	onToggleManager?: () => void;
}

let { showManager = false, onToggleManager }: Props = $props();

// 快速目标类型
interface QuickFolderTarget {
	id: string;
	name: string;
	path: string;
}

// 状态
let quickFolderTargets = $state<QuickFolderTarget[]>([]);
let quickFolderMode = $state<'copy' | 'move'>('copy');

const QUICK_FOLDER_STORAGE_KEY = 'neoview-filebrowser-quick-folders';

// 加载快速目标
function loadQuickFolderTargets() {
	try {
		const raw = localStorage.getItem(QUICK_FOLDER_STORAGE_KEY);
		if (!raw) return;
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			quickFolderTargets = parsed
				.map((t: any) => ({
					id: String(t.id ?? ''),
					name: String(t.name ?? ''),
					path: String(t.path ?? '')
				}))
				.filter((t: QuickFolderTarget) => t.name && t.path);
			quickFolderMode = 'copy';
		} else if (parsed && typeof parsed === 'object') {
			const rawTargets = Array.isArray((parsed as any).targets) ? (parsed as any).targets : [];
			quickFolderTargets = rawTargets
				.map((t: any) => ({
					id: String(t.id ?? ''),
					name: String(t.name ?? ''),
					path: String(t.path ?? '')
				}))
				.filter((t: QuickFolderTarget) => t.name && t.path);
			const mode = parsed.mode;
			if (mode === 'copy' || mode === 'move') {
				quickFolderMode = mode;
			}
		}
	} catch (err) {
		console.error('[MigrationBar] Failed to load quick folder targets:', err);
	}
}

// 保存快速目标
function saveQuickFolderTargets() {
	try {
		const payload = {
			mode: quickFolderMode,
			targets: quickFolderTargets
		};
		localStorage.setItem(QUICK_FOLDER_STORAGE_KEY, JSON.stringify(payload));
	} catch (err) {
		console.error('[MigrationBar] Failed to save quick folder targets:', err);
	}
}

// 添加快速目标
function addQuickFolderTarget() {
	const basePath = '';
	const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	quickFolderTargets = [...quickFolderTargets, { id, name: '新目标', path: basePath }];
	saveQuickFolderTargets();
}

// 更新快速目标名称
function updateQuickFolderName(id: string, name: string) {
	const trimmed = name.trim();
	quickFolderTargets = quickFolderTargets.map((t) =>
		t.id === id ? { ...t, name: trimmed || t.name } : t
	);
	saveQuickFolderTargets();
}

// 更新快速目标路径
function updateQuickFolderPath(id: string, path: string) {
	quickFolderTargets = quickFolderTargets.map((t) => (t.id === id ? { ...t, path: path.trim() } : t));
	saveQuickFolderTargets();
}

// 删除快速目标
function deleteQuickFolderTarget(id: string) {
	quickFolderTargets = quickFolderTargets.filter((t) => t.id !== id);
	saveQuickFolderTargets();
}

// 应用快速迁移
async function quickApplyToFolder(target: QuickFolderTarget) {
	const selected = $selectedItems;
	if (selected.size === 0) {
		showErrorToast('没有选中的文件', '请先选择要迁移的文件');
		return;
	}

	const paths = Array.from(selected);
	const targetDir = target.path;

	try {
		for (const sourcePath of paths) {
			// 获取文件名
			const fileName = sourcePath.split(/[\\/]/).pop();
			if (!fileName) continue;
			const destPath = `${targetDir}/${fileName}`;
			
			if (quickFolderMode === 'copy') {
				await FileSystemAPI.copyPath(sourcePath, destPath);
			} else {
				await FileSystemAPI.movePath(sourcePath, destPath);
			}
		}

		showSuccessToast(
			`${quickFolderMode === 'copy' ? '复制' : '移动'}成功`,
			`已${quickFolderMode === 'copy' ? '复制' : '移动'} ${paths.length} 个文件到 ${target.name}`
		);

		// 如果是移动，清除选中并刷新
		if (quickFolderMode === 'move') {
			folderTabActions.deselectAll();
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		showErrorToast('迁移失败', message);
	}
}

// 切换模式
function setMode(mode: 'copy' | 'move') {
	quickFolderMode = mode;
	saveQuickFolderTargets();
}

onMount(() => {
	loadQuickFolderTargets();
});
</script>

<div class="border-b px-2 py-1.5 text-xs">
	<div class="flex items-center gap-2">
		<div class="text-muted-foreground flex items-center gap-2">
			<span>快速迁移</span>
			<div class="bg-background inline-flex rounded-md border p-0.5 text-[11px]">
				<button
					type="button"
					class="rounded-sm px-2 py-0.5 {quickFolderMode === 'copy'
						? 'bg-accent text-accent-foreground'
						: 'text-muted-foreground'}"
					onclick={() => setMode('copy')}
				>
					复制
				</button>
				<button
					type="button"
					class="rounded-sm px-2 py-0.5 {quickFolderMode === 'move'
						? 'bg-accent text-accent-foreground'
						: 'text-muted-foreground'}"
					onclick={() => setMode('move')}
				>
					移动
				</button>
			</div>
		</div>

		<div class="flex-1 overflow-x-auto">
			<div class="flex items-center gap-1">
				{#if quickFolderTargets.length === 0}
					<span class="text-muted-foreground">暂无快速目标，请点击"管理"添加。</span>
				{:else}
					{#each quickFolderTargets as target (target.id)}
						<Button
							variant="outline"
							size="sm"
							class="h-7 px-2 text-[11px]"
							onclick={() => quickApplyToFolder(target)}
						>
							<Folder class="mr-1 h-3.5 w-3.5" />
							<span>{target.name}</span>
						</Button>
					{/each}
				{/if}
			</div>
		</div>

		<Button
			variant="ghost"
			size="sm"
			class="text-muted-foreground h-7 px-2 text-[11px]"
			onclick={onToggleManager}
		>
			<Settings class="mr-1 h-3.5 w-3.5" />
			<span>{showManager ? '隐藏管理' : '管理'}</span>
		</Button>
	</div>

	{#if showManager}
		<div class="mt-2 space-y-2 border-t pt-2">
			<div class="flex items-center justify-between">
				<span class="text-foreground font-medium">管理快速目标</span>
				<Button variant="outline" size="sm" class="h-7 px-2 text-[11px]" onclick={addQuickFolderTarget}>
					<span>新增目标</span>
				</Button>
			</div>

			{#if quickFolderTargets.length === 0}
				<div class="text-muted-foreground">暂无目标，请点击"新增目标"添加。</div>
			{:else}
				<div class="flex flex-col gap-2">
					{#each quickFolderTargets as target (target.id)}
						<div class="flex items-center gap-2">
							<input
								class="border-input bg-background h-7 w-28 rounded border px-2 text-[11px] focus:outline-none"
								value={target.name}
								onchange={(e) => updateQuickFolderName(target.id, e.currentTarget.value)}
								placeholder="名称"
							/>
							<input
								class="border-input bg-background h-7 flex-1 rounded border px-2 text-[11px] focus:outline-none"
								value={target.path}
								onchange={(e) => updateQuickFolderPath(target.id, e.currentTarget.value)}
								placeholder="目标文件夹路径"
							/>
							<Button
								variant="ghost"
								size="icon"
								class="text-destructive h-7 w-7"
								onclick={() => deleteQuickFolderTarget(target.id)}
							>
								<Trash2 class="h-3.5 w-3.5" />
							</Button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
