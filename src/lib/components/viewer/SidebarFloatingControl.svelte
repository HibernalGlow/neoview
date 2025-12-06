<script lang="ts">
/**
 * 边栏浮动控制器
 * 可拖动的控制器，用于快速控制上下左右边栏的显示/隐藏
 * 单击：切换展开/隐藏
 * 右键：锁定当前状态（锁定展开或锁定隐藏）
 */
import { onDestroy } from 'svelte';
import {
	topToolbarLockState,
	bottomBarLockState,
	leftSidebarLockState,
	rightSidebarLockState,
	leftSidebarOpen,
	rightSidebarOpen,
	type SidebarLockState
} from '$lib/stores/ui.svelte';
import { settingsManager, type NeoViewSettings } from '$lib/settings/settingsManager';
import { PanelTop, PanelBottom, PanelLeft, PanelRight, Lock, LockOpen, GripVertical } from '@lucide/svelte';

// 控制器状态
let enabled = $state(false);
let position = $state<{ x: number; y: number }>({ x: 100, y: 100 });

// 拖拽状态
let isDragging = false;
let dragStartMouseX = 0;
let dragStartMouseY = 0;
let dragStartPosX = 0;
let dragStartPosY = 0;

// 边栏锁定状态（三态：null = 自动，true = 锁定展开，false = 锁定隐藏）
let topLock = $state<SidebarLockState>(null);
let bottomLock = $state<SidebarLockState>(null);
let leftLock = $state<SidebarLockState>(null);
let rightLock = $state<SidebarLockState>(null);
let leftOpen = $state(false);
let rightOpen = $state(false);

// 临时显示状态（用于单击切换）
let topVisible = $state(false);
let bottomVisible = $state(false);

// 订阅 stores
const unsubTopLock = topToolbarLockState.subscribe(v => {
	topLock = v;
	if (v !== null) topVisible = v;
});
const unsubBottomLock = bottomBarLockState.subscribe(v => {
	bottomLock = v;
	if (v !== null) bottomVisible = v;
});
const unsubLeftLock = leftSidebarLockState.subscribe(v => leftLock = v);
const unsubRightLock = rightSidebarLockState.subscribe(v => rightLock = v);
const unsubLeftOpen = leftSidebarOpen.subscribe(v => leftOpen = v);
const unsubRightOpen = rightSidebarOpen.subscribe(v => rightOpen = v);

function syncFromSettings() {
	const s = settingsManager.getSettings();
	const ctrl = s.view?.sidebarControl;
	enabled = ctrl?.enabled ?? false;
	position = ctrl?.position ?? { x: 100, y: 100 };
}

syncFromSettings();

const settingsListener = (s: NeoViewSettings) => {
	const ctrl = s.view?.sidebarControl;
	enabled = ctrl?.enabled ?? false;
	position = ctrl?.position ?? { x: 100, y: 100 };
};

settingsManager.addListener(settingsListener);

onDestroy(() => {
	unsubTopLock();
	unsubBottomLock();
	unsubLeftLock();
	unsubRightLock();
	unsubLeftOpen();
	unsubRightOpen();
	settingsManager.removeListener(settingsListener);
});

function savePosition() {
	const current = settingsManager.getSettings();
	const prev = current.view?.sidebarControl ?? { enabled: true, position: { x: 100, y: 100 } };
	settingsManager.updateNestedSettings('view', {
		sidebarControl: { ...prev, position }
	});
}

function handleDragStart(event: MouseEvent) {
	if (!enabled) return;
	event.preventDefault();
	event.stopPropagation();
	isDragging = true;
	dragStartMouseX = event.clientX;
	dragStartMouseY = event.clientY;
	dragStartPosX = position.x;
	dragStartPosY = position.y;

	const handleMouseMove = (e: MouseEvent) => {
		if (!isDragging) return;
		const dx = e.clientX - dragStartMouseX;
		const dy = e.clientY - dragStartMouseY;
		position = {
			x: Math.max(0, Math.min(window.innerWidth - 200, dragStartPosX + dx)),
			y: Math.max(0, Math.min(window.innerHeight - 50, dragStartPosY + dy))
		};
	};

	const handleMouseUp = () => {
		isDragging = false;
		savePosition();
		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('mouseup', handleMouseUp);
	};

	window.addEventListener('mousemove', handleMouseMove);
	window.addEventListener('mouseup', handleMouseUp);
}

// 单击：切换显示/隐藏（如果已锁定则解锁并切换）
function handleTopClick(e: MouseEvent) {
	e.preventDefault();
	e.stopPropagation();
	if (topLock !== null) {
		// 已锁定，解锁并切换
		topToolbarLockState.set(null);
		topVisible = !topVisible;
	} else {
		// 未锁定，切换临时状态
		topVisible = !topVisible;
	}
}

// 右键：锁定当前状态
function handleTopContextMenu(e: MouseEvent) {
	e.preventDefault();
	e.stopPropagation();
	if (topLock !== null) {
		// 已锁定，解锁
		topToolbarLockState.set(null);
	} else {
		// 未锁定，锁定当前状态
		topToolbarLockState.set(topVisible);
	}
}

