<script lang="ts">
	/**
	 * CardHeaderContextMenu - 卡片头部右键菜单
	 * 添加"在新窗口打开"选项
	 * Requirements: 1.1, 8.1
	 */
	import { onMount } from 'svelte';
	import { ExternalLink, Copy } from '@lucide/svelte';
	import { openCardInNewWindow } from '$lib/core/windows/cardWindowManager';
	import type { PanelId } from '$lib/stores/cardConfig.svelte';

	interface Props {
		cardId: string;
		panelId: PanelId;
		position: { x: number; y: number };
		onClose: () => void;
	}

	let { cardId, panelId, position, onClose }: Props = $props();

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

	// 计算菜单位置
	const menuStyle = $derived.by(() => {
		const menuWidth = 200;
		const menuHeight = 80;
		
		let x = position.x;
		let y = position.y;

		if (x + menuWidth > window.innerWidth) {
			x = window.innerWidth - menuWidth - 10;
		}

		if (y + menuHeight > window.innerHeight) {
			y = window.innerHeight - menuHeight - 10;
		}

		return `left: ${x}px; top: ${y}px;`;
	});

	async function handleOpenInNewWindow() {
		await openCardInNewWindow(cardId);
		onClose();
	}
</script>

<div
	bind:this={menuRef}
	class="fixed z-50 min-w-[200px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
	style={menuStyle}
	role="menu"
>
	<button
		type="button"
		class="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
		onclick={handleOpenInNewWindow}
		role="menuitem"
	>
		<ExternalLink class="h-4 w-4 mr-2" />
		在新窗口打开
	</button>
</div>
