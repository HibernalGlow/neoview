<script lang="ts">
	/**
	 * 轮盘输入层
	 * 触发方式：右键短按（contextmenu）+ 键盘 Enter 长按
	 * 菜单内导航/选择由 ray-menu 内部处理
	 */

	import { onMount, onDestroy } from 'svelte';
	import { radialMenuStore } from '$lib/stores/radialMenu';
	import { keyBindingsStore, type KeyBinding } from '$lib/stores/keybindings';
	import { bookStore } from '$lib/stores/book.svelte';
	import { settingsOverlayOpen } from '$lib/stores/settingsOverlay.svelte';

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

	function normalizeKey(value: string): string {
		return value
			.toLowerCase()
			.replace(/←/g, 'arrowleft')
			.replace(/→/g, 'arrowright')
			.replace(/↑/g, 'arrowup')
			.replace(/↓/g, 'arrowdown');
	}

	function formatKeyCombo(e: KeyboardEvent): string {
		const parts: string[] = [];
		if (e.ctrlKey) parts.push('Ctrl');
		if (e.shiftKey) parts.push('Shift');
		if (e.altKey) parts.push('Alt');

		const keyMap: Record<string, string> = {
			' ': 'Space',
			'+': 'Plus',
			'-': 'Minus',
			ArrowUp: 'ArrowUp',
			ArrowDown: 'ArrowDown',
			ArrowLeft: 'ArrowLeft',
			ArrowRight: 'ArrowRight'
		};

		parts.push(keyMap[e.key] || e.key);
		return parts.join('+');
	}

	function getKeyboardHoldDuration(keyCombo: string): number {
		const action = keyBindingsStore.findActionByHeldKey(keyCombo);
		if (!action?.startsWith('openRadialMenu.')) return 0;

		const holdBinding = keyBindingsStore.getAllBindingsForAction(action).find(({ binding }) => {
			if (binding.type !== 'keyboard') return false;
			const keyBinding = binding as KeyBinding;
			return (
				normalizeKey(keyBinding.key) === normalizeKey(keyCombo) &&
				keyBinding.trigger === 'hold'
			);
		})?.binding as KeyBinding | undefined;

		return holdBinding?.durationMs ?? 450;
	}

	// ========== 右键短按触发（contextmenu）==========

	function onContextMenu(e: MouseEvent) {
		if (radialMenuStore.isOpen) return;
		if ($settingsOverlayOpen) return;
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
		if ($settingsOverlayOpen) return;
		if (!radialMenuStore.config.enabled) return;
		if (isTypingInInput(e)) return;
		if (isInteractiveTarget(e.target)) return;
		if (holdTimer || e.repeat) return;

		const keyCombo = formatKeyCombo(e);
		const duration = getKeyboardHoldDuration(keyCombo);
		if (duration <= 0) return;

		holdTimer = setTimeout(() => {
			holdTimer = null;
			if (!radialMenuStore.isOpen) {
				radialMenuStore.open(window.innerWidth / 2, window.innerHeight / 2, 'keyboard');
			}
		}, duration);
	}

	function onKeyUp(e: KeyboardEvent) {
		if (holdTimer && getKeyboardHoldDuration(formatKeyCombo(e)) > 0) {
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
