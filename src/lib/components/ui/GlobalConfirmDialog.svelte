<script lang="ts">
/**
 * GlobalConfirmDialog - 全局确认对话框组件
 * 连接到全局 confirmDialog store，在 App.svelte 中挂载一次即可
 */
import * as AlertDialog from '$lib/components/ui/alert-dialog';
import { buttonVariants } from '$lib/components/ui/button';
import { AlertTriangle, Info, Trash2 } from '@lucide/svelte';
import { cn } from '$lib/utils';
import { 
	getDialogState, 
	handleConfirm, 
	handleCancel, 
	handleOpenChange 
} from '$lib/stores/confirmDialog.svelte';

const state = getDialogState();
</script>

<AlertDialog.Root bind:open={state.open} onOpenChange={handleOpenChange}>
	<AlertDialog.Content class="sm:max-w-[400px]">
		<AlertDialog.Header>
			<AlertDialog.Title class="flex items-center gap-2">
				{#if state.variant === 'destructive'}
					<Trash2 class="h-5 w-5 text-destructive" />
				{:else if state.variant === 'warning'}
					<AlertTriangle class="h-5 w-5 text-yellow-500" />
				{:else}
					<Info class="h-5 w-5 text-primary" />
				{/if}
				{state.title}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{state.description}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer class="gap-2 sm:gap-0">
			<AlertDialog.Cancel 
				class={cn(buttonVariants({ variant: "outline" }))}
				onclick={handleCancel}
			>
				{state.cancelText}
			</AlertDialog.Cancel>
			<AlertDialog.Action 
				class={cn(buttonVariants({ variant: state.variant === 'destructive' ? 'destructive' : 'default' }))}
				onclick={handleConfirm}
			>
				{state.confirmText}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
