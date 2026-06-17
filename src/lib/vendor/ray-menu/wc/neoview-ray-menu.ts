import {
	type MenuConfig,
	type MenuItem,
	type Point,
	DEFAULT_CONFIG,
	detectEdgeConstraints,
	distance,
	distributeAngles,
	normalizeAngle
} from '../core';
import { RAY_MENU_STYLES } from './ray-menu-styles';
import { createArcPath, createInnerRing, createMenuSvg, createOuterRing } from './ray-menu-rendering';

export interface NeoViewRayMenuItem extends MenuItem {
	action?: string | null;
	moveToMenuId?: string;
	iconSvg?: string;
	slotIndex?: number;
	children?: NeoViewRayMenuItem[];
}

interface RuntimeSlot {
	key: string;
	item: NeoViewRayMenuItem | null;
	level: number;
	index: number;
	path: string[];
	innerRadius: number;
	outerRadius: number;
	startAngle: number;
	endAngle: number;
	centerAngle: number;
}

interface RayMoveToDetail {
	item: NeoViewRayMenuItem;
	menuId: string;
}

const BaseElement =
	typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as typeof HTMLElement);

const MIN_SLOT_COUNT = 8;
const SUBMENU_RADIUS_STEP = 60;
const SVG_PADDING = 20;
const FULL_CIRCLE = Math.PI * 2;

function toRadians(degrees: number): number {
	return degrees * (Math.PI / 180);
}

function getSlotIndex(item: NeoViewRayMenuItem, fallbackIndex: number): number {
	return typeof item.slotIndex === 'number' && Number.isFinite(item.slotIndex)
		? item.slotIndex
		: fallbackIndex;
}

function getSlotCount(items: NeoViewRayMenuItem[]): number {
	if (items.length === 0) return 0;
	const maxSlot = items.reduce(
		(max, item, index) => Math.max(max, getSlotIndex(item, index)),
		0
	);
	return Math.max(MIN_SLOT_COUNT, maxSlot + 1);
}

function getItemsBySlot(items: NeoViewRayMenuItem[]): Map<number, NeoViewRayMenuItem> {
	const result = new Map<number, NeoViewRayMenuItem>();
	items.forEach((item, index) => result.set(getSlotIndex(item, index), item));
	return result;
}

function findItemById(items: NeoViewRayMenuItem[], id: string): NeoViewRayMenuItem | null {
	for (const item of items) {
		if (item.id === id) return item;
		const child = findItemById(item.children ?? [], id);
		if (child) return child;
	}
	return null;
}

function findItemByPath(items: NeoViewRayMenuItem[], path: string[]): NeoViewRayMenuItem | null {
	let currentItems = items;
	let current: NeoViewRayMenuItem | null = null;
	for (const id of path) {
		current = currentItems.find((item) => item.id === id) ?? null;
		if (!current) return null;
		currentItems = current.children ?? [];
	}
	return current;
}

function getMaxDepth(items: NeoViewRayMenuItem[], depth = 1): number {
	let maxDepth = items.length > 0 ? depth : 1;
	for (const item of items) {
		if (item.children?.length) {
			maxDepth = Math.max(maxDepth, getMaxDepth(item.children, depth + 1));
		}
	}
	return Math.min(3, maxDepth);
}

function getShortLabel(label: string): string {
	return label.length > 8 ? `${label.slice(0, 8)}...` : label;
}

export class NeoViewRayMenu extends BaseElement {
	private _items: NeoViewRayMenuItem[] = [];
	private _isOpen = false;
	private _position: Point = { x: 0, y: 0 };
	private _openedAt = 0;
	private _config: MenuConfig = { ...DEFAULT_CONFIG };
	private _layerCount = 3;
	private _confirmKeys = new Set(['space', 'enter', ' ']);
	private _selectedPath: string[] = [];
	private _hoveredKey = '';
	private _renderedSlots: RuntimeSlot[] = [];
	private _hasRenderedOnce = false;
	private _handlePointerMove = this._onPointerMove.bind(this);
	private _handlePointerUp = this._onPointerUp.bind(this);
	private _handleKeyDown = this._onKeyDown.bind(this);

