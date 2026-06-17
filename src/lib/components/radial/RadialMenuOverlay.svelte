<script lang="ts">
	import '$lib/vendor/ray-menu/wc/neoview-ray-menu';
	import {
		NeoViewRayMenu,
		type NeoViewRayMenuItem
	} from '$lib/vendor/ray-menu/wc/neoview-ray-menu';
	import { radialMenuStore, type RadialMenuItem } from '$lib/stores/radialMenu';
	import { keyBindingsStore, type KeyBinding } from '$lib/stores/keybindings';
	import { getActionIconSvg } from '$lib/utils/actionIcons';

	let { onselect = (_action: string) => {} } = $props();

	let menuEl = $state<NeoViewRayMenu | null>(null);
	let openKey = '';

	const rayItems = $derived(toRayItems(radialMenuStore.config.items));
	const rayLayers = $derived(
		[0, 1, 2].map((index) =>
			toRayItems(radialMenuStore.config.layers?.[index] ?? (index === 0 ? radialMenuStore.config.items : []))
		)
	);
	const confirmKeys = $derived.by(() =>
		keyBindingsStore
			.getAllBindingsForAction('radialMenu.confirm')
			.map(({ binding }) => binding)
			.filter((binding): binding is KeyBinding => binding.type === 'keyboard')
			.map((binding) => binding.key)
	);

	$effect(() => {
		const el = menuEl;
		if (!el) return;

		const handleSelect = (event: Event) => {
			const item = (event as CustomEvent<NeoViewRayMenuItem>).detail;
			if (!item.action) return;
			radialMenuStore.commit();
			onselect(item.action);
			setTimeout(() => radialMenuStore.reset(), 0);
		};

		const handleMoveTo = (event: Event) => {
			const { menuId } = (event as CustomEvent<{ menuId: string }>).detail;
			radialMenuStore.setActiveMenu(menuId);
		};

		const handleClose = () => {
			if (!radialMenuStore.isOpen) return;
			radialMenuStore.cancel();
			setTimeout(() => radialMenuStore.reset(), 0);
		};

		el.addEventListener('ray-select', handleSelect);
		el.addEventListener('ray-moveto', handleMoveTo);
		el.addEventListener('ray-close', handleClose);

		return () => {
			el.removeEventListener('ray-select', handleSelect);
			el.removeEventListener('ray-moveto', handleMoveTo);
			el.removeEventListener('ray-close', handleClose);
		};
	});

	$effect(() => {
		const el = menuEl;
		if (!el) return;

		el.items = rayItems;
		el.layers = rayLayers;
		el.setAttribute('radius', String(radialMenuStore.config.radius));
		el.setAttribute('inner-radius', String(radialMenuStore.config.innerRadius));
		el.setAttribute('start-angle', String(radialMenuStore.config.startAngle));
		el.setAttribute('sweep-angle', String(radialMenuStore.config.sweepAngle));
		el.setAttribute('layer-count', String(radialMenuStore.config.layerCount));
		el.setAttribute('confirm-keys', confirmKeys.join(','));

		if (!radialMenuStore.isOpen) {
			openKey = '';
			el.close();
			return;
		}

		const nextOpenKey = `${radialMenuStore.centerX}:${radialMenuStore.centerY}:${radialMenuStore.config.activeMenuId}`;
		if (openKey !== nextOpenKey || !el.isOpen) {
			openKey = nextOpenKey;
			requestAnimationFrame(() => {
				if (radialMenuStore.isOpen) {
					el.open(radialMenuStore.centerX, radialMenuStore.centerY);
				}
			});
		}
	});

	function toRayItems(items: RadialMenuItem[]): NeoViewRayMenuItem[] {
		return items.map((item) => ({
			id: item.id,
			label: item.label,
			action: item.action,
			moveToMenuId: item.moveToMenuId,
			slotIndex: item.slotIndex,
			disabled: item.disabled,
			selectable: item.disabled ? false : undefined,
			iconSvg: item.moveToMenuId
				? getActionIconSvg('openRadialMenu.default')
				: item.action
					? getActionIconSvg(item.action)
					: undefined,
			children: item.children?.length ? toRayItems(item.children) : undefined
		}));
	}
</script>

<neoview-ray-menu bind:this={menuEl}></neoview-ray-menu>
