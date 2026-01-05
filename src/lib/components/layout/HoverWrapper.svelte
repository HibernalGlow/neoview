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
	let wrapperContainer = $state<HTMLDivElement | null>(null);

	// 判定收回逻辑：基于物理边界 + DOM 卫护
	$effect(() => {
		if (isVisible && !pinned && !isContextMenuOpen) {
			const checkMousePosition = (e: MouseEvent) => {
				if (!wrapperContainer) return;
				
				// 1. 优先检查鼠标是否还在侧边栏 DOM 结构内
				// 使用 elementFromPoint 来确保即使是动态挂载的子元素也能被捕捉
				const elementAtMouse = document.elementFromPoint(e.clientX, e.clientY);
				if (wrapperContainer.contains(elementAtMouse)) {
					// 只要还在侧边栏范围内，清理定时器并直接返回
					if (hideTimer) {
						clearTimeout(hideTimer);
						hideTimer = null;
					}
					return;
				}

				// 2. 如果不在 DOM 内，则进行物理边界检查
				const rect = wrapperContainer.getBoundingClientRect();
				const { clientX } = e;
				const threshold = 10; // 给一点点缓冲区

				// 判定逻辑：
				// 如果容器在屏幕左侧（左侧边栏）
				if (rect.left < window.innerWidth / 2) {
					// 只有鼠标坐标明确超过了容器的最右侧边界（进入主区），才收回
					if (clientX > rect.right + threshold) {
						performHide();
					} else if (hideTimer) {
						// 鼠标虽然出去了，但如果是向上/向下/向左出去了，或者在输入法上（坐标没过线），取消隐藏
						clearTimeout(hideTimer);
						hideTimer = null;
					}
				} 
				// 如果容器在屏幕右侧（右侧边栏）
				else {
					// 只有鼠标坐标明确低于容器的最左侧边界，才收回
					if (clientX < rect.left - threshold) {
						performHide();
					} else if (hideTimer) {
						clearTimeout(hideTimer);
						hideTimer = null;
					}
				}
			};

			window.addEventListener('mousemove', checkMousePosition);
			return () => window.removeEventListener('mousemove', checkMousePosition);
		}
	});

	function performHide() {
		if (hideTimer || isContextMenuOpen) return;
		hideTimer = setTimeout(() => {
			if (!isContextMenuOpen) {
				isVisible = false;
				onVisibilityChange?.(false);
			}
			hideTimer = null;
		}, hideDelay) as unknown as number;
	}

	// 悬停显示逻辑
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
		// 已由物理边界检测取代
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
	bind:this={wrapperContainer}
	class="relative flex h-full"
	data-hover-wrapper="true"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	oncontextmenu={handleContextMenu}
	onclick={handleContextMenuClose}
>
	{@render children?.()}
</div>