<script lang="ts">
	/**
	 * NeoView - Hover Wrapper Component
	 * 唯一的悬停显示/隐藏控制器 - 改用物理坐标判定，防止 Tooltip 和输入法意外隐藏
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

	// 判定元素是否属于浮动辅助层（Tooltip, Popover 等）
	function isFloatingElement(element: Element | null): boolean {
		if (!element) return false;
		const floatingSelectors = [
			'[role="tooltip"]',
			'[role="popover"]',
			'[role="menu"]',
			'[data-radix-popper-content-wrapper]',
			'.tooltip',
			'.popover',
			'.radix-themes'
		];
		return floatingSelectors.some(selector => {
			try {
				return element.matches(selector) || element.closest(selector);
			} catch {
				return false;
			}
		});
	}

	// 判定收回逻辑：彻底免疫内部及临近浮动元素
	$effect(() => {
		if (isVisible && !pinned && !isContextMenuOpen) {
			const checkMousePosition = (e: MouseEvent) => {
				if (!wrapperContainer) return;
				
				const { clientX, clientY } = e;
				const elementAtMouse = document.elementFromPoint(clientX, clientY);

				// 1. 如果鼠标在容器内（含二级侧栏），或者在派生的 Tooltip 上，保持显示
				if ((wrapperContainer && wrapperContainer.contains(elementAtMouse)) || isFloatingElement(elementAtMouse)) {
					if (hideTimer) {
						clearTimeout(hideTimer);
						hideTimer = null;
					}
					return;
				}

				// 2. 物理边界收回判定
				const rect = wrapperContainer.getBoundingClientRect();
				const centerThreshold = 50; // 安全红线：离侧边栏边缘 50px

				// 判断容器在屏幕左侧还是右侧
				const isLeftSide = rect.left < window.innerWidth / 2;

				if (isLeftSide) {
					// 左侧边栏：鼠标必须横向进入右侧主区 50px 之后才收回
					if (clientX > rect.right + centerThreshold) {
						performHide();
					} else {
						// 只是向上、向下或稍微偏出（Tooltip 区域），取消隐藏
						if (hideTimer) {
							clearTimeout(hideTimer);
							hideTimer = null;
						}
					}
				} else {
					// 右侧边栏：鼠标必须横向进入左侧主区 50px 之后才收回
					if (clientX < rect.left - centerThreshold) {
						performHide();
					} else {
						if (hideTimer) {
							clearTimeout(hideTimer);
							hideTimer = null;
						}
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
		// 逻辑已迁移至全局判定，避免事件干扰
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

	// 统一清理
	$effect(() => {
		return () => {
			if (hideTimer) clearTimeout(hideTimer);
			if (showTimer) clearTimeout(showTimer);
		};
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
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