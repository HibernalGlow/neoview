<script lang="ts">
	/**
	 * NeoView - Hover Wrapper Component
	 * 悬停显示/隐藏包装器 - 可复用的悬停逻辑
	 */
	import type { Snippet } from 'svelte';

	interface Props {
		isVisible: boolean;
		pinned: boolean;
		onVisibilityChange: (visible: boolean) => void;
		children: Snippet;
		hideDelay?: number;
		showDelay?: number;
	}

	let {
		isVisible = $bindable(false),
		pinned,
		onVisibilityChange,
		children,
		hideDelay = 300,
		showDelay = 0
	}: Props = $props();

	let hideTimer: number | null = null;
	let showTimer: number | null = null;
	let isContextMenuOpen = $state(false);

	// 悬停显示/隐藏逻辑
	function handleMouseEnter() {
		if (!pinned) {
			if (hideTimer) {
				clearTimeout(hideTimer);
				hideTimer = null;
			}
			if (showTimer) {
				clearTimeout(showTimer);
				showTimer = null;
			}
			const delay = showDelay ?? 0;
			if (!isVisible && delay > 0) {
				showTimer = setTimeout(() => {
					isVisible = true;
					onVisibilityChange?.(true);
				}, delay) as unknown as number;
			} else {
				isVisible = true;
				onVisibilityChange?.(true);
			}
		}
	}

	function handleMouseLeave() {
		if (!pinned && !isContextMenuOpen) {
			if (showTimer) {
				clearTimeout(showTimer);
				showTimer = null;
			}
			hideTimer = setTimeout(() => {
				if (!isContextMenuOpen) {
					isVisible = false;
					onVisibilityChange?.(false);
				}
			}, hideDelay) as unknown as number;
		}
	}

	// 处理右键菜单
	function handleContextMenu(e: MouseEvent) {
		if (!pinned) {
			isContextMenuOpen = true;
			if (hideTimer) {
				clearTimeout(hideTimer);
				hideTimer = null;
			}
			if (showTimer) {
				clearTimeout(showTimer);
				showTimer = null;
			}
		}
	}

	// 监听右键菜单关闭
	function handleContextMenuClose() {
		if (isContextMenuOpen) {
			isContextMenuOpen = false;
			// 给一个小延迟，确保鼠标已经移出
			setTimeout(() => {
				if (!pinned && !document.querySelector(':hover')?.closest('[data-hover-wrapper]')) {
					isVisible = false;
					onVisibilityChange?.(false);
				}
			}, 100);
		}
	}

	// 响应钉住状态变化
	$effect(() => {
		if (pinned) {
			isVisible = true;
			if (hideTimer) {
				clearTimeout(hideTimer);
				hideTimer = null;
			}
			if (showTimer) {
				clearTimeout(showTimer);
				showTimer = null;
			}
			onVisibilityChange?.(true);
		}
	});

	// 监听全局点击事件以检测右键菜单关闭
	$effect(() => {
		const handleGlobalClick = () => {
			if (isContextMenuOpen) {
				handleContextMenuClose();
			}
		};

		const handleGlobalContextMenu = (e: MouseEvent) => {
			// 如果右键点击不在当前组件内，关闭之前的右键菜单状态
			const target = e.target as HTMLElement | null;
			if (!target?.closest('[data-hover-wrapper="true"]')) {
				isContextMenuOpen = false;
			}
		};

		document.addEventListener('click', handleGlobalClick);
		document.addEventListener('contextmenu', handleGlobalContextMenu);

		return () => {
			document.removeEventListener('click', handleGlobalClick);
			document.removeEventListener('contextmenu', handleGlobalContextMenu);
		};
	});

	// 清理定时器
	$effect(() => {
		return () => {
			if (hideTimer) {
				clearTimeout(hideTimer);
			}
			if (showTimer) {
				clearTimeout(showTimer);
			}
		};
	});
</script>

<div
	class="relative flex h-full"
	data-hover-wrapper="true"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	oncontextmenu={handleContextMenu}
	onclick={handleContextMenuClose}
>
	{@render children?.()}
</div>