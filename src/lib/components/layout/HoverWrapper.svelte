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
	}

	let {
		isVisible = $bindable(false),
		pinned,
		onVisibilityChange,
		children,
		hideDelay = 300
	}: Props = $props();

	let hideTimer: number | null = null;

	// 悬停显示/隐藏逻辑
	function handleMouseEnter() {
		if (!pinned) {
			if (hideTimer) {
				clearTimeout(hideTimer);
				hideTimer = null;
			}
			isVisible = true;
			onVisibilityChange?.(true);
		}
	}

	function handleMouseLeave() {
		if (!pinned) {
			hideTimer = setTimeout(() => {
				isVisible = false;
				onVisibilityChange?.(false);
			}, hideDelay) as unknown as number;
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
			onVisibilityChange?.(true);
		}
	});

	// 清理定时器
	$effect(() => {
		return () => {
			if (hideTimer) {
				clearTimeout(hideTimer);
			}
		};
	});
</script>

<div
	class="relative flex h-full"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
>
	{@render children?.()}
</div>