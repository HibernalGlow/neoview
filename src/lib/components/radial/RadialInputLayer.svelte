<script lang="ts">
	/**
	 * 轮盘输入层
	 * 触发方式：右键短按（contextmenu）+ 键盘 Enter 长按
	 * 菜单内导航/选择由 ray-menu 内部处理
	 */

	import { onMount, onDestroy } from 'svelte';
	import { radialMenuStore } from '$lib/stores/radialMenu';
	import { keyBindingsStore } from '$lib/stores/keybindings';
	import { bookStore } from '$lib/stores/book.svelte';

	let {
		onselect = (_action: string) => {},
	} = $props();

	let holdTimer: ReturnType<typeof setTimeout> | null = null;

	function isTypingInInput(e: Event): boolean {
		const t = e.target as HTMLElement | null;
		if (!t) return false;
		return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
	}

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

	function getKeyboardHoldDuration(): number {
		const action = keyBindingsStore.findActionByHold({ device: 'keyboard', key: 'Enter' });
		if (!action) return 0;
		const binding = keyBindingsStore.getBinding(action);
		if (!binding) return 0;
		const holdBinding = binding.bindings.find((b) => b.type === 'hold');
		return (holdBinding as any)?.durationMs ?? 450;
	}

	// ========== 右键短按触发（contextmenu）==========

	function onContextMenu(e: MouseEvent) {
		if (radialMenuStore.isOpen) return;
		if (!bookStore.viewerOpen) return;
		if (!radialMenuStore.config.enabled) return;
		if (isTypingInInput(e)) return;
		if (isInteractiveTarget(e.target)) return;

		e.preventDefault();
		radialMenuStore.open(e.clientX, e.clientY, 'pointer');
	}

	// ========== 键盘 Enter 长按触发 ==========

	function onKeyDown(e: KeyboardEvent) {
		// 菜单已打开时不干预（ray-menu 自己处理键盘导航）
		if (radialMenuStore.isOpen) return;
		if (!bookStore.viewerOpen) return;
		if (!radialMenuStore.config.enabled) return;
		if (isTypingInInput(e)) return;
		if (isInteractiveTarget(e.target)) return;

		if (e.key === 'Enter') {
			const duration = getKeyboardHoldDuration();
			if (duration <= 0) return;

			holdTimer = setTimeout(() => {
				holdTimer = null;
				if (!radialMenuStore.isOpen) {
					radialMenuStore.open(
						window.innerWidth / 2,
						window.innerHeight / 2,
						'keyboard'
					);
				}
			}, duration);
		}
	}

	function onKeyUp(e: KeyboardEvent) {
		if (e.key === 'Enter' && holdTimer) {
			clearTimeout(holdTimer);
			holdTimer = null;
		}
	}

	onMount(() => {
		window.addEventListener('contextmenu', onContextMenu, { capture: true });
		window.addEventListener('keydown', onKeyDown, { capture: true });
		window.addEventListener('keyup', onKeyUp, { capture: true });
	});

	onDestroy(() => {
		if (holdTimer) clearTimeout(holdTimer);
		window.removeEventListener('contextmenu', onContextMenu, { capture: true } as any);
		window.removeEventListener('keydown', onKeyDown, { capture: true } as any);
		window.removeEventListener('keyup', onKeyUp, { capture: true } as any);
	});
</script>