function handleBottomClick(e: MouseEvent) {
	e.preventDefault();
	e.stopPropagation();
	if (bottomLock !== null) {
		bottomBarLockState.set(null);
		bottomVisible = !bottomVisible;
	} else {
		bottomVisible = !bottomVisible;
	}
}

function handleBottomContextMenu(e: MouseEvent) {
	e.preventDefault();
	e.stopPropagation();
	if (bottomLock !== null) {
		bottomBarLockState.set(null);
	} else {
		bottomBarLockState.set(bottomVisible);
	}
}

function handleLeftClick(e: MouseEvent) {
	e.preventDefault();
	e.stopPropagation();
	if (leftLock !== null) {
		leftSidebarLockState.set(null);
	}
	leftSidebarOpen.update(v => !v);
}

function handleLeftContextMenu(e: MouseEvent) {
	e.preventDefault();
	e.stopPropagation();
	if (leftLock !== null) {
		leftSidebarLockState.set(null);
	} else {
		leftSidebarLockState.set(leftOpen);
	}
}

function handleRightClick(e: MouseEvent) {
	e.preventDefault();
	e.stopPropagation();
	if (rightLock !== null) {
		rightSidebarLockState.set(null);
	}
	rightSidebarOpen.update(v => !v);
}

function handleRightContextMenu(e: MouseEvent) {
	e.preventDefault();
	e.stopPropagation();
	if (rightLock !== null) {
		rightSidebarLockState.set(null);
	} else {
		rightSidebarLockState.set(rightOpen);
	}
}

// 获取按钮样式（三态）
function getButtonClass(lockState: SidebarLockState, isOpen?: boolean): string {
	if (lockState === true) return 'bg-primary text-primary-foreground'; // 锁定展开
	if (lockState === false) return 'bg-destructive/80 text-destructive-foreground'; // 锁定隐藏
	if (isOpen) return 'bg-secondary text-secondary-foreground'; // 自动模式，当前展开
	return 'bg-muted/60 text-muted-foreground hover:bg-muted'; // 自动模式，当前隐藏
}

// 获取状态文字
function getStateText(lockState: SidebarLockState, isOpen: boolean): string {
	if (lockState === true) return '锁定展开';
	if (lockState === false) return '锁定隐藏';
	return isOpen ? '展开' : '隐藏';
}
</script>

{#if enabled}
	<div
		class="fixed z-50 pointer-events-auto"
		style:left="{position.x}px"
		style:top="{position.y}px"
	>
		<div
			class="flex items-center gap-0.5 rounded-lg border border-border/60 bg-background/80 backdrop-blur-sm shadow-lg p-1"
		>
			<!-- 拖拽手柄 -->
			<button
				type="button"
				class="p-1 cursor-move text-muted-foreground hover:text-foreground transition-colors"
				onmousedown={handleDragStart}
				aria-label="拖动控制器"
			>
				<GripVertical class="h-4 w-4" />
			</button>

			<!-- 上边栏 -->
			<button
				type="button"
				class="p-1.5 rounded transition-colors relative {getButtonClass(topLock, topVisible)}"
				onclick={handleTopClick}
				oncontextmenu={handleTopContextMenu}
				title={getStateText(topLock, topVisible) + '，单击切换，右键锁定'}
			>
				<PanelTop class="h-4 w-4" />
				{#if topLock !== null}
					<Lock class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5" />
				{/if}
			</button>

			<!-- 下边栏 -->
			<button
				type="button"
				class="p-1.5 rounded transition-colors relative {getButtonClass(bottomLock, bottomVisible)}"
				onclick={handleBottomClick}
				oncontextmenu={handleBottomContextMenu}
				title={getStateText(bottomLock, bottomVisible) + '，单击切换，右键锁定'}
			>
				<PanelBottom class="h-4 w-4" />
				{#if bottomLock !== null}
					<Lock class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5" />
				{/if}
			</button>

			<!-- 左边栏 -->
			<button
				type="button"
				class="p-1.5 rounded transition-colors relative {getButtonClass(leftLock, leftOpen)}"
				onclick={handleLeftClick}
				oncontextmenu={handleLeftContextMenu}
				title={getStateText(leftLock, leftOpen) + '，单击切换，右键锁定'}
			>
				<PanelLeft class="h-4 w-4" />
				{#if leftLock !== null}
					<Lock class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5" />
				{/if}
			</button>

			<!-- 右边栏 -->
			<button
				type="button"
				class="p-1.5 rounded transition-colors relative {getButtonClass(rightLock, rightOpen)}"
				onclick={handleRightClick}
				oncontextmenu={handleRightContextMenu}
				title={getStateText(rightLock, rightOpen) + '，单击切换，右键锁定'}
			>
				<PanelRight class="h-4 w-4" />
				{#if rightLock !== null}
					<Lock class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5" />
				{/if}
			</button>
		</div>
	</div>
{/if}
