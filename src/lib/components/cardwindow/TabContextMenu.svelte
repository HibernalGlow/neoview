<script lang="ts">
	/**
	 * TabContextMenu - 标签页右键菜单
	 * Requirements: 8.1, 8.2
	 */
	import { onMount, onDestroy } from 'svelte';
	import { Copy, X, XCircle } from '@lucide/svelte';

	interface Props {
		tabId: string;
		position: { x: number; y: number };
		onClose: () => void;
		onDuplicate: () => void;
		onCloseTab: () => void;
		onCloseOthers?: () => void;
		onCloseToRight?: () => void;
	}

	let {
		tabId,
		position,
		onClose,
		onDuplicate,
		onCloseTab,
		onCloseOthers,
		onCloseToRight
	}: Props = $props();

	let menuRef = $state<HTMLDivElement | null>(null);

	onMount(() => {
		// 点击外部关闭菜单
		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef && !menuRef.contains(e.target as Node)) {
				onClose();
			}
		};

		// 按 Escape 关闭菜单
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose();
			}
		};

		document.addEventListener('click', handleClickOutside);
		document.addEventListener('keydown', handleKeyDown);

		return () => {
			document.removeEventListener('click', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	});

	// 计算菜单位置，确保不超出屏幕
	const menuStyle = $derived.by(() => {
		const menuWidth = 180;
		const menuHeight = 150;
		
		let x = position.x;
		let y = position.y;

		// 检查右边界
		if (x + menuWidth > window.innerWidth) {
			x = window.innerWidth - menuWidth - 10;
		}

		// 检查下边界
		if (y + menuHeight > window.innerHeight) {
			y = window.innerHeight - menuHeight - 10;
		}

		return `left: ${x}px; top: ${y}px;`;
	});
</script>

<div
	bind:this={menuRef}
	class="fixed z-50 min-w-[180px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
	style={menuStyle}
	role="menu"
>
	<button
		type="button"
		class="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
		onclick={onDuplicate}
		role="menuitem"
	>
		<Copy class="h-4 w-4 mr-2" />
		复制标签页
	</button>

	<div class="h-px bg-border my-1"></div>

	<button
		type="button"
		class="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
		onclick={onCloseTab}
		role="menuitem"
	>
		<X class="h-4 w-4 mr-2" />
		关闭标签页
	</button>

	{#if onCloseOthers}
		<button
			type="button"
			class="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
			onclick={onCloseOthers}
			role="menuitem"
		>
			<XCircle class="h-4 w-4 mr-2" />
			关闭其他标签页
		</button>
	{/if}

	{#if onCloseToRight}
		<button
			type="button"
			class="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
			onclick={onCloseToRight}
			role="menuitem"
		>
			<XCircle class="h-4 w-4 mr-2" />
			关闭右侧标签页
		</button>
	{/if}
</div>
