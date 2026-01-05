<script lang="ts">
	/**
	 * NeoView - Hover Wrapper Component
	 * 终极侧边栏控制器：基于物理滑块逻辑 + IME 卫护 + 智能滑回检测
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
		hideDelay = 500, // 增加到 500ms 提高容错性
		showDelay = 0
	}: Props = $props();

	let hideTimer: number | null = null;
	let showTimer: number | null = null;
	let isContextMenuOpen = $state(false);
	let wrapperContainer = $state<HTMLDivElement | null>(null);
	let lastX = 0;

	// 检查是否有输入焦点（IME 保护）
	function isInputting(): boolean {
		const el = document.activeElement;
		if (!el) return false;
		const tag = el.tagName.toLowerCase();
		return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable;
	}

	// 判定浮动辅助层（Tooltip, Popover 等）
	function isFloatingElement(element: Element | null): boolean {
		if (!element) return false;
		if (element.parentElement === document.body) return true;
		
		const style = window.getComputedStyle(element);
		if (style.position === 'fixed' && parseInt(style.zIndex) >= 50) return true;

		const floatingSelectors = [
			'[role="tooltip"]', '[role="popover"]', '[role="menu"]',
			'[data-radix-popper-content-wrapper]', '.tooltip', '.popover'
		];
		return floatingSelectors.some(selector => {
			try { return element.matches(selector) || element.closest(selector); } catch { return false; }
		});
	}

	// 核心判定逻辑：物理安全判定 + 智能滑回
	$effect(() => {
		if (isVisible && !pinned && !isContextMenuOpen) {
			const checkMousePosition = (e: MouseEvent) => {
				if (!wrapperContainer) return;
				
				const { clientX, clientY } = e;
				const dx = clientX - lastX;
				lastX = clientX;
				
				const rect = wrapperContainer.getBoundingClientRect();
				const isLeftSide = rect.left < window.innerWidth / 2;

				// 1. 如果鼠标在容器内，或正在输入，或在 Tooltip 上，绝对保持开启
				const elementAtMouse = document.elementFromPoint(clientX, clientY);
				if (
					(wrapperContainer && wrapperContainer.contains(elementAtMouse)) || 
					isInputting() || 
					isFloatingElement(elementAtMouse)
				) {
					resetHideTimer();
					return;
				}

				// 2. 智能滑回逻辑：如果鼠标正在向侧边栏方向移动，重置收回计时
				if ((isLeftSide && dx < -1) || (!isLeftSide && dx > 1)) {
					resetHideTimer();
					return;
				}

				// 3. 动态物理红线判定：
				// 左侧边栏红线：取 容器宽度 + 150px 或 屏幕宽度的 40% 中的较大者
				// 右侧边栏红线：取 容器左沿 - 150px 或 屏幕宽度的 60% 中的较小者
				if (isLeftSide) {
					const retractLine = Math.max(rect.right + 150, window.innerWidth * 0.4);
					if (clientX > retractLine) {
						performHide();
					} else {
						resetHideTimer();
					}
				} else {
					const retractLine = Math.min(rect.left - 150, window.innerWidth * 0.6);
					if (clientX < retractLine) {
						performHide();
					} else {
						resetHideTimer();
					}
				}
			};

			window.addEventListener('mousemove', checkMousePosition);
			return () => window.removeEventListener('mousemove', checkMousePosition);
		}
	});

	function resetHideTimer() {
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
	}

	function performHide() {
		if (hideTimer || isContextMenuOpen) return;
		hideTimer = setTimeout(() => {
			if (!isContextMenuOpen && !isInputting()) {
				isVisible = false;
				onVisibilityChange?.(false);
			}
			hideTimer = null;
		}, hideDelay) as unknown as number;
	}

	function handleMouseEnter() {
		if (!pinned) {
			resetHideTimer();
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

	function handleMouseLeave() { /* 由物理判定取代 */ }

	function handleContextMenu(e: MouseEvent) {
		if (!pinned) {
			isContextMenuOpen = true;
			resetHideTimer();
		}
	}

	function handleContextMenuClose() {
		if (isContextMenuOpen) isContextMenuOpen = false;
	}

	$effect(() => {
		if (pinned) {
			isVisible = true;
			resetHideTimer();
			onVisibilityChange?.(true);
		}
	});

	$effect(() => {
		return () => {
			if (hideTimer) clearTimeout(hideTimer);
			if (showTimer) clearTimeout(showTimer);
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