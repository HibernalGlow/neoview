import type { ActionBinding } from '$lib/stores/keybindings/types';
import {
	viewerPageInfoVisible,
	viewerProgressVisible
} from '$lib/stores/ui.svelte';
import { loadModeStore } from '$lib/stores/loadModeStore.svelte';
import { settingsManager, type AutoRotateMode } from '$lib/settings/settingsManager';
import { defaultSettings } from '$lib/settings/defaults';
import { showInfoToast } from '$lib/utils/toast';

type DynamicBackgroundMode = 'auto' | 'ambient' | 'aurora' | 'spotlight';
type BackgroundMode = 'solid' | DynamicBackgroundMode;
type SwitchToastSettings = NonNullable<ReturnType<typeof getSettings>['view']['switchToast']>;

const DYNAMIC_BACKGROUND_MODES: DynamicBackgroundMode[] = ['auto', 'ambient', 'aurora', 'spotlight'];
const AUTO_ROTATE_SEQUENCE: AutoRotateMode[] = [
	'none',
	'left',
	'right',
	'horizontalLeft',
	'horizontalRight',
	'forcedLeft',
	'forcedRight'
];

const VIEWER_TOGGLE_ACTIONS: ActionBinding[] = [
	{
		action: 'viewer.toggleDynamicBackground',
		name: '动态背景开关',
		category: '显示开关',
		description: '在固定背景和上次使用的动态背景之间切换',
		bindings: []
	},
	{
		action: 'viewer.cycleBackgroundMode',
		name: '循环背景模式',
		category: '显示开关',
		description: '依次切换固定、自动、流光、极光、聚光背景',
		bindings: []
	},
	{
		action: 'viewer.togglePageInfo',
		name: '页码信息开关',
		category: '显示开关',
		description: '显示或隐藏阅读器页码信息',
		bindings: []
	},
	{
		action: 'viewer.toggleProgressBar',
		name: '进度条开关',
		category: '显示开关',
		description: '显示或隐藏底部阅读进度条',
		bindings: []
	},
	{
		action: 'viewer.togglePageSwitchToast',
		name: '翻页提示开关',
		category: '显示开关',
		description: '显示或隐藏翻页时的页面提示',
		bindings: []
	},
	{
		action: 'viewer.toggleBookSwitchToast',
		name: '切书提示开关',
		category: '显示开关',
		description: '显示或隐藏切换书籍时的提示',
		bindings: []
	},
	{
		action: 'viewer.toggleBoundaryToast',
		name: '边界提示开关',
		category: '显示开关',
		description: '显示或隐藏第一页、最后一页边界提示',
		bindings: []
	},
	{
		action: 'viewer.toggleInfoOverlay',
		name: '信息浮层开关',
		category: '显示开关',
		description: '显示或隐藏图片信息浮层',
		bindings: []
	},
	{
		action: 'viewer.toggleHoverScroll',
		name: '悬停滚动开关',
		category: '显示开关',
		description: '开启或关闭鼠标悬停滚动',
		bindings: []
	},
	{
		action: 'viewer.toggleSidebarControl',
		name: '侧边浮动控制开关',
		category: '显示开关',
		description: '显示或隐藏侧边浮动控制器',
		bindings: []
	},
	{
		action: 'viewer.toggleCursorAutoHide',
		name: '光标自动隐藏开关',
		category: '显示开关',
		description: '开启或关闭阅读器光标自动隐藏',
		bindings: []
	},
	{
		action: 'viewer.toggleProgressBarGlow',
		name: '进度条发光开关',
		category: '显示开关',
		description: '开启或关闭进度条发光效果',
		bindings: []
	},
	{
		action: 'viewer.toggleRenderMode',
		name: '渲染模式切换',
		category: '显示开关',
		description: '在 img 和 canvas 渲染之间切换',
		bindings: []
	},
	{
		action: 'viewer.toggleAutoRotate',
		name: '自动旋转模式切换',
		category: '显示开关',
		description: '循环切换自动旋转模式',
		bindings: []
	}
];

export function getViewerToggleActionBindings(): ActionBinding[] {
	return VIEWER_TOGGLE_ACTIONS.map((binding) => ({
		...binding,
		bindings: binding.bindings.map((input) => ({ ...input })),
		contextBindings: binding.contextBindings?.map((contextBinding) => ({
			...contextBinding,
			input: { ...contextBinding.input }
		}))
	}));
}

function notify(label: string, enabled?: boolean): void {
	if (enabled === undefined) {
		showInfoToast(label);
		return;
	}
	showInfoToast(`${label}: ${enabled ? '开' : '关'}`);
}

function getSettings() {
	return settingsManager.getSettings();
}

function updateView(updates: Partial<ReturnType<typeof getSettings>['view']>): void {
	settingsManager.updateNestedSettings('view', updates);
}

function updateImage(updates: Partial<ReturnType<typeof getSettings>['image']>): void {
	settingsManager.updateNestedSettings('image', updates);
}

function updatePanels(updates: Partial<ReturnType<typeof getSettings>['panels']>): void {
	settingsManager.updateNestedSettings('panels', updates);
}

function isDynamicBackgroundMode(mode: BackgroundMode): mode is DynamicBackgroundMode {
	return DYNAMIC_BACKGROUND_MODES.includes(mode as DynamicBackgroundMode);
}

