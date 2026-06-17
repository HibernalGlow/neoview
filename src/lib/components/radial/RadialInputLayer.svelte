<script lang="ts">
	/**
	 * 轮盘输入层
	 * 负责 pointer/key 长按状态机
	 * 不直接执行 action，通过 onselect 回调通知父组件
	 */

	import { onMount, onDestroy } from 'svelte';
	import { radialMenuStore } from '$lib/stores/radialMenu';
	import { keyBindingsStore } from '$lib/stores/keybindings';
	import { bookStore } from '$lib/stores/book.svelte';

	let {
		onselect = (action: string) => {},
	} = $props();

	// 状态机内部变量
	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let rafId: number | null = null;
	let pendingPointerX = 0;
	let pendingPointerY = 0;
	let pointerStartX = 0;
	let pointerStartY = 0;
	let suppressNextClick = false;

	// 内联实现：检查事件是否发生在输入框/可编辑元素上
	function isTypingInInput(e: Event): boolean {
		const t = e.target as HTMLElement | null;
		if (!t) return false;
		return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
	}

	// 检查是否在可交互元素上
	function isInteractiveTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		const tag = target.tagName.toLowerCase();
		if (['input', 'textarea', 'select', 'button'].includes(tag)) return true;
		if (target.isContentEditable) return true;
		if (target.closest('[data-radial-exclude]')) return true;
		if (target.closest('.dialog-content')) return true;
		if (target.closest('[role="dialog"]')) return true;
		return false;
	}

	// 查找长按绑定的 durationMs
	function getHoldDuration(device: 'mouse' | 'touch' | 'keyboard', button?: string): number {
		const action = keyBindingsStore.findActionByHold({ device, button: button as any });
		if (!action) return 0;
		const binding = keyBindingsStore.getBinding(action);
		if (!binding) return 0;
		const holdBinding = binding.bindings.find(b => b.type === 'hold');
		return (holdBinding as any)?.durationMs ?? 450;
	}

	function getHoldTolerance(device: 'mouse' | 'touch' | 'keyboard'): number {
		const action = keyBindingsStore.findActionByHold({ device });
		if (!action) return 8;
		const binding = keyBindingsStore.getBinding(action);
		if (!binding) return 8;
		const holdBinding = binding.bindings.find(b => b.type === 'hold');
		return (holdBinding as any)?.moveTolerancePx ?? 8;
	}

	// ========== Pointer 事件 ==========

	function onPointerDown(e: PointerEvent) {
		if (radialMenuStore.isOpen) return;
		// 只在阅读模式触发
		if (!bookStore.viewerOpen) return;
		if (isTypingInInput(e)) return;
		if (isInteractiveTarget(e.target)) return;

		const device = e.pointerType === 'touch' ? 'touch' : 'mouse';
		const button = device === 'mouse'
			? (e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle')
			: undefined;

		const duration = getHoldDuration(device, button);
		if (duration <= 0) return;

		pendingPointerX = e.clientX;
		pendingPointerY = e.clientY;
		pointerStartX = e.clientX;
		pointerStartY = e.clientY;

		radialMenuStore.startPendingHold(device === 'touch' ? 'pointer' : 'pointer', e.clientX, e.clientY);

		holdTimer = setTimeout(() => {
			holdTimer = null;
			// 检查是否还在 pendingHold（没被移动取消）
			if (radialMenuStore.state === 'pendingHold') {
				radialMenuStore.open(pendingPointerX, pendingPointerY);
				suppressNextClick = true;
			}
		}, duration);
	}

	function onPointerMove(e: PointerEvent) {
		// pendingHold 阶段：检查抖动
		if (radialMenuStore.state === 'pendingHold') {
			const dx = e.clientX - pointerStartX;
			const dy = e.clientY - pointerStartY;
			const dist = Math.hypot(dx, dy);

			const device = e.pointerType === 'touch' ? 'touch' : 'mouse';
			const tolerance = getHoldTolerance(device);

			if (dist > tolerance) {
				// 超过容差，取消
				if (holdTimer) {
					clearTimeout(holdTimer);
					holdTimer = null;
				}
				radialMenuStore.cancel();
				radialMenuStore.reset();
			}
			return;
		}

		// open 阶段：更新选择（RAF 合并）
		if (radialMenuStore.state === 'open' && radialMenuStore.mode === 'pointer') {
			const dx = e.clientX - radialMenuStore.centerX;
			const dy = e.clientY - radialMenuStore.centerY;

			if (rafId !== null) return;
			rafId = requestAnimationFrame(() => {
				rafId = null;
				radialMenuStore.updatePointer(dx, dy);
			});
		}
	}

	function onPointerUp(e: PointerEvent) {
		// pendingHold 阶段：短按，取消
		if (radialMenuStore.state === 'pendingHold') {
			if (holdTimer) {
				clearTimeout(holdTimer);
				holdTimer = null;
			}
			radialMenuStore.reset();
			return;
		}

		// open 阶段：执行选中
		if (radialMenuStore.state === 'open') {
			const action = radialMenuStore.commit();
			if (action) {
				onselect(action);
			}
			// 延迟 reset，让 shouldSuppressClick 生效
			setTimeout(() => radialMenuStore.reset(), 0);
		}
	}

	// ========== 键盘事件 ==========

	function onKeyDown(e: KeyboardEvent) {
		// open 阶段：方向键导航
		if (radialMenuStore.state === 'open' && radialMenuStore.mode === 'keyboard') {
			switch (e.key) {
				case 'ArrowUp':
					e.preventDefault();
					radialMenuStore.updateKeyboard('up');
					break;
				case 'ArrowDown':
					e.preventDefault();
					radialMenuStore.updateKeyboard('down');
					break;
				case 'ArrowLeft':
					e.preventDefault();
					radialMenuStore.updateKeyboard('left');
					break;
				case 'ArrowRight':
					e.preventDefault();
					radialMenuStore.updateKeyboard('right');
					break;
				case 'Enter': {
					e.preventDefault();
					const action = radialMenuStore.commit();
					if (action) onselect(action);
					setTimeout(() => radialMenuStore.reset(), 0);
					break;
				}
				case 'Escape':
					e.preventDefault();
					radialMenuStore.cancel();
					setTimeout(() => radialMenuStore.reset(), 0);
					break;
			}
			return;
		}

		// 非输入框 + Enter 长按
		if (radialMenuStore.isOpen) return;
		// 只在阅读模式触发
		if (!bookStore.viewerOpen) return;
		if (isTypingInInput(e)) return;
		if (isInteractiveTarget(e.target)) return;

		if (e.key === 'Enter') {
			const duration = getHoldDuration('keyboard');
			if (duration <= 0) return;

			radialMenuStore.startPendingHold('keyboard', window.innerWidth / 2, window.innerHeight / 2);

			holdTimer = setTimeout(() => {
				holdTimer = null;
				if (radialMenuStore.state === 'pendingHold') {
					radialMenuStore.open();
				}
			}, duration);
		}
	}

	function onKeyUp(e: KeyboardEvent) {
		if (e.key === 'Enter' && radialMenuStore.state === 'pendingHold') {
			if (holdTimer) {
				clearTimeout(holdTimer);
				holdTimer = null;
			}
			radialMenuStore.reset();
		}
	}

	// ========== Click 抑制 ==========

	function onClick(e: MouseEvent) {
		if (suppressNextClick) {
			e.preventDefault();
			e.stopPropagation();
			suppressNextClick = false;
		}
	}

	function onContextMenu(e: MouseEvent) {
		if (suppressNextClick) {
			e.preventDefault();
			suppressNextClick = false;
		}
	}

	// ========== 生命周期 ==========

	onMount(() => {
		window.addEventListener('pointerdown', onPointerDown, { capture: true });
		window.addEventListener('pointermove', onPointerMove, { capture: true });
		window.addEventListener('pointerup', onPointerUp, { capture: true });
		window.addEventListener('keydown', onKeyDown, { capture: true });
		window.addEventListener('keyup', onKeyUp, { capture: true });
		window.addEventListener('click', onClick, { capture: true });
		window.addEventListener('contextmenu', onContextMenu, { capture: true });
	});

	onDestroy(() => {
		if (holdTimer) clearTimeout(holdTimer);
		if (rafId !== null) cancelAnimationFrame(rafId);
		window.removeEventListener('pointerdown', onPointerDown, { capture: true } as any);
		window.removeEventListener('pointermove', onPointerMove, { capture: true } as any);
		window.removeEventListener('pointerup', onPointerUp, { capture: true } as any);
		window.removeEventListener('keydown', onKeyDown, { capture: true } as any);
		window.removeEventListener('keyup', onKeyUp, { capture: true } as any);
		window.removeEventListener('click', onClick, { capture: true } as any);
		window.removeEventListener('contextmenu', onContextMenu, { capture: true } as any);
	});
</script>
