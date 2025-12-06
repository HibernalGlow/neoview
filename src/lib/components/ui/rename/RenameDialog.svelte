<script lang="ts">
	/**
	 * RenameDialog - 重命名对话框组件
	 * 用于替代浏览器原生的 prompt()
	 */
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	interface Props {
		open: boolean;
		title?: string;
		initialValue: string;
		onConfirm: (newValue: string) => void;
		onCancel: () => void;
		validate?: (value: string) => string | null; // 返回错误信息，null 表示验证通过
	}

	let {
		open = $bindable(false),
		title = '重命名',
		initialValue = '',
		onConfirm,
		onCancel,
		validate
	}: Props = $props();

	let inputValue = $state(initialValue);
	let error = $state<string | null>(null);

	// 当对话框打开时，重置输入值
	$effect(() => {
		if (open) {
			inputValue = initialValue;
			error = null;
		}
	});

	function handleConfirm() {
		// 验证输入
		if (!inputValue.trim()) {
			error = '名称不能为空';
			return;
		}

		if (inputValue === initialValue) {
			// 没有变化，直接关闭
			onCancel();
			return;
		}

		// 自定义验证
		if (validate) {
			const validationError = validate(inputValue);
			if (validationError) {
				error = validationError;
				return;
			}
		}

		onConfirm(inputValue);
		open = false;
	}

	function handleCancel() {
		onCancel();
		open = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleConfirm();
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[400px]">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>请输入新名称</Dialog.Description>
		</Dialog.Header>

		<div class="grid gap-4 py-4">
			<div class="grid gap-2">
				<Label for="rename-input">名称</Label>
				<Input
					id="rename-input"
					bind:value={inputValue}
					onkeydown={handleKeydown}
					class={error ? 'border-destructive' : ''}
					autofocus
				/>
				{#if error}
					<p class="text-destructive text-sm">{error}</p>
				{/if}
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={handleCancel}>取消</Button>
			<Button onclick={handleConfirm}>确定</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
