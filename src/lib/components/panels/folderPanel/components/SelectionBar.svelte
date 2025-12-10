<script lang="ts">
/**
 * SelectionBar - 勾选操作栏
 * 在勾选模式下显示，提供全选、反选、取消等操作
 */
import { CheckSquare, Square, SquareX, Trash2, Copy, Scissors, X, Link, MousePointer } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import * as Tooltip from '$lib/components/ui/tooltip';
import { 
	tabSelectedItems, 
	tabItems,
	folderTabActions,
	activeTabId
} from '../stores/folderTabStore.svelte';
import { chainSelectModeByTab, toggleChainSelectMode } from '../stores/chainSelectStore.svelte';
import { fileBrowserStore, type CheckModeClickBehavior } from '$lib/stores/fileBrowser.svelte';

// 别名映射
const selectedItems = tabSelectedItems;
const items = tabItems;

interface Props {
	onDelete?: () => void;
	onCopy?: () => void;
	onCut?: () => void;
	onClose?: () => void;
}

let { onDelete, onCopy, onCut, onClose }: Props = $props();

// 选中数量
const selectedCount = $derived($selectedItems.size);
const totalCount = $derived($items.length);
const allSelected = $derived(selectedCount > 0 && selectedCount === totalCount);

// 链选模式状态 - 响应式订阅 store
const isChainSelectMode = $derived($chainSelectModeByTab[$activeTabId] || false);

// 点击行为设置 - 从 fileBrowserStore 获取
let checkModeClickBehavior = $state<CheckModeClickBehavior>('open');
$effect(() => {
	const unsubscribe = fileBrowserStore.subscribe((state) => {
		checkModeClickBehavior = state.checkModeClickBehavior;
	});
	return unsubscribe;
});

function toggleCheckModeClickBehavior() {
	const newValue: CheckModeClickBehavior = checkModeClickBehavior === 'open' ? 'select' : 'open';
	fileBrowserStore.setCheckModeClickBehavior(newValue);
}

function handleSelectAll() {
	folderTabActions.selectAll();
}

function handleDeselectAll() {
	folderTabActions.deselectAll();
}

function handleInvertSelection() {
	folderTabActions.invertSelection();
}

function handleClose() {
	folderTabActions.deselectAll();
	folderTabActions.toggleMultiSelectMode();
	onClose?.();
}
</script>

<div class="flex items-center gap-2 px-3 py-2 border-b">
	<!-- 选中计数 -->
	<span class="text-sm font-medium">
		<span class="text-primary">{selectedCount}</span> / {totalCount} 
	</span>
	
	<div class="flex-1" />
	
	<!-- 操作按钮 -->
	<div class="flex items-center gap-1">
		<!-- 全选 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant="ghost"
					size="sm"
					class="h-7 px-2"
					onclick={handleSelectAll}
					disabled={allSelected}
				>
					<CheckSquare class="h-4 w-4 mr-1" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content><p>选择全部项目</p></Tooltip.Content>
		</Tooltip.Root>
		
		<!-- 反选 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant="ghost"
					size="sm"
					class="h-7 px-2"
					onclick={handleInvertSelection}
				>
					<Square class="h-4 w-4 mr-1" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content><p>反转选择状态</p></Tooltip.Content>
		</Tooltip.Root>
		
		<!-- 取消全选 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant="ghost"
					size="sm"
					class="h-7 px-2"
					onclick={handleDeselectAll}
					disabled={selectedCount === 0}
				>
					<SquareX class="h-4 w-4 mr-1" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content><p>取消全部选择</p></Tooltip.Content>
		</Tooltip.Root>
		
		<!-- 链接选中 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={isChainSelectMode ? 'default' : 'ghost'}
					size="sm"
					class="h-7 px-2"
					onclick={(e) => {
					console.log('[SelectionBar] 链选按钮被点击', e);
					toggleChainSelectMode($activeTabId);
				}}
				>
					<Link class="h-4 w-4 mr-1" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>链接选中模式</p>
				<p class="text-muted-foreground text-xs">开启后，点击项目会选中从上一个选中项到当前项的所有项目</p>
			</Tooltip.Content>
		</Tooltip.Root>
		
		<!-- 点击行为切换 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant={checkModeClickBehavior === 'select' ? 'default' : 'ghost'}
					size="sm"
					class="h-7 px-2"
					onclick={toggleCheckModeClickBehavior}
				>
					<MousePointer class="h-4 w-4 mr-1" />
					{checkModeClickBehavior === 'select' ? '点选' : '点开'}
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>点击卡片行为: {checkModeClickBehavior === 'select' ? '选中' : '打开'}</p>
				<p class="text-muted-foreground text-xs">当前: 点击卡片会{checkModeClickBehavior === 'select' ? '选中/取消选中项目' : '打开项目'}</p>
			</Tooltip.Content>
		</Tooltip.Root>
		
		<div class="w-px h-5 bg-border mx-1" />
		
		<!-- 复制 -->
		{#if onCopy}
			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button
						variant="ghost"
						size="sm"
						class="h-7 px-2"
						onclick={onCopy}
						disabled={selectedCount === 0}
					>
						<Copy class="h-4 w-4 mr-1" />
						复制
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content><p>复制选中项</p></Tooltip.Content>
			</Tooltip.Root>
		{/if}
		
		<!-- 剪切 -->
		{#if onCut}
			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button
						variant="ghost"
						size="sm"
						class="h-7 px-2"
						onclick={onCut}
						disabled={selectedCount === 0}
					>
						<Scissors class="h-4 w-4 mr-1" />
						剪切
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content><p>剪切选中项</p></Tooltip.Content>
			</Tooltip.Root>
		{/if}
		
		<!-- 删除 -->
		{#if onDelete}
			<Tooltip.Root>
				<Tooltip.Trigger>
					<Button
						variant="ghost"
						size="sm"
						class="h-7 px-2 text-destructive hover:text-destructive"
						onclick={onDelete}
						disabled={selectedCount === 0}
					>
						<Trash2 class="h-4 w-4 mr-1" />
						删除
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content><p>删除选中项</p></Tooltip.Content>
			</Tooltip.Root>
		{/if}
		
		<div class="w-px h-5 bg-border mx-1" />
		
		<!-- 关闭勾选模式 -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button
					variant="ghost"
					size="icon"
					class="h-7 w-7"
					onclick={handleClose}
				>
					<X class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content><p>退出勾选模式</p></Tooltip.Content>
		</Tooltip.Root>
	</div>
</div>