	static get observedAttributes() {
		return ['radius', 'inner-radius', 'start-angle', 'sweep-angle', 'layer-count', 'confirm-keys'];
	}

	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this._initStyles();
	}

	get items(): NeoViewRayMenuItem[] {
		return this._items;
	}

	set items(value: NeoViewRayMenuItem[]) {
		this._items = Array.isArray(value) ? value : [];
		this._selectedPath = this._selectedPath.filter((_, index, path) =>
			Boolean(findItemByPath(this._items, path.slice(0, index + 1)))
		);
		if (this._isOpen) this._render();
	}

	get isOpen(): boolean {
		return this._isOpen;
	}

	open(x: number, y: number): void {
		const outerRadius = this._getOuterRadius();
		const viewport = { width: window.innerWidth, height: window.innerHeight };
		const edgeState = detectEdgeConstraints({ x, y }, outerRadius, viewport);
		this._position = { x: x + edgeState.offset.x, y: y + edgeState.offset.y };
		this._isOpen = true;
		this._openedAt = Date.now();
		this._selectedPath = [];
		this._hoveredKey = '';
		this._hasRenderedOnce = false;
		this._render();
		this._addGlobalListeners();
		this.dispatchEvent(new CustomEvent<Point>('ray-open', { detail: this._position }));
	}

	close(): void {
		if (!this._isOpen) return;
		this._removeGlobalListeners();
		this._isOpen = false;
		this._selectedPath = [];
		this._hoveredKey = '';
		this._hasRenderedOnce = false;
		this._clearContainer();
		this.dispatchEvent(new CustomEvent('ray-close'));
	}

	updateHoverFromPoint(x: number, y: number): void {
		if (!this._isOpen) return;
		const slot = this._getSlotAtPoint({ x, y });
		const nextKey = slot?.key ?? '';
		if (nextKey === this._hoveredKey) return;

		this._hoveredKey = nextKey;
		if (slot?.item) {
			this._selectedPath = slot.path;
		}
		this._render();
	}

	getHoveredItem(): NeoViewRayMenuItem | null {
		const slot = this._renderedSlots.find((item) => item.key === this._hoveredKey);
		return slot?.item ?? null;
	}

	attributeChangedCallback(name: string, _oldValue: string, newValue: string): void {
		switch (name) {
			case 'radius':
				this._config.radius = Number(newValue) || DEFAULT_CONFIG.radius;
				break;
			case 'inner-radius':
				this._config.innerRadius = Number(newValue) || DEFAULT_CONFIG.innerRadius;
				break;
			case 'start-angle':
				this._config.startAngle =
					newValue !== null ? toRadians(Number(newValue)) : DEFAULT_CONFIG.startAngle;
				break;
			case 'sweep-angle':
				this._config.sweepAngle =
					newValue !== null ? toRadians(Number(newValue)) : DEFAULT_CONFIG.sweepAngle;
				break;
			case 'layer-count':
				this._layerCount = Math.max(1, Math.min(3, Number(newValue) || 3));
				break;
			case 'confirm-keys':
				this._confirmKeys = new Set(
					(newValue || 'Space,Enter')
						.split(',')
						.map((key) => this._normalizeKey(key))
						.filter(Boolean)
				);
				this._confirmKeys.add(' ');
				break;
		}
		if (this._isOpen) this._render();
	}

	disconnectedCallback(): void {
		this._removeGlobalListeners();
	}

	private _initStyles(): void {
		if (!this.shadowRoot) return;
		const style = document.createElement('style');
		style.textContent = `${RAY_MENU_STYLES}
			:host {
				--ray-bg: rgba(12, 14, 20, 0.86);
				--ray-arc-fill: rgba(20, 24, 34, 0.62);
				--ray-arc-fill-hover: rgba(56, 189, 248, 0.42);
				--ray-arc-stroke-hover: rgba(125, 211, 252, 0.85);
			}
			.ray-menu-container[data-neoview="true"] {
				cursor: crosshair;
			}
			.ray-menu-svg {
				overflow: visible;
			}
			.ray-menu-arc[data-selected="true"] {
				fill: rgba(14, 165, 233, 0.26);
				stroke: rgba(125, 211, 252, 0.72);
				opacity: 0.95;
			}
			.ray-menu-arc[data-empty="true"] {
				fill: rgba(255, 255, 255, 0.025);
				opacity: 0.38;
			}
			.ray-menu-label {
				min-width: 68px;
				max-width: 96px;
				justify-content: center;
				padding: 5px 8px;
				font-size: 11px;
				text-align: center;
			}
			.ray-menu-label-icon svg,
			.ray-menu-label-icon {
				width: 16px;
				height: 16px;
				flex: 0 0 auto;
			}
			.ray-menu-label-text {
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
			.ray-menu-center-hint {
				position: absolute;
				left: 50%;
				top: 50%;
				max-width: 160px;
				transform: translate(-50%, -50%);
				color: var(--ray-muted);
				font: 500 11px/1.25 var(--ray-font-family);
				text-align: center;
				pointer-events: none;
			}
		`;
		this.shadowRoot.appendChild(style);
	}

	private _addGlobalListeners(): void {
		window.addEventListener('pointermove', this._handlePointerMove, { capture: true });
		window.addEventListener('pointerup', this._handlePointerUp, { capture: true });
		window.addEventListener('keydown', this._handleKeyDown, { capture: true });
	}

	private _removeGlobalListeners(): void {
		window.removeEventListener('pointermove', this._handlePointerMove, { capture: true } as AddEventListenerOptions);
		window.removeEventListener('pointerup', this._handlePointerUp, { capture: true } as AddEventListenerOptions);
		window.removeEventListener('keydown', this._handleKeyDown, { capture: true } as AddEventListenerOptions);
	}

	private _onPointerMove(event: PointerEvent): void {
		this.updateHoverFromPoint(event.clientX, event.clientY);
	}

	private _onPointerUp(event: PointerEvent): void {
		if (!this._isOpen) return;
		event.preventDefault();
		event.stopPropagation();
		this.updateHoverFromPoint(event.clientX, event.clientY);
		if (!this.getHoveredItem() && Date.now() - this._openedAt < 180) return;
		this._commitHovered();
	}

	private _onKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			this.close();
			return;
		}

		if (this._confirmKeys.has(this._normalizeKey(event.key))) {
			event.preventDefault();
			this._commitHovered();
			return;
		}

		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			this._moveKeyboardSibling(event.key === 'ArrowRight' ? 1 : -1);
			return;
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			this._enterKeyboardChild();
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			this._exitKeyboardChild();
		}
	}

	private _normalizeKey(key: string): string {
		if (key === ' ') return ' ';
		return key.trim().toLowerCase();
	}

	private _getItemsAtPath(path: string[]): NeoViewRayMenuItem[] {
		if (path.length === 0) return this._items;
		const parent = findItemByPath(this._items, path);
		return parent?.children ?? [];
	}

	private _getOrderedItems(items: NeoViewRayMenuItem[]): NeoViewRayMenuItem[] {
		return [...items].sort((a, b) => {
			const aIndex = getSlotIndex(a, items.indexOf(a));
			const bIndex = getSlotIndex(b, items.indexOf(b));
			return aIndex - bIndex || items.indexOf(a) - items.indexOf(b);
		});
	}

	private _setKeyboardPath(path: string[]): void {
		this._selectedPath = path;
		const item = findItemByPath(this._items, path);
		if (!item) {
			this._hoveredKey = '';
			this._render();
			return;
		}
		const level = Math.max(1, path.length);
		const items = this._getItemsAtPath(path.slice(0, -1));
		const fallbackIndex = items.findIndex((candidate) => candidate.id === item.id);
		this._hoveredKey = `${level}:${getSlotIndex(item, Math.max(0, fallbackIndex))}:${item.id}`;
		this._render();
	}

	private _moveKeyboardSibling(delta: 1 | -1): void {
		const level = Math.max(1, this._selectedPath.length || 1);
		const parentPath = this._selectedPath.slice(0, level - 1);
		const siblings = this._getOrderedItems(this._getItemsAtPath(parentPath)).filter(
			(item) => !item.disabled
		);
		if (siblings.length === 0) return;

		const currentId = this._selectedPath[level - 1];
		const currentIndex = siblings.findIndex((item) => item.id === currentId);
		const nextIndex =
			currentIndex < 0
				? delta > 0
					? 0
					: siblings.length - 1
				: (currentIndex + delta + siblings.length) % siblings.length;
		this._setKeyboardPath([...parentPath, siblings[nextIndex].id]);
	}

	private _enterKeyboardChild(): void {
		const current = findItemByPath(this._items, this._selectedPath);
		const children = this._getOrderedItems(current?.children ?? []).filter((item) => !item.disabled);
		if (!current || children.length === 0 || this._selectedPath.length >= this._getVisibleLayerLimit()) {
			this._moveKeyboardSibling(1);
			return;
		}
		this._setKeyboardPath([...this._selectedPath, children[0].id]);
	}

	private _exitKeyboardChild(): void {
		if (this._selectedPath.length <= 1) {
			this._moveKeyboardSibling(-1);
			return;
		}
		this._setKeyboardPath(this._selectedPath.slice(0, -1));
	}

	private _commitHovered(): void {
		const item = this.getHoveredItem();
		if (!item || item.disabled || item.selectable === false) {
			this.close();
			return;
		}

		if (item.moveToMenuId) {
			this.dispatchEvent(
				new CustomEvent<RayMoveToDetail>('ray-moveto', {
					detail: { item, menuId: item.moveToMenuId }
				})
			);
			this._selectedPath = [];
			this._hoveredKey = '';
			this._render();
			return;
		}

		const hasChildren = Boolean(item.children?.length);
		if (hasChildren && !item.action) return;

		item.onSelect?.();
		this.dispatchEvent(new CustomEvent<NeoViewRayMenuItem>('ray-select', { detail: item }));
		this.close();
	}

	private _getOuterRadius(): number {
		return this._config.radius + (this._getVisibleLayerLimit() - 1) * SUBMENU_RADIUS_STEP;
	}

	private _getVisibleLayerLimit(): number {
		return Math.max(1, Math.min(3, this._layerCount || getMaxDepth(this._items)));
	}

	private _getBand(level: number): { inner: number; outer: number } {
		const inner =
			level === 1
				? this._config.innerRadius
				: this._config.radius + (level - 2) * SUBMENU_RADIUS_STEP;
		const outer = level === 1 ? this._config.radius : inner + SUBMENU_RADIUS_STEP;
		return { inner, outer };
	}

	private _buildLevelSlots(
		level: number,
		items: NeoViewRayMenuItem[],
		parentPath: string[]
	): RuntimeSlot[] {
		const slotCount = getSlotCount(items);
		if (slotCount === 0) return [];

		const bySlot = getItemsBySlot(items);
		const band = this._getBand(level);
		const segmentAngle = this._config.sweepAngle / slotCount;
		const centers = distributeAngles(slotCount, this._config.startAngle, this._config.sweepAngle);

		return centers.map((centerAngle, index) => {
			const item = bySlot.get(index) ?? null;
			const startAngle = this._config.startAngle + index * segmentAngle;
			const endAngle = startAngle + segmentAngle;
			return {
				key: `${level}:${index}:${item?.id ?? 'empty'}`,
				item,
				level,
				index,
				path: item ? [...parentPath, item.id] : parentPath,
				innerRadius: band.inner,
				outerRadius: band.outer,
				startAngle,
				endAngle,
				centerAngle
			};
		});
	}

	private _buildVisibleSlots(): RuntimeSlot[] {
		const slots: RuntimeSlot[] = [];
		const rootItems = this._items;
		const level1 = this._selectedPath[0] ? findItemById(rootItems, this._selectedPath[0]) : null;
		const level2 =
			level1 && this._selectedPath[1] ? findItemById(level1.children ?? [], this._selectedPath[1]) : null;
		const layerLimit = this._getVisibleLayerLimit();

		slots.push(...this._buildLevelSlots(1, rootItems, []));
		if (layerLimit >= 2 && level1) {
			slots.push(...this._buildLevelSlots(2, level1.children ?? [], [level1.id]));
		}
		if (layerLimit >= 3 && level1 && level2) {
			slots.push(...this._buildLevelSlots(3, level2.children ?? [], [level1.id, level2.id]));
		}
		return slots;
	}

	private _getSlotAtPoint(point: Point): RuntimeSlot | null {
		const pointerDistance = distance(this._position, point);
		const slotLevel = Array.from({ length: this._getVisibleLayerLimit() }, (_, index) => index + 1).find(
			(level) => {
				const band = this._getBand(level);
				return pointerDistance >= band.inner && pointerDistance <= band.outer;
			}
		);
		if (!slotLevel) return null;

		const levelSlots = this._renderedSlots.filter((slot) => slot.level === slotLevel);
		if (levelSlots.length === 0) return null;

		const angle = normalizeAngle(Math.atan2(point.y - this._position.y, point.x - this._position.x));
		const offset = normalizeAngle(angle - normalizeAngle(this._config.startAngle));
		if (offset > Math.abs(this._config.sweepAngle)) return null;

		const slotIndex = Math.min(
			levelSlots.length - 1,
			Math.max(0, Math.floor(offset / (Math.abs(this._config.sweepAngle) / levelSlots.length)))
		);
		return levelSlots[slotIndex] ?? null;
	}

	private _clearContainer(): void {
		if (!this.shadowRoot) return;
		this.shadowRoot.querySelectorAll('.ray-menu-container').forEach((container) => container.remove());
	}

	private _render(): void {
		if (!this.shadowRoot) return;
		this._clearContainer();
		this._renderedSlots = this._buildVisibleSlots();

		if (!this._isOpen || this._items.length === 0) return;

		const radius = this._getOuterRadius();
		const svgCenter = radius + SVG_PADDING;
		const container = document.createElement('div');
		container.className = 'ray-menu-container';
		container.setAttribute('data-neoview', 'true');
		container.setAttribute('role', 'menu');
		container.style.left = `${this._position.x}px`;
		container.style.top = `${this._position.y}px`;

		if (this._hasRenderedOnce) {
			container.style.animation = 'none';
			container.style.opacity = '1';
		}
		this._hasRenderedOnce = true;

		const svg = createMenuSvg(radius, false);
		svg.appendChild(createOuterRing(radius, this._config.startAngle, this._config.sweepAngle));
		svg.appendChild(createInnerRing(radius, this._config.innerRadius, false, this._config.startAngle, this._config.sweepAngle));

		for (const slot of this._renderedSlots) {
			const isHovered = slot.key === this._hoveredKey;
			const isSelected = Boolean(slot.item && this._selectedPath.includes(slot.item.id));
			const path = createArcPath(
				svgCenter,
				svgCenter,
				slot.innerRadius,
				slot.outerRadius,
				slot.startAngle + this._config.gap / 2,
				slot.endAngle - this._config.gap / 2,
				isHovered,
				slot.item?.disabled ?? false,
				slot.index
			);
			path.setAttribute('data-level', String(slot.level));
			path.setAttribute('data-selected', String(isSelected));
			path.setAttribute('data-empty', String(!slot.item));
			svg.appendChild(path);

			if (slot.item) {
				container.appendChild(this._createLabel(slot, isHovered, isSelected));
			}
		}

		container.appendChild(svg);
		const hint = document.createElement('div');
		hint.className = 'ray-menu-center-hint';
		hint.textContent = this._getCenterHint();
		container.appendChild(hint);
		this.shadowRoot.appendChild(container);
	}

	private _createLabel(slot: RuntimeSlot, isHovered: boolean, isSelected: boolean): HTMLDivElement {
		const item = slot.item!;
		const labelPosition = {
			x: ((slot.innerRadius + slot.outerRadius) / 2) * Math.cos(slot.centerAngle),
			y: ((slot.innerRadius + slot.outerRadius) / 2) * Math.sin(slot.centerAngle)
		};

		const label = document.createElement('div');
		label.className = 'ray-menu-label';
		label.style.left = `${labelPosition.x}px`;
		label.style.top = `${labelPosition.y}px`;
		label.setAttribute('role', 'menuitem');
		label.setAttribute('data-index', String(slot.index));
		label.setAttribute('data-level', String(slot.level));
		label.setAttribute('data-hovered', String(isHovered));
		label.setAttribute('data-focused', 'false');
		label.setAttribute('data-selected', String(isSelected));
		label.setAttribute('data-disabled', String(item.disabled || false));

		if (item.iconSvg) {
			const icon = document.createElement('span');
			icon.className = 'ray-menu-label-icon';
			icon.innerHTML = item.iconSvg;
			label.appendChild(icon);
		}

		const text = document.createElement('span');
		text.className = 'ray-menu-label-text';
		text.textContent = getShortLabel(item.label);
		label.appendChild(text);

		return label;
	}

	private _getCenterHint(): string {
		const item = findItemByPath(this._items, this._selectedPath);
		if (!item) return 'Move to choose';
		if (item.moveToMenuId) return 'Release to switch wheel';
		if (item.children?.length && !item.action) return 'Move outward';
		return 'Release to run';
	}
}

if (typeof customElements !== 'undefined' && !customElements.get('neoview-ray-menu')) {
	customElements.define('neoview-ray-menu', NeoViewRayMenu);
}

declare global {
	interface HTMLElementTagNameMap {
		'neoview-ray-menu': NeoViewRayMenu;
	}

	interface HTMLElementEventMap {
		'ray-moveto': CustomEvent<RayMoveToDetail>;
	}
}