function getSwitchToastSettings(): SwitchToastSettings {
	return {
		...defaultSettings.view.switchToast!,
		...(getSettings().view.switchToast ?? {})
	};
}

function toggleDynamicBackground(): void {
	const settings = getSettings();
	const currentMode = settings.view.backgroundMode ?? 'solid';

	if (isDynamicBackgroundMode(currentMode)) {
		updateView({
			backgroundMode: 'solid',
			lastDynamicBackgroundMode: currentMode
		});
		notify('动态背景', false);
		return;
	}

	const restoreMode = settings.view.lastDynamicBackgroundMode ?? 'ambient';
	updateView({ backgroundMode: restoreMode });
	notify('动态背景', true);
}

function cycleBackgroundMode(): void {
	const settings = getSettings();
	const sequence: BackgroundMode[] = ['solid', ...DYNAMIC_BACKGROUND_MODES];
	const current = settings.view.backgroundMode ?? 'solid';
	const next = sequence[(sequence.indexOf(current) + 1) % sequence.length] ?? 'solid';
	const lastDynamicBackgroundMode = isDynamicBackgroundMode(next)
		? next
		: settings.view.lastDynamicBackgroundMode;
	updateView({
		backgroundMode: next,
		lastDynamicBackgroundMode
	});
	notify(`背景模式: ${next}`);
}

function toggleSwitchToastField(
	field: 'enablePage' | 'enableBook' | 'enableBoundaryToast',
	label: string
): void {
	const current = getSwitchToastSettings();
	const nextValue = !(current[field] ?? false);
	updateView({
		switchToast: {
			...current,
			[field]: nextValue
		}
	});
	notify(label, nextValue);
}

function toggleInfoOverlay(): void {
	const settings = getSettings();
	const current = settings.view.infoOverlay ?? {
		enabled: false,
		opacity: 0.85,
		showBorder: false
	};
	const next = !current.enabled;
	updateView({
		infoOverlay: {
			...current,
			enabled: next
		}
	});
	notify('信息浮层', next);
}

function toggleSidebarControl(): void {
	const settings = getSettings();
	const current = settings.view.sidebarControl ?? {
		enabled: true,
		position: { x: 100, y: 100 }
	};
	const next = !current.enabled;
	updateView({
		sidebarControl: {
			...current,
			enabled: next
		}
	});
	notify('侧边浮动控制', next);
}

function toggleAutoRotate(): void {
	const settings = getSettings();
	const current = settings.view.autoRotate?.mode ?? 'none';
	const next =
		AUTO_ROTATE_SEQUENCE[
			(AUTO_ROTATE_SEQUENCE.indexOf(current) + 1) % AUTO_ROTATE_SEQUENCE.length
		] ?? 'none';
	updateView({ autoRotate: { mode: next } });
	notify(`自动旋转: ${next}`);
}

export function executeViewerToggleAction(action: string): boolean {
	switch (action) {
		case 'viewer.toggleDynamicBackground':
			toggleDynamicBackground();
			return true;
		case 'viewer.cycleBackgroundMode':
			cycleBackgroundMode();
			return true;
		case 'viewer.togglePageInfo':
			viewerPageInfoVisible.update((value) => {
				notify('页码信息', !value);
				return !value;
			});
			return true;
		case 'viewer.toggleProgressBar':
			viewerProgressVisible.update((value) => {
				notify('进度条', !value);
				return !value;
			});
			return true;
		case 'viewer.togglePageSwitchToast':
			toggleSwitchToastField('enablePage', '翻页提示');
			return true;
		case 'viewer.toggleBookSwitchToast':
			toggleSwitchToastField('enableBook', '切书提示');
			return true;
		case 'viewer.toggleBoundaryToast':
			toggleSwitchToastField('enableBoundaryToast', '边界提示');
			return true;
		case 'viewer.toggleInfoOverlay':
			toggleInfoOverlay();
			return true;
		case 'viewer.toggleHoverScroll': {
			const settings = getSettings();
			const next = !(settings.image.hoverScrollEnabled ?? false);
			updateImage({ hoverScrollEnabled: next });
			notify('悬停滚动', next);
			return true;
		}
		case 'viewer.toggleSidebarControl':
			toggleSidebarControl();
			return true;
		case 'viewer.toggleCursorAutoHide': {
			const settings = getSettings();
			const current = settings.view.mouseCursor ?? {
				autoHide: true,
				hideDelay: 1,
				showMovementThreshold: 26,
				showOnButtonClick: true
			};
			const next = !current.autoHide;
			updateView({ mouseCursor: { ...current, autoHide: next } });
			notify('光标自动隐藏', next);
			return true;
		}
		case 'viewer.toggleProgressBarGlow': {
			const settings = getSettings();
			const next = !(settings.panels.progressBarGlow ?? false);
			updatePanels({ progressBarGlow: next });
			notify('进度条发光', next);
			return true;
		}
		case 'viewer.toggleRenderMode':
			loadModeStore.toggleRenderMode();
			notify(`渲染模式: ${loadModeStore.renderMode}`);
			return true;
		case 'viewer.toggleAutoRotate':
			toggleAutoRotate();
			return true;
		default:
			return false;
	}
}
