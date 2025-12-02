<script lang="ts">
/**
 * ConfirmDialog - 确认对话框组件
 * 用于替代原生 confirm()，提供更好的 UI 体验
 */
import * as Dialog from '$lib/components/ui/dialog';
import { Button } from '$lib/components/ui/button';
import { AlertTriangle, Info, Trash2 } from '@lucide/svelte';

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

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.Content class="sm:max-w-[400px]">
		{#snippet children()}
			<Dialog.Header>
				<Dialog.Title class="flex items-center gap-2">
					{#if variant === 'destructive'}
						<Trash2 class="h-5 w-5 text-destructive" />
					{:else if variant === 'warning'}
						<AlertTriangle class="h-5 w-5 text-yellow-500" />
					{:else}
						<Info class="h-5 w-5 text-primary" />
					{/if}
					{title}
				</Dialog.Title>
				<Dialog.Description>
					{description}
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer class="gap-2 sm:gap-0">
				<Button variant="outline" onclick={handleCancel}>
					{cancelText}
				</Button>
				<Button 
					variant={variant === 'destructive' ? 'destructive' : 'default'}
					onclick={handleConfirm}
				>
					{confirmText}
				</Button>
			</Dialog.Footer>
		{/snippet}
	</Dialog.Content>
</Dialog.Root>
