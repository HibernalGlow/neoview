<script lang="ts">
	/**
	 * 轮盘输入层
	 * 触发方式：右键短按（contextmenu）+ 键盘 Enter 长按
	 * 菜单内导航/选择由 ray-menu 内部处理
	 */

	import { onMount, onDestroy } from 'svelte';
	import { radialMenuStore } from '$lib/stores/radialMenu';
	import {
		keyBindingsStore,
		type KeyBinding,
		type MouseGesture,
		type TouchGesture
	} from '$lib/stores/keybindings';
	import { settingsOverlayOpen } from '$lib/stores/settingsOverlay.svelte';

	let { onselect = (_action: string) => {} } = $props();

	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let mouseHoldTimer: ReturnType<typeof setTimeout> | null = null;
	let touchHoldTimer: ReturnType<typeof setTimeout> | null = null;
	let mouseHoldStart: { x: number; y: number; button: 'left' | 'right' | 'middle' } | null = null;
	let touchHoldStart: { x: number; y: number; identifier: number } | null = null;

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
		// 排除侧栏、工具栏、底栏等 UI 区域（与 App.svelte 的区域判定保持一致）
		if (target.closest('[data-sidebar]')) return true;
		if (target.closest('[data-top-toolbar]')) return true;
		if (target.closest('[data-bottom-bar]')) return true;
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
				normalizeKey(keyBinding.key) === normalizeKey(keyCombo) && keyBinding.trigger === 'hold'
			);
		})?.binding as KeyBinding | undefined;

		return holdBinding?.durationMs ?? 450;
	}

	function getMouseButton(e: MouseEvent): 'left' | 'right' | 'middle' {
		if (e.button === 1) return 'middle';
		if (e.button === 2) return 'right';
		return 'left';
	}

	function getOpenRadialMouseBinding(
		button: 'left' | 'right' | 'middle',
		trigger: 'instant' | 'hold'
	): MouseGesture | null {
		const action = keyBindingsStore.findActionByMouseGesture('press', button, 'press', trigger);
		if (!action?.startsWith('openRadialMenu.')) return null;

		const binding = keyBindingsStore.getAllBindingsForAction(action).find(({ binding }) => {
			if (binding.type !== 'mouse') return false;
			const mouseBinding = binding as MouseGesture;
			return (
				mouseBinding.gesture === 'press' &&
				(mouseBinding.button ?? 'left') === button &&
				(mouseBinding.action ?? 'press') === 'press' &&
				(mouseBinding.trigger ?? 'instant') === trigger
			);
		})?.binding as MouseGesture | undefined;

		return binding ?? null;
	}

	function getOpenRadialTouchBinding(trigger: 'instant' | 'hold'): TouchGesture | null {
		const gestures = trigger === 'hold' ? ['long-press', 'tap'] : ['tap', 'long-press'];
		for (const gesture of gestures) {
			const action = keyBindingsStore.findActionByTouchGestureInContext(gesture, trigger);
			if (!action?.startsWith('openRadialMenu.')) continue;

			const binding = keyBindingsStore.getAllBindingsForAction(action).find(({ binding }) => {
				if (binding.type !== 'touch') return false;
				const touchBinding = binding as TouchGesture;
				return touchBinding.gesture === gesture && (touchBinding.trigger ?? 'instant') === trigger;
			})?.binding as TouchGesture | undefined;

			if (binding) return binding;
		}
		return null;
	}

	function canOpenFromEvent(e: Event): boolean {
		if (radialMenuStore.isOpen) return false;
		if ($settingsOverlayOpen) return false;
		if (!radialMenuStore.config.enabled) return false;
		if (isTypingInInput(e)) return false;
		if (isInteractiveTarget(e.target)) return false;
		return true;
	}

	function consumeEvent(e: Event) {
		e.preventDefault();
		e.stopPropagation();
		if ('stopImmediatePropagation' in e) {
			e.stopImmediatePropagation();
		}
	}

	function openAt(x: number, y: number, mode: 'pointer' | 'keyboard') {
		if (!radialMenuStore.isOpen) {
			radialMenuStore.open(x, y, mode);
		}
	}

	// ========== 右键短按触发（contextmenu）==========

	function onContextMenu(e: MouseEvent) {
		if (!canOpenFromEvent(e)) return;

		consumeEvent(e);
		openAt(e.clientX, e.clientY, 'pointer');
	}

	// ========== 键盘 Enter 长按触发 ==========

	function onKeyDown(e: KeyboardEvent) {
		// 菜单已打开时不干预（ray-menu 自己处理键盘导航）
		if (!canOpenFromEvent(e)) return;
		if (holdTimer || e.repeat) return;

		const keyCombo = formatKeyCombo(e);
		const duration = getKeyboardHoldDuration(keyCombo);
		if (duration <= 0) return;

		holdTimer = setTimeout(() => {
			holdTimer = null;
			if (!radialMenuStore.isOpen) {
				openAt(window.innerWidth / 2, window.innerHeight / 2, 'keyboard');
			}
		}, duration);
	}

	function onKeyUp(e: KeyboardEvent) {
		if (holdTimer && getKeyboardHoldDuration(formatKeyCombo(e)) > 0) {
			clearTimeout(holdTimer);
			holdTimer = null;
		}
	}

	function cancelMouseHold() {
		if (mouseHoldTimer) clearTimeout(mouseHoldTimer);
		mouseHoldTimer = null;
		mouseHoldStart = null;
	}

	function cancelTouchHold() {
		if (touchHoldTimer) clearTimeout(touchHoldTimer);
		touchHoldTimer = null;
		touchHoldStart = null;
	}

	function onMouseDown(e: MouseEvent) {
		if (!canOpenFromEvent(e)) return;

		const button = getMouseButton(e);
		const instantBinding = getOpenRadialMouseBinding(button, 'instant');
		if (instantBinding) {
			consumeEvent(e);
			openAt(e.clientX, e.clientY, 'pointer');
			return;
		}

		const holdBinding = getOpenRadialMouseBinding(button, 'hold');
		if (!holdBinding || mouseHoldTimer) return;

		mouseHoldStart = { x: e.clientX, y: e.clientY, button };
		mouseHoldTimer = setTimeout(() => {
			const start = mouseHoldStart;
			cancelMouseHold();
			if (start) openAt(start.x, start.y, 'pointer');
		}, holdBinding.durationMs ?? 450);
	}

	function onMouseMove(e: MouseEvent) {
		if (!mouseHoldStart) return;
		const binding = getOpenRadialMouseBinding(mouseHoldStart.button, 'hold');
		const tolerance = binding?.moveTolerancePx ?? 12;
		const dx = e.clientX - mouseHoldStart.x;
		const dy = e.clientY - mouseHoldStart.y;
		if (Math.hypot(dx, dy) > tolerance) cancelMouseHold();
	}

	function onMouseUp() {
		cancelMouseHold();
	}

	function onTouchStart(e: TouchEvent) {
		if (!canOpenFromEvent(e)) return;
		const touch = e.changedTouches[0];
		if (!touch) return;

		const instantBinding = getOpenRadialTouchBinding('instant');
		if (instantBinding?.gesture === 'tap') {
			touchHoldStart = { x: touch.clientX, y: touch.clientY, identifier: touch.identifier };
			return;
		}

		const holdBinding = getOpenRadialTouchBinding('hold');
		if (!holdBinding || touchHoldTimer) return;

		touchHoldStart = { x: touch.clientX, y: touch.clientY, identifier: touch.identifier };
		touchHoldTimer = setTimeout(() => {
			const start = touchHoldStart;
			cancelTouchHold();
			if (start) openAt(start.x, start.y, 'pointer');
		}, holdBinding.durationMs ?? 450);
	}

	function onTouchMove(e: TouchEvent) {
		if (!touchHoldStart) return;
		const touch = Array.from(e.changedTouches).find(
			(item) => item.identifier === touchHoldStart?.identifier
		);
		if (!touch) return;

		const binding = getOpenRadialTouchBinding('hold') ?? getOpenRadialTouchBinding('instant');
		const tolerance = binding?.moveTolerancePx ?? 12;
		const dx = touch.clientX - touchHoldStart.x;
		const dy = touch.clientY - touchHoldStart.y;
		if (Math.hypot(dx, dy) > tolerance) cancelTouchHold();
	}

	function onTouchEnd(e: TouchEvent) {
		const start = touchHoldStart;
		const instantBinding = getOpenRadialTouchBinding('instant');
		cancelTouchHold();
		if (!start || instantBinding?.gesture !== 'tap' || radialMenuStore.isOpen) return;

		const touch = Array.from(e.changedTouches).find((item) => item.identifier === start.identifier);
		if (!touch) return;
		consumeEvent(e);
		openAt(touch.clientX, touch.clientY, 'pointer');
	}

	onMount(() => {
		window.addEventListener('contextmenu', onContextMenu, { capture: true });
		window.addEventListener('keydown', onKeyDown, { capture: true });
		window.addEventListener('keyup', onKeyUp, { capture: true });
		window.addEventListener('mousedown', onMouseDown, { capture: true });
		window.addEventListener('mousemove', onMouseMove, { capture: true });
		window.addEventListener('mouseup', onMouseUp, { capture: true });
		window.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
		window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
		window.addEventListener('touchend', onTouchEnd, { capture: true });
		window.addEventListener('touchcancel', cancelTouchHold, { capture: true });
	});

	onDestroy(() => {
		if (holdTimer) clearTimeout(holdTimer);
		cancelMouseHold();
		cancelTouchHold();
		window.removeEventListener('contextmenu', onContextMenu, { capture: true } as any);
		window.removeEventListener('keydown', onKeyDown, { capture: true } as any);
		window.removeEventListener('keyup', onKeyUp, { capture: true } as any);
		window.removeEventListener('mousedown', onMouseDown, { capture: true } as any);
		window.removeEventListener('mousemove', onMouseMove, { capture: true } as any);
		window.removeEventListener('mouseup', onMouseUp, { capture: true } as any);
		window.removeEventListener('touchstart', onTouchStart, { capture: true } as any);
		window.removeEventListener('touchmove', onTouchMove, { capture: true } as any);
		window.removeEventListener('touchend', onTouchEnd, { capture: true } as any);
		window.removeEventListener('touchcancel', cancelTouchHold, { capture: true } as any);
	});
</script>
