<script lang="ts">
	/**
	 * 轮盘菜单覆盖层
	 * 使用 ray-menu Web Component 渲染轮盘
	 * 监听 ray-select 事件并回调 onselect
	 */

	import 'ray-menu';
	import { radialMenuStore } from '$lib/stores/radialMenu';

	let {
		onselect = (_action: string) => {},
	} = $props();

	/** ray-menu 元素引用 */
	let menuEl: RayMenuElement | null = $state(null);

	interface MenuItem {
		id: string;
		label: string;
		icon?: string;
		disabled?: boolean;
		selectable?: boolean;
		children?: MenuItem[];
	}

	/** ray-menu 元素接口（局部声明，避免 svelte-check 对自定义元素类型不识别） */
	interface RayMenuElement extends HTMLElement {
		items: MenuItem[];
		readonly isOpen: boolean;
		open(x: number, y: number): void;
		close(): void;
		toggle(x: number, y: number): void;
	}

	const MIN_SLOT_COUNT = 8;

	function getSlotIndex(item: typeof radialMenuStore.config.items[number], fallbackIndex: number): number {
		return typeof item.slotIndex === 'number' && Number.isFinite(item.slotIndex)
			? item.slotIndex
			: fallbackIndex;
	}

	function getSlotCount(items: typeof radialMenuStore.config.items): number {
		if (items.length === 0) return 0;
		const maxSlot = items.reduce((max, item, index) => Math.max(max, getSlotIndex(item, index)), 0);
		return Math.max(MIN_SLOT_COUNT, maxSlot + 1);
	}

	function toSlottedItems(items: typeof radialMenuStore.config.items): MenuItem[] {
		const slotCount = getSlotCount(items);
		const bySlot = new Map<number, typeof radialMenuStore.config.items[number]>();

		items.forEach((item, index) => {
			bySlot.set(getSlotIndex(item, index), item);
		});

		return Array.from({ length: slotCount }, (_, index) => {
			const item = bySlot.get(index);
			if (!item) {
				return {
					id: `__empty_${index}__`,
					label: '',
					disabled: true
				};
			}

			const children = item.children?.length ? toSlottedItems(item.children) : undefined;
			return {
				id: item.action ?? item.id,
				label: item.label,
				icon: item.icon,
				disabled: item.disabled || (!item.action && !children?.length),
				selectable: Boolean(item.action),
				children
			};
		});
	}

	function toMenuItems(items: typeof radialMenuStore.config.items): MenuItem[] {
		if (items.length === 0) {
			return [
				{
					id: '__empty__',
					label: '未配置',
					disabled: true
				}
			];
		}

		return toSlottedItems(items);
	}

	// 同步 items 到 ray-menu
	$effect(() => {
		if (!menuEl) return;
		menuEl.items = toMenuItems(radialMenuStore.config.items);
	});

	// 同步视觉属性
	$effect(() => {
		if (!menuEl) return;
		const cfg = radialMenuStore.config;
		menuEl.setAttribute('radius', String(cfg.radius));
		menuEl.setAttribute('inner-radius', String(cfg.innerRadius));
		menuEl.setAttribute('variant', cfg.variant);
		menuEl.setAttribute('start-angle', String(cfg.startAngle));
		menuEl.setAttribute('sweep-angle', String(cfg.sweepAngle));
	});

	// 监听状态变化 → open/close
	$effect(() => {
		if (!menuEl) return;
		const st = radialMenuStore.state;
		const x = radialMenuStore.centerX;
		const y = radialMenuStore.centerY;
		if (st === 'open') {
			menuEl.open(x, y);
		} else if (st === 'committed' || st === 'cancelled') {
			menuEl.close();
		}
	});

	// 事件监听
	$effect(() => {
		if (!menuEl) return;
		const el = menuEl;
		el.addEventListener('ray-select', handleSelect);
		el.addEventListener('ray-close', handleClose);
		return () => {
			el.removeEventListener('ray-select', handleSelect);
			el.removeEventListener('ray-close', handleClose);
		};
	});

	function handleSelect(e: Event) {
		const detail = (e as CustomEvent<MenuItem>).detail;
		if (!detail?.id) return;
		radialMenuStore.commit();
		onselect(detail.id);
		setTimeout(() => radialMenuStore.reset(), 0);
	}

	function handleClose() {
		if (radialMenuStore.state === 'open') {
			radialMenuStore.cancel();
			setTimeout(() => radialMenuStore.reset(), 0);
		}
	}
</script>

<ray-menu bind:this={menuEl}></ray-menu>

<style>
	ray-menu {
		--ray-bg: rgba(26, 26, 46, 0.92);
		--ray-text: rgba(255, 255, 255, 0.9);
		--ray-accent: rgba(100, 160, 255, 0.9);
		--ray-accent-text: #ffffff;
		--ray-border: rgba(255, 255, 255, 0.15);
		--ray-arc-fill: rgba(30, 30, 40, 0.7);
		--ray-arc-fill-hover: rgba(100, 160, 255, 0.6);
		--ray-arc-stroke: rgba(255, 255, 255, 0.15);
		--ray-arc-stroke-hover: rgba(100, 160, 255, 1);
		z-index: 9999;
	}
</style>
