<script lang="ts">
/**
 * ConfirmDialog - 确认对话框组件
 * 用于替代原生 confirm()，提供更好的 UI 体验
 * 使用 alert-dialog 组件实现
 */
import * as AlertDialog from '$lib/components/ui/alert-dialog';
import { buttonVariants } from '$lib/components/ui/button';
import { AlertTriangle, Info, Trash2 } from '@lucide/svelte';
import { cn } from '$lib/utils';

interface Props {
	open: boolean;
	title?: string;
	description?: string;
	confirmText?: string;
	cancelText?: string;
	variant?: 'default' | 'destructive' | 'warning';
	onConfirm?: () => void;
	onCancel?: () => void;
}

let { 
	open = $bindable(false), 
	title = '确认操作',
	description = '确定要执行此操作吗？',
	confirmText = '确定',
	cancelText = '取消',
	variant = 'default',
	onConfirm,
	onCancel
}: Props = $props();

function handleConfirm() {
	onConfirm?.();
	open = false;
}

function handleCancel() {
	onCancel?.();
	open = false;
}

function handleOpenChange(newOpen: boolean) {
	if (!newOpen) {
		handleCancel();
	}
}
</script>

<AlertDialog.Root bind:open onOpenChange={handleOpenChange}>
	<AlertDialog.Content class="sm:max-w-[400px]">
		<AlertDialog.Header>
			<AlertDialog.Title class="flex items-center gap-2">
				{#if variant === 'destructive'}
					<Trash2 class="h-5 w-5 text-destructive" />
				{:else if variant === 'warning'}
					<AlertTriangle class="h-5 w-5 text-yellow-500" />
				{:else}
					<Info class="h-5 w-5 text-primary" />
				{/if}
				{title}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{description}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer class="gap-2 sm:gap-0">
			<AlertDialog.Cancel 
				class={cn(buttonVariants({ variant: "outline" }))}
				onclick={handleCancel}
			>
				{cancelText}
			</AlertDialog.Cancel>
			<AlertDialog.Action 
				class={cn(buttonVariants({ variant: variant === 'destructive' ? 'destructive' : 'default' }))}
				onclick={handleConfirm}
			>
				{confirmText}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
